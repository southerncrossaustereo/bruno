const { ipcMain } = require('electron');
const {
  testReference,
  testVaultAccess,
  listSecretsInVault,
  listSecretVersions
} = require('@usebruno/secret-providers');
const { getBrunoConfig } = require('../store/bruno-config');

// IPC for the Azure Key Vault integration in the renderer. Every handler
// returns a uniform { ok, errorCode?, message?, ... } shape — the
// renderer never sees raw Azure errors or secret values.
//
// renderer:test-keyvault-reference   — verify a single {{azkv://...}} ref resolves
// renderer:test-keyvault-store       — verify a configured store: auth + list permission
// renderer:list-keyvault-stores      — read configured stores from brunoConfig
// renderer:list-keyvault-secrets     — list secret names in a store
// renderer:list-keyvault-secret-versions — list versions of a single secret

// Looks up a store from bruno.json's secretProviders.azureKeyVault.stores
// by id. Falls back to treating the supplied identifier as a literal vault
// short-name when no `stores` array is configured (zero-config flow).
const resolveStoreFromConfig = (brunoConfig, storeIdOrVault) => {
  const stores = brunoConfig?.secretProviders?.azureKeyVault?.stores;
  if (Array.isArray(stores)) {
    const byId = stores.find((s) => s.id === storeIdOrVault);
    if (byId) return byId;
    const byVault = stores.find((s) => s.vault === storeIdOrVault);
    if (byVault) return byVault;
  }
  // Zero-config path: treat the identifier as a vault short-name.
  if (typeof storeIdOrVault === 'string' && storeIdOrVault.length > 0) {
    return { id: storeIdOrVault, vault: storeIdOrVault };
  }
  return null;
};

const registerAzureKeyVaultIpc = () => {
  ipcMain.handle('renderer:test-keyvault-reference', async (_event, payload = {}) => {
    const { reference, collectionUid, collection } = payload;
    if (typeof reference !== 'string' || reference.length === 0) {
      return { ok: false, errorCode: 'INVALID_REFERENCE', message: 'No reference provided.' };
    }
    const brunoConfig = getBrunoConfig(collectionUid, collection);
    return await testReference(reference, { brunoConfig, mode: 'desktop' });
  });

  ipcMain.handle('renderer:test-keyvault-store', async (_event, payload = {}) => {
    const { storeIdOrVault, store, collectionUid, collection } = payload;
    const brunoConfig = getBrunoConfig(collectionUid, collection);
    // The store config UI passes the unsaved draft store directly so the
    // user can test before saving; the env-editor flow passes an id.
    const resolved = store || resolveStoreFromConfig(brunoConfig, storeIdOrVault);
    if (!resolved) return { ok: false, errorCode: 'CONFIG', message: 'Store not configured.' };
    return await testVaultAccess(resolved, { brunoConfig, mode: 'desktop' });
  });

  ipcMain.handle('renderer:list-keyvault-stores', async (_event, payload = {}) => {
    const { collectionUid, collection } = payload;
    const brunoConfig = getBrunoConfig(collectionUid, collection);
    const stores = brunoConfig?.secretProviders?.azureKeyVault?.stores || [];
    // Strip nothing — these objects are user-configured and never contain secrets.
    return { ok: true, stores };
  });

  ipcMain.handle('renderer:list-keyvault-secrets', async (_event, payload = {}) => {
    const { storeIdOrVault, store, limit, collectionUid, collection } = payload;
    const brunoConfig = getBrunoConfig(collectionUid, collection);
    const resolved = store || resolveStoreFromConfig(brunoConfig, storeIdOrVault);
    if (!resolved) return { ok: false, errorCode: 'CONFIG', message: 'Store not configured.' };
    return await listSecretsInVault(resolved, { brunoConfig, mode: 'desktop', limit });
  });

  ipcMain.handle('renderer:list-keyvault-secret-versions', async (_event, payload = {}) => {
    const { storeIdOrVault, store, secretName, collectionUid, collection } = payload;
    const brunoConfig = getBrunoConfig(collectionUid, collection);
    const resolved = store || resolveStoreFromConfig(brunoConfig, storeIdOrVault);
    if (!resolved) return { ok: false, errorCode: 'CONFIG', message: 'Store not configured.' };
    if (!secretName) return { ok: false, errorCode: 'INVALID_REFERENCE', message: 'No secret name supplied.' };
    return await listSecretVersions(resolved, secretName, { brunoConfig, mode: 'desktop' });
  });
};

module.exports = registerAzureKeyVaultIpc;
