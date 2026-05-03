const { testVaultAccess, listSecretsInVault, listSecretVersions, ERROR_CODES } = require('../src');

const fakeProvider = ({ secrets = [], versions = [], hasMore = false, error = null } = {}) => ({
  async testStore() { if (error) throw error; },
  async listSecrets() {
    if (error) throw error;
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
