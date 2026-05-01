const { ipcMain } = require('electron');
const { testReference } = require('@usebruno/secret-providers');
const { getBrunoConfig } = require('../store/bruno-config');

// Phase 1 IPC for the Azure Key Vault chip in the environment editor.
//
// `renderer:test-keyvault-reference` resolves a single {{azkv://...}}
// reference end-to-end (auth chain + KV fetch) and discards the value.
// The renderer never sees the secret — only a stable {ok, errorCode,
// message} shape it can switch on. A successful test populates the
// resolver cache, so the next real request that uses this reference is
// a cache hit.

const registerAzureKeyVaultIpc = () => {
  ipcMain.handle('renderer:test-keyvault-reference', async (_event, payload = {}) => {
    const { reference, collectionUid, collection } = payload;
    if (typeof reference !== 'string' || reference.length === 0) {
      return { ok: false, errorCode: 'INVALID_REFERENCE', message: 'No reference provided.' };
    }
    const brunoConfig = getBrunoConfig(collectionUid, collection);
    return await testReference(reference, { brunoConfig, mode: 'desktop' });
  });
};

module.exports = registerAzureKeyVaultIpc;
