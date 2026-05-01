const { findReferences, replaceReferences } = require('./reference');
const { walkStrings } = require('./walk');
const AzureKeyVaultProvider = require('./providers/azure-keyvault');

// One provider instance per resolved (mode, tenantId, clientId, vaultBaseUrlTemplate) tuple.
const providerPool = new Map();

const providerKey = (cfg) =>
  `${cfg.mode}|${cfg.tenantId || ''}|${cfg.clientId || ''}|${cfg.vaultBaseUrlTemplate || ''}`;

const getAzureKeyVaultProvider = (cfg) => {
  const key = providerKey(cfg);
  if (!providerPool.has(key)) {
    providerPool.set(key, new AzureKeyVaultProvider(cfg));
  }
  return providerPool.get(key);
};

const readAzureKeyVaultConfig = (brunoConfig, mode) => {
  const raw = (brunoConfig && brunoConfig.secretProviders && brunoConfig.secretProviders.azureKeyVault) || {};
  return {
    mode: mode || 'desktop',
    tenantId: raw.tenantId,
    clientId: raw.clientId,
    vaultBaseUrlTemplate: raw.vaultBaseUrlTemplate,
    cacheTtlSeconds: raw.cacheTtlSeconds,
    auth: raw.auth || {}
  };
};

// Walks `target`, finds every {{azkv://...}} reference in any string leaf,
// fetches them in parallel (deduped + cached), then mutates the target in
// place to substitute resolved values.
//
// Returns { resolved: <count>, errors: [{ raw, message }] }.
//
// On any per-reference error, the original {{...}} token is left in place so
// the existing variable interpolator can still report a missing-variable
// warning rather than silently sending an empty string.
const resolveExternalSecrets = async (target, options = {}) => {
  if (!target || typeof target !== 'object') {
    return { resolved: 0, errors: [] };
  }

  const cfg = readAzureKeyVaultConfig(options.brunoConfig, options.mode);

  // Gather unique references across all string leaves.
  const refsByRaw = new Map();
  walkStrings(target, (str) => {
    if (str.indexOf('azkv://') === -1) return;
    for (const ref of findReferences(str, { vaultBaseUrlTemplate: cfg.vaultBaseUrlTemplate })) {
      if (!refsByRaw.has(ref.raw)) refsByRaw.set(ref.raw, ref);
    }
  });

  if (refsByRaw.size === 0) {
    return { resolved: 0, errors: [] };
  }

  const provider = options.provider || getAzureKeyVaultProvider(cfg);

  const errors = [];
  const resolvedByRaw = new Map();

  await Promise.all(Array.from(refsByRaw.values()).map(async (ref) => {
    try {
      const value = await provider.resolve(ref);
      resolvedByRaw.set(ref.raw, value);
    } catch (err) {
      errors.push({ raw: ref.raw, message: err && err.message ? err.message : String(err) });
    }
  }));

  if (resolvedByRaw.size > 0) {
    walkStrings(target, (str, set) => {
      if (str.indexOf('azkv://') === -1) return;
      const next = replaceReferences(str, resolvedByRaw);
      if (next !== str) set(next);
    });
  }

  return { resolved: resolvedByRaw.size, errors };
};

const clearProviderPool = () => {
  providerPool.clear();
};

module.exports = {
  resolveExternalSecrets,
  readAzureKeyVaultConfig,
  getAzureKeyVaultProvider,
  clearProviderPool,
  // re-exports for unit tests / advanced callers
  AzureKeyVaultProvider,
  findReferences,
  replaceReferences
};
