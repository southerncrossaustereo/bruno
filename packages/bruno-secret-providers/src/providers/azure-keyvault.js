const { SecretCache } = require('../cache');
const { buildCredential } = require('../auth/azure-credential');

// One credential and one cache per (mode, tenantId, clientId) tuple.
// Re-using the credential lets MSAL reuse its in-memory token cache, which
// matters for InteractiveBrowserCredential (one prompt per session).
const credentialPool = new Map();
const clientPool = new Map();

const credentialKey = (cfg) => `${cfg.mode}|${cfg.tenantId || ''}|${cfg.clientId || ''}|${JSON.stringify(cfg.auth || {})}`;

const getCredential = (cfg) => {
  const key = credentialKey(cfg);
  if (!credentialPool.has(key)) {
    credentialPool.set(key, buildCredential(cfg));
  }
  return credentialPool.get(key);
};

const getClient = (vaultUrl, cfg) => {
  const key = `${vaultUrl}|${credentialKey(cfg)}`;
  if (!clientPool.has(key)) {
    const { SecretClient } = require('@azure/keyvault-secrets');
    clientPool.set(key, new SecretClient(vaultUrl, getCredential(cfg)));
  }
  return clientPool.get(key);
};

class AzureKeyVaultProvider {
  constructor(config = {}) {
    this.config = {
      mode: config.mode || 'desktop',
      tenantId: config.tenantId,
      clientId: config.clientId,
      vaultBaseUrlTemplate: config.vaultBaseUrlTemplate,
      auth: config.auth || {}
    };
    this.cache = new SecretCache({
      ttlMs: (config.cacheTtlSeconds ?? 300) * 1000
    });
  }

  // ref: { vault, secret, version, vaultUrl, cacheKey }
  async resolve(ref) {
    return this.cache.getOrFetch(ref.cacheKey, async () => {
      const client = getClient(ref.vaultUrl, this.config);
      const result = await client.getSecret(ref.secret, ref.version ? { version: ref.version } : undefined);
      if (typeof result?.value !== 'string') {
        throw new Error(`Azure Key Vault returned no value for ${ref.vault}/${ref.secret}`);
      }
      return result.value;
    });
  }

  // Lists secret *names* (not values) in a vault. Returns
  // { secrets: [{name, enabled, contentType, expiresOn, updatedOn}], hasMore }.
  //
  // Key Vault's REST API has no server-side name filter, so when the caller
  // supplies `search` we iterate pages here and keep matches (case-insensitive
  // substring on the secret name). Two stop conditions, both surfaced via
  // hasMore:
  //   - we've collected `limit` matches (default 200)
  //   - we've scanned `scanLimit` names without exhausting the vault
  //     (default 5000 when searching, Infinity otherwise — without a query
  //     we just return the first `limit` names like before)
  async listSecrets({ vaultUrl, limit = 200, search, scanLimit } = {}) {
    if (!vaultUrl) throw new Error('vaultUrl is required');
    const client = getClient(vaultUrl, this.config);
    const q = typeof search === 'string' ? search.trim().toLowerCase() : '';
    const effectiveScanLimit = scanLimit ?? (q ? 5000 : limit);
    const secrets = [];
    let scanned = 0;
    for await (const props of client.listPropertiesOfSecrets()) {
      if (scanned >= effectiveScanLimit) {
        return { secrets, hasMore: true };
      }
      scanned++;
      if (q && !props.name.toLowerCase().includes(q)) continue;
      secrets.push({
        name: props.name,
        enabled: props.enabled !== false,
        contentType: props.contentType || null,
        expiresOn: props.expiresOn ? props.expiresOn.toISOString() : null,
        updatedOn: props.updatedOn ? props.updatedOn.toISOString() : null
      });
      if (secrets.length >= limit) {
        return { secrets, hasMore: true };
      }
    }
    return { secrets, hasMore: false };
  }

  // Lists all versions of a single secret. Returns the version IDs (the
  // last path segment of the version URL) plus enabled/created/expires.
  async listVersions({ vaultUrl, secretName } = {}) {
    if (!vaultUrl || !secretName) throw new Error('vaultUrl and secretName are required');
    const client = getClient(vaultUrl, this.config);
    const versions = [];
    for await (const props of client.listPropertiesOfSecretVersions(secretName)) {
      versions.push({
        version: props.version,
        enabled: props.enabled !== false,
        createdOn: props.createdOn ? props.createdOn.toISOString() : null,
        expiresOn: props.expiresOn ? props.expiresOn.toISOString() : null
      });
    }
    // Newest first — listPropertiesOfSecretVersions order isn't guaranteed.
    versions.sort((a, b) => (b.createdOn || '').localeCompare(a.createdOn || ''));
    return versions;
  }

  // Verifies the auth chain works AND we have list-secrets permission on
  // the vault. We attempt to read one secret name — that's the cheapest
  // 200 we can ask for. Empty vaults still return a successful page.
  async testStore({ vaultUrl } = {}) {
    if (!vaultUrl) throw new Error('vaultUrl is required');
    const client = getClient(vaultUrl, this.config);
    const iter = client.listPropertiesOfSecrets();
    // Pull only the first page so we don't enumerate a 10k-secret vault.
    await iter.next();
  }
}

module.exports = AzureKeyVaultProvider;
module.exports.__internal = { credentialPool, clientPool, getCredential, getClient };
