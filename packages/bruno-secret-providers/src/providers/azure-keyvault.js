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

}

module.exports = AzureKeyVaultProvider;
module.exports.__internal = { credentialPool, clientPool, getCredential, getClient };
