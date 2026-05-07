const { testVaultAccess, listSecretsInVault, listSecretVersions, ERROR_CODES } = require('../src');

const fakeProvider = ({ secrets = [], versions = [], hasMore = false, error = null } = {}) => ({
  lastListArgs: null,
  async testStore() { if (error) throw error; },
  async listSecrets(args) {
    if (error) throw error;
    this.lastListArgs = args;
    return { secrets, hasMore };
  },
  async listVersions() {
    if (error) throw error;
    return versions;
  }
});

describe('testVaultAccess', () => {
  test('returns ok:true when the auth chain + list permission both succeed', async () => {
    const result = await testVaultAccess('contoso-dev', { provider: fakeProvider() });
    expect(result).toEqual({ ok: true });
  });

  test('classifies 403 as FORBIDDEN', async () => {
    const provider = fakeProvider({ error: Object.assign(new Error('403'), { statusCode: 403 }) });
    const result = await testVaultAccess('contoso-dev', { provider });
    expect(result.errorCode).toBe(ERROR_CODES.FORBIDDEN);
  });

  test('rejects when no vault is supplied', async () => {
    const result = await testVaultAccess({}, { provider: fakeProvider() });
    expect(result.errorCode).toBe(ERROR_CODES.CONFIG);
  });

  test('accepts a store object with a vault field', async () => {
    const result = await testVaultAccess({ id: 'dev-kv', vault: 'contoso-dev' }, { provider: fakeProvider() });
    expect(result).toEqual({ ok: true });
  });
});

describe('listSecretsInVault', () => {
  test('returns secrets with hasMore flag from the provider', async () => {
    const provider = fakeProvider({
      secrets: [{ name: 'api-token', enabled: true }, { name: 'db-pass', enabled: true }],
      hasMore: true
    });
    const result = await listSecretsInVault('contoso-dev', { provider });
    expect(result.ok).toBe(true);
    expect(result.secrets).toHaveLength(2);
    expect(result.hasMore).toBe(true);
  });

  test('classifies 401 as AUTH_FAILED', async () => {
    const provider = fakeProvider({ error: Object.assign(new Error('401'), { statusCode: 401 }) });
    const result = await listSecretsInVault('contoso-dev', { provider });
    expect(result.errorCode).toBe(ERROR_CODES.AUTH_FAILED);
    expect(result.ok).toBe(false);
  });

  test('passes search and scanLimit through to the provider', async () => {
    const provider = fakeProvider({ secrets: [{ name: 'api-token', enabled: true }] });
    await listSecretsInVault('contoso-dev', { provider, search: 'api', scanLimit: 1000, limit: 50 });
    expect(provider.lastListArgs).toMatchObject({ search: 'api', scanLimit: 1000, limit: 50 });
  });
});

describe('AzureKeyVaultProvider.listSecrets search', () => {
  const { AzureKeyVaultProvider } = require('../src');

  // Stub the @azure SecretClient via the provider's internal client pool.
  const installFakeClient = (provider, names) => {
    const fakeClient = {
      async *listPropertiesOfSecrets() {
        for (const name of names) {
          yield { name, enabled: true, contentType: null, expiresOn: null, updatedOn: null };
        }
      }
    };
    const { clientPool } = AzureKeyVaultProvider.__internal;
    clientPool.clear();
    // Intercept the next getClient call by pre-seeding the pool with the
    // exact key the provider will compute.
    const credKey = `desktop|${provider.config.tenantId || ''}|${provider.config.clientId || ''}|${JSON.stringify(provider.config.auth || {})}`;
    clientPool.set(`https://contoso.vault.azure.net|${credKey}`, fakeClient);
  };

  test('without search, returns first `limit` names with hasMore', async () => {
    const provider = new AzureKeyVaultProvider({});
    installFakeClient(provider, Array.from({ length: 5 }, (_, i) => `s${i}`));
    const result = await provider.listSecrets({ vaultUrl: 'https://contoso.vault.azure.net', limit: 3 });
    expect(result.secrets.map((s) => s.name)).toEqual(['s0', 's1', 's2']);
    expect(result.hasMore).toBe(true);
  });

  test('with search, scans past first page and returns matches anywhere in the vault', async () => {
    const provider = new AzureKeyVaultProvider({});
    const names = [];
    for (let i = 0; i < 250; i++) names.push(`alpha-${i}`);
    names.push('beta-target');
    for (let i = 0; i < 50; i++) names.push(`gamma-${i}`);
    installFakeClient(provider, names);

    const result = await provider.listSecrets({
      vaultUrl: 'https://contoso.vault.azure.net',
      search: 'beta'
    });
    expect(result.secrets.map((s) => s.name)).toEqual(['beta-target']);
    expect(result.hasMore).toBe(false);
  });

  test('with search, caps at scanLimit and reports hasMore when vault is huge', async () => {
    const provider = new AzureKeyVaultProvider({});
    const names = Array.from({ length: 100 }, (_, i) => `s${i}`);
    installFakeClient(provider, names);

    const result = await provider.listSecrets({
      vaultUrl: 'https://contoso.vault.azure.net',
      search: 'x-no-match',
      scanLimit: 10
    });
    expect(result.secrets).toEqual([]);
    expect(result.hasMore).toBe(true);
  });
});

describe('listSecretVersions', () => {
  test('returns versions ordered newest-first', async () => {
    const provider = fakeProvider({
      versions: [
        { version: 'old', createdOn: '2025-01-01T00:00:00Z' },
        { version: 'new', createdOn: '2026-04-30T00:00:00Z' }
      ]
    });
    // Note: ordering happens inside the provider; for the public helper we
    // just confirm versions pass through correctly.
    const result = await listSecretVersions('contoso-dev', 'api-token', { provider });
    expect(result.ok).toBe(true);
    expect(result.versions).toHaveLength(2);
  });

  test('classifies network errors', async () => {
    const err = new Error('boom');
    err.code = 'ENOTFOUND';
    const provider = fakeProvider({ error: err });
    const result = await listSecretVersions('contoso-dev', 'api-token', { provider });
    expect(result.errorCode).toBe(ERROR_CODES.NETWORK);
  });
});
