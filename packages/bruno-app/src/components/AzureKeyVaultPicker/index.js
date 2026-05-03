import React, { useEffect, useMemo, useState } from 'react';
import { get } from 'lodash';
import { IconAlertCircle, IconLock } from '@tabler/icons';
import Modal from 'components/Modal';
import StyledWrapper from './StyledWrapper';

// Modal that lists configured Azure Key Vault stores from bruno.json,
// then lists secret names in the chosen store, and on confirm calls
// onPick(reference, secretName) so the caller can insert an env variable.
//
// Three states:
//   - 'no-stores'  : nothing configured in bruno.json — ask the user to set one up
//   - 'browsing'   : pick store, then secret
//   - 'error'      : auth/network/permission failure — actionable message
const AzureKeyVaultPicker = ({ collection, onPick, onCancel }) => {
  const stores = useMemo(() => {
    const cfg = collection.draft?.brunoConfig
      ? get(collection, 'draft.brunoConfig.secretProviders.azureKeyVault.stores', [])
      : get(collection, 'brunoConfig.secretProviders.azureKeyVault.stores', []);
    return Array.isArray(cfg) ? cfg : [];
  }, [collection]);

  const [selectedStoreId, setSelectedStoreId] = useState(stores[0]?.id || '');
  const [search, setSearch] = useState('');
  const [secrets, setSecrets] = useState([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [selectedSecret, setSelectedSecret] = useState(null);

  const selectedStore = stores.find((s) => s.id === selectedStoreId) || null;

  // Load secrets whenever the chosen store changes.
  useEffect(() => {
    if (!selectedStore) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    setSecrets([]);
    setHasMore(false);
    setSelectedSecret(null);

    window.ipcRenderer
      .invoke('renderer:list-keyvault-secrets', {
        store: selectedStore,
        collectionUid: collection.uid,
        collection
      })
      .then((result) => {
        if (cancelled) return;
        if (result?.ok) {
          setSecrets(result.secrets || []);
          setHasMore(!!result.hasMore);
        } else {
          setError(result || { errorCode: 'UNKNOWN', message: 'Unknown error' });
        }
      })
      .catch((err) => {
        if (cancelled) return;
        setError({ errorCode: 'IPC', message: err?.message || 'IPC call failed' });
      })
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, [selectedStoreId, collection]);

  const filteredSecrets = useMemo(() => {
    if (!search.trim()) return secrets;
    const q = search.trim().toLowerCase();
    return secrets.filter((s) => s.name.toLowerCase().includes(q));
  }, [search, secrets]);

  const referencePreview = useMemo(() => {
    if (!selectedStore || !selectedSecret) return null;
    return `{{azkv://${selectedStore.vault}/${selectedSecret.name}}}`;
  }, [selectedStore, selectedSecret]);

  const handleConfirm = () => {
    if (!referencePreview || !selectedSecret) return;
    onPick({
      reference: referencePreview,
      secretName: selectedSecret.name,
      vault: selectedStore.vault,
      storeId: selectedStore.id
    });
  };

  // ── No stores configured ────────────────────────────────────────────────
  if (stores.length === 0) {
    return (
      <Modal
        size="md"
        title="Pick a secret from Azure Key Vault"
        handleCancel={onCancel}
        hideFooter
      >
        <StyledWrapper>
          <div className="picker-help">
            No Azure Key Vault stores are configured in this collection yet.
          </div>
          <div className="picker-help empty-stores-link">
            Open <strong>Collection Settings → Secret Stores</strong> to add one,
            then come back here.
          </div>
        </StyledWrapper>
      </Modal>
    );
  }

  return (
    <Modal
      size="md"
      title="Pick a secret from Azure Key Vault"
      handleCancel={onCancel}
      handleConfirm={handleConfirm}
      confirmText="Insert reference"
      confirmDisabled={!selectedSecret}
    >
      <StyledWrapper>
        <div className="picker-help">
          Inserts an environment variable whose value resolves the chosen secret at request time.
          The secret value itself is never sent to the renderer.
        </div>

        <div className="field-row">
          <label className="field-label" htmlFor="azkv-store">Store</label>
          <select
            id="azkv-store"
            className="block textbox store-select"
            value={selectedStoreId}
            onChange={(e) => setSelectedStoreId(e.target.value)}
          >
            {stores.map((s) => (
              <option key={s.id} value={s.id}>
                {s.displayName ? `${s.displayName} (${s.vault})` : s.vault}
              </option>
            ))}
          </select>
        </div>

        <div className="field-row">
          <label className="field-label" htmlFor="azkv-search">Search</label>
          <input
            id="azkv-search"
            type="text"
            className="block textbox search-input"
            placeholder="Filter secret names…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            autoComplete="off"
          />
        </div>

        {loading && (
          <div className="picker-status">
            <span className="picker-spinner" /> Loading secrets…
          </div>
        )}

        {error && (
          <div className="picker-status picker-status-error">
            <IconAlertCircle size={14} strokeWidth={2} />
            <span><strong>{error.errorCode}</strong>: {error.message}</span>
          </div>
        )}

        {!loading && !error && (
          <div className="secret-list">
            {filteredSecrets.length === 0 && (
              <div className="picker-status">
                {secrets.length === 0 ? 'This vault has no secrets.' : 'No secrets match your search.'}
              </div>
            )}
            {filteredSecrets.map((secret) => {
              const isSelected = selectedSecret?.name === secret.name;
              return (
                <div
                  key={secret.name}
                  className={
                    'secret-row'
                    + (isSelected ? ' secret-row-selected' : '')
                    + (secret.enabled === false ? ' secret-row-disabled' : '')
                  }
                  onClick={() => setSelectedSecret(secret)}
                >
                  <div>
                    <IconLock size={12} strokeWidth={2} style={{ marginRight: '0.4rem', verticalAlign: '-2px', opacity: 0.65 }} />
                    {secret.name}
                  </div>
                  <div className="secret-row-meta">
                    {secret.enabled === false ? 'disabled' : ''}
                    {secret.expiresOn ? ` · expires ${new Date(secret.expiresOn).toLocaleDateString()}` : ''}
                  </div>
                </div>
              );
            })}
            {hasMore && (
              <div className="picker-status">
                Showing first 200 secrets — narrow the search to find more.
              </div>
            )}
          </div>
        )}

        {referencePreview && (
          <div className="reference-preview">
            {referencePreview}
          </div>
        )}
      </StyledWrapper>
    </Modal>
  );
};

export default AzureKeyVaultPicker;
