const { findReferences, replaceReferences, buildVaultUrl } = require('./reference');
const { walkStrings } = require('./walk');
const AzureKeyVaultProvider = require('./providers/azure-keyvault');
const { ERROR_CODES, FRIENDLY_MESSAGES, classifyError } = require('./error-classifier');
const { getInteractiveCredential } = require('./auth/azure-credential');

// Scope used to prime the MSAL token cache during explicit sign-in. Key Vault
// data-plane uses this resource; tokens cached here will satisfy later
// getSecret / listSecrets calls without re-prompting.
const KEYVAULT_SCOPE = 'https://vault.azure.net/.default';

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
// `target` may be a single object or an array of objects — useful for
// resolving across both the request and its variable maps (env vars,
// runtime vars, etc.) in one pass so references stored inside an env
// var's value get substituted before downstream interpolation expands
// `{{varName}}` into the literal `{{azkv://...}}` token.
//
// Returns { resolved: <count>, errors: [{ raw, message }] }.
//
// On any per-reference error, the original {{...}} token is left in place so
// the existing variable interpolator can still report a missing-variable
// warning rather than silently sending an empty string.
const resolveExternalSecrets = async (target, options = {}) => {
  const rawTargets = Array.isArray(target) ? target : [target];
  const targets = rawTargets.filter((t) => t && typeof t === 'object');
  if (targets.length === 0) {
    return { resolved: 0, errors: [] };
  }

  const cfg = readAzureKeyVaultConfig(options.brunoConfig, options.mode);

  // Gather unique references across all string leaves of every target.
  const refsByRaw = new Map();
  for (const t of targets) {
    walkStrings(t, (str) => {
      if (str.indexOf('azkv://') === -1) return;
      for (const ref of findReferences(str, { vaultBaseUrlTemplate: cfg.vaultBaseUrlTemplate })) {
        if (!refsByRaw.has(ref.raw)) refsByRaw.set(ref.raw, ref);
      }
    });
  }

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
    for (const t of targets) {
      walkStrings(t, (str, set) => {
        if (str.indexOf('azkv://') === -1) return;
        const next = replaceReferences(str, resolvedByRaw);
        if (next !== str) set(next);
      });
    }
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
    const result = await provider.listSecrets({
      vaultUrl,
      limit: options.limit,
      search: options.search,
      scanLimit: options.scanLimit
    });
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

// Triggers an interactive browser sign-in immediately, bypassing the rest of
// the chain (which is the point of an explicit "Sign in" UI action — the
// chained credential's silent fallbacks hide *which* step failed and why).
//
// The InteractiveBrowserCredential instance used here is shared with the
// chain via [`getInteractiveCredential`](./auth/azure-credential.js), so a
// successful sign-in populates the MSAL in-memory token cache that later
// resolve / testVaultAccess / listSecretsInVault calls use silently.
//
// Returns either { ok: true, expiresOnTimestamp } or
// { ok: false, errorName, message, code } — passing the raw MSAL error
// through, not the friendly `classifyError` mapping. The UI surfaces this
// verbatim so the user sees the real reason (port in use, AAD app config,
// conditional-access policy, etc.) instead of "Try `az login`".
const signInToAzure = async (storeOrVault, options = {}) => {
  const resolved = resolveStore(storeOrVault, options);
  if (resolved.error) return resolved.error;
  const { cfg } = resolved;
  const credential = getInteractiveCredential({
    tenantId: cfg.tenantId,
    clientId: cfg.clientId
  });
  try {
    const token = await credential.getToken(KEYVAULT_SCOPE);
    return {
      ok: true,
      expiresOnTimestamp: token?.expiresOnTimestamp || null
    };
  } catch (err) {
    return {
      ok: false,
      errorName: err?.name || 'Error',
      message: err?.message || String(err),
      code: err?.code
    };
  }
};

module.exports = {
  resolveExternalSecrets,
  testReference,
  testVaultAccess,
  listSecretsInVault,
  listSecretVersions,
  signInToAzure,
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
