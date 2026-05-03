const { findReferences, replaceReferences, buildVaultUrl } = require('./reference');
const { walkStrings } = require('./walk');
const AzureKeyVaultProvider = require('./providers/azure-keyvault');
const { ERROR_CODES, FRIENDLY_MESSAGES, classifyError } = require('./error-classifier');

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

// Tests a single {{azkv://...}} reference end-to-end: parses it, runs the
// auth chain (which may prompt the user the first time), fetches the
// secret, and DISCARDS the value. Returns a stable shape the UI can switch
// on without ever seeing the resolved value:
//
//   { ok: true }
//   { ok: false, errorCode, message }
//
// Successful test calls populate the resolver cache, so the next real
// request that uses the same reference is a cache hit.
const testReference = async (referenceText, options = {}) => {
  const cfg = readAzureKeyVaultConfig(options.brunoConfig, options.mode);
  const text = typeof referenceText === 'string' ? referenceText : '';
  const refs = findReferences(text, { vaultBaseUrlTemplate: cfg.vaultBaseUrlTemplate });
  if (refs.length === 0) {
    return {
      ok: false,
      errorCode: ERROR_CODES.INVALID_REFERENCE,
      message: FRIENDLY_MESSAGES.INVALID_REFERENCE
    };
  }
  const ref = refs[0];
  const provider = options.provider || getAzureKeyVaultProvider(cfg);
  try {
    await provider.resolve(ref);
    return { ok: true };
  } catch (err) {
    return classifyError(err);
  }
};

// Resolves a "store" — accepts either a stored definition object
// ({ vault, tenantId? }) from bruno.json's secretProviders.azureKeyVault.stores
// array, OR just a vault short-name / full host. Returns the absolute vault
// URL plus a config object scoped to that store's auth overrides (if any).
const resolveStore = (storeOrVault, options = {}) => {
  const baseCfg = readAzureKeyVaultConfig(options.brunoConfig, options.mode);
  let vault;
  let storeOverrides = {};
  if (typeof storeOrVault === 'string') {
    vault = storeOrVault;
  } else if (storeOrVault && typeof storeOrVault === 'object') {
    vault = storeOrVault.vault;
    if (storeOrVault.tenantId) storeOverrides.tenantId = storeOrVault.tenantId;
    if (storeOrVault.clientId) storeOverrides.clientId = storeOrVault.clientId;
  }
  if (!vault) {
    return { error: { ok: false, errorCode: ERROR_CODES.CONFIG, message: 'No vault specified.' } };
  }
  const cfg = { ...baseCfg, ...storeOverrides };
  return { vault, vaultUrl: buildVaultUrl(vault, cfg.vaultBaseUrlTemplate), cfg };
};

// Tests a store: does the auth chain succeed AND do we have list-secrets
// permission? Returns the same {ok, errorCode, message} shape as
// testReference.
const testVaultAccess = async (storeOrVault, options = {}) => {
  const resolved = resolveStore(storeOrVault, options);
  if (resolved.error) return resolved.error;
  const { vaultUrl, cfg } = resolved;
  const provider = options.provider || getAzureKeyVaultProvider(cfg);
  try {
    await provider.testStore({ vaultUrl });
    return { ok: true };
  } catch (err) {
    return classifyError(err);
  }
};

// Lists secret names in a vault. Returns
// { ok, secrets: [{name, enabled, contentType, expiresOn, updatedOn}], hasMore }
// on success, or { ok: false, errorCode, message } on auth/network/etc failure.
const listSecretsInVault = async (storeOrVault, options = {}) => {
  const resolved = resolveStore(storeOrVault, options);
  if (resolved.error) return resolved.error;
  const { vaultUrl, cfg } = resolved;
  const provider = options.provider || getAzureKeyVaultProvider(cfg);
  try {
    const result = await provider.listSecrets({ vaultUrl, limit: options.limit });
    return { ok: true, ...result };
  } catch (err) {
    return classifyError(err);
  }
};

const listSecretVersions = async (storeOrVault, secretName, options = {}) => {
  const resolved = resolveStore(storeOrVault, options);
  if (resolved.error) return resolved.error;
  const { vaultUrl, cfg } = resolved;
  const provider = options.provider || getAzureKeyVaultProvider(cfg);
  try {
    const versions = await provider.listVersions({ vaultUrl, secretName });
    return { ok: true, versions };
  } catch (err) {
    return classifyError(err);
  }
};

const clearProviderPool = () => {
  providerPool.clear();
};

module.exports = {
  resolveExternalSecrets,
  testReference,
  testVaultAccess,
  listSecretsInVault,
  listSecretVersions,
  readAzureKeyVaultConfig,
  getAzureKeyVaultProvider,
  resolveStore,
  clearProviderPool,
  ERROR_CODES,
  FRIENDLY_MESSAGES,
  classifyError,
  // re-exports for unit tests / advanced callers
  AzureKeyVaultProvider,
  findReferences,
  replaceReferences,
  buildVaultUrl
};
