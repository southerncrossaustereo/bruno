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

  // Lists secret *names* (not values) in a vault. Paginated — caller can
  // iterate. Returns { secrets: [{name, enabled, contentType, expiresOn,
  // updatedOn}], hasMore }.
  //
  // We deliberately don't support a server-side search filter because Key
  // Vault's REST API doesn't have one — clients filter client-side. We
  // page through up to `limit` enabled secrets and let the UI search
  // within that.
  async listSecrets({ vaultUrl, limit = 200 } = {}) {
    if (!vaultUrl) throw new Error('vaultUrl is required');
    const client = getClient(vaultUrl, this.config);
    const secrets = [];
    let count = 0;
    for await (const props of client.listPropertiesOfSecrets()) {
      if (count >= limit) {
        return { secrets, hasMore: true };
      }
      secrets.push({
        name: props.name,
        enabled: props.enabled !== false,
        contentType: props.contentType || null,
        expiresOn: props.expiresOn ? props.expiresOn.toISOString() : null,
        updatedOn: props.updatedOn ? props.updatedOn.toISOString() : null
      });
      count++;
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
