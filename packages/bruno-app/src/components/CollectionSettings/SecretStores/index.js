import React, { useMemo, useState } from 'react';
import { useDispatch } from 'react-redux';
import { get } from 'lodash';
import toast from 'react-hot-toast';
import { IconCheck, IconAlertCircle, IconTrash, IconPlus, IconEdit, IconX } from '@tabler/icons';
import { updateCollectionSecretProviders } from 'providers/ReduxStore/slices/collections';
import { saveCollectionSettings } from 'providers/ReduxStore/slices/collections/actions';
import Button from 'ui/Button';
import StyledWrapper from './StyledWrapper';

const DEFAULT_VAULT_TEMPLATE = 'https://{vault}.vault.azure.net';

const blankStore = () => ({ id: '', vault: '', displayName: '', tenantId: '' });

const readSecretProviders = (collection) => {
  return collection.draft?.brunoConfig
    ? get(collection, 'draft.brunoConfig.secretProviders', {})
    : get(collection, 'brunoConfig.secretProviders', {});
};

const SecretStores = ({ collection }) => {
  const dispatch = useDispatch();

  const current = readSecretProviders(collection);
  const azkv = current?.azureKeyVault || {};
  const stores = Array.isArray(azkv.stores) ? azkv.stores : [];

  // Local edit state — keyed by store id (or 'new' for unsaved adds).
  const [editingId, setEditingId] = useState(null);
  const [editDraft, setEditDraft] = useState(blankStore());
  const [testStatus, setTestStatus] = useState({}); // { [storeId]: { state: 'idle'|'testing'|'ok'|'error', error?: {} } }

  const persist = (nextAzkv) => {
    const next = {
      ...current,
      azureKeyVault: { ...azkv, ...nextAzkv }
    };
    dispatch(updateCollectionSecretProviders({
      collectionUid: collection.uid,
      secretProviders: next
    }));
  };

  const handleSave = () => {
    dispatch(saveCollectionSettings(collection.uid))
      .then(() => toast.success('Secret stores saved'))
      .catch((err) => toast.error(err?.message || 'Failed to save'));
  };

  // ── Defaults ──────────────────────────────────────────────────────────────
  const handleDefaultChange = (key, value) => persist({ [key]: value });

  // ── Store CRUD ────────────────────────────────────────────────────────────
  const startEdit = (store) => {
    setEditingId(store.id);
    setEditDraft({ ...blankStore(), ...store });
  };

  const startAdd = () => {
    setEditingId('__new__');
    setEditDraft(blankStore());
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditDraft(blankStore());
  };

  const validateDraft = (draft, isNew) => {
    if (!draft.id?.trim()) return 'Store ID is required.';
    if (!draft.vault?.trim()) return 'Vault is required.';
    if (isNew && stores.some((s) => s.id === draft.id)) return `A store with id "${draft.id}" already exists.`;
    return null;
  };

  const commitEdit = () => {
    const isNew = editingId === '__new__';
    const err = validateDraft(editDraft, isNew);
    if (err) { toast.error(err); return; }

    const cleaned = { ...editDraft };
    if (!cleaned.tenantId?.trim()) delete cleaned.tenantId;
    if (!cleaned.displayName?.trim()) delete cleaned.displayName;

    let nextStores;
    if (isNew) {
      nextStores = [...stores, cleaned];
    } else {
      nextStores = stores.map((s) => (s.id === editingId ? cleaned : s));
    }
    persist({ stores: nextStores });
    cancelEdit();
  };

  const removeStore = (id) => {
    const nextStores = stores.filter((s) => s.id !== id);
    persist({ stores: nextStores });
    setTestStatus((prev) => { const { [id]: _, ...rest } = prev; return rest; });
  };

  // ── Test connection ───────────────────────────────────────────────────────
  const testStore = async (store) => {
    setTestStatus((prev) => ({ ...prev, [store.id]: { state: 'testing' } }));
    try {
      const result = await window.ipcRenderer.invoke('renderer:test-keyvault-store', {
        store,
        collectionUid: collection.uid,
        collection
      });
      if (result?.ok) {
        setTestStatus((prev) => ({ ...prev, [store.id]: { state: 'ok' } }));
      } else {
        setTestStatus((prev) => ({ ...prev, [store.id]: { state: 'error', error: result } }));
      }
    } catch (err) {
      setTestStatus((prev) => ({ ...prev, [store.id]: { state: 'error', error: { errorCode: 'IPC', message: err?.message } } }));
    }
  };

  const renderTestResult = (id) => {
    const s = testStatus[id];
    if (!s || s.state === 'idle') return null;
    if (s.state === 'testing') return <span className="test-result"><span className="test-spinner" /> testing…</span>;
    if (s.state === 'ok') return <span className="test-result test-result-ok"><IconCheck size={13} strokeWidth={2.5} /> connected</span>;
    return (
      <span className="test-result test-result-error" title={s.error?.message || ''}>
        <IconAlertCircle size={13} strokeWidth={2} /> {s.error?.errorCode || 'failed'}
      </span>
    );
  };

  const editingStore = useMemo(() => {
    if (editingId == null) return null;
    return { isNew: editingId === '__new__', draft: editDraft };
  }, [editingId, editDraft]);

  return (
    <StyledWrapper className="h-full w-full">
      <div className="section-help">
        Configure Azure Key Vault stores for this collection. Once added, environment-variable
        values can reference secrets in any of these stores via the
        {' '}<code>{'{{azkv://<vault>/<secret>}}'}</code> syntax — or use the picker in the env editor (coming soon).
      </div>

      {/* ── Defaults ─────────────────────────────────────────────────── */}
      <div className="section-heading">Defaults</div>
      <div className="section-help">
        Apply to every store unless overridden. Leave blank for sensible defaults.
      </div>
      <div className="bruno-form">
        <div className="field-row">
          <label className="field-label" htmlFor="azkv-tenant">Tenant ID</label>
          <input
            id="azkv-tenant"
            type="text"
            className="block textbox field-input"
            value={azkv.tenantId || ''}
            onChange={(e) => handleDefaultChange('tenantId', e.target.value)}
            placeholder="00000000-0000-0000-0000-000000000000"
            autoComplete="off"
          />
        </div>
        <div className="field-row">
          <label className="field-label" htmlFor="azkv-template">Vault DNS template</label>
          <input
            id="azkv-template"
            type="text"
            className="block textbox field-input"
            value={azkv.vaultBaseUrlTemplate || ''}
            onChange={(e) => handleDefaultChange('vaultBaseUrlTemplate', e.target.value)}
            placeholder={DEFAULT_VAULT_TEMPLATE}
            autoComplete="off"
          />
        </div>
        <div className="field-row">
          <label className="field-label" htmlFor="azkv-cache">Cache TTL (sec)</label>
          <input
            id="azkv-cache"
            type="number"
            min={0}
            className="block textbox field-input"
            value={azkv.cacheTtlSeconds ?? ''}
            onChange={(e) => handleDefaultChange('cacheTtlSeconds', e.target.value ? Number(e.target.value) : undefined)}
            placeholder="300"
            autoComplete="off"
          />
        </div>
      </div>

      <div className="divider" />

      {/* ── Stores ───────────────────────────────────────────────────── */}
      <div className="section-heading">Key Vaults</div>
      <div className="section-help">
        A store points at one Azure Key Vault. Secrets in that vault become reachable via
        {' '}<code>{'{{azkv://<vault>/<secret>}}'}</code>.
      </div>

      {stores.length === 0 && editingId !== '__new__' && (
        <div className="empty-state">No stores configured yet.</div>
      )}

      {stores.map((store) => {
        const isEditing = editingId === store.id;
        if (!isEditing) {
          return (
            <div className="store-card" key={store.id}>
              <div className="store-card-summary">
                <div className="store-summary-text">
                  <div className="store-summary-name">{store.displayName || store.id}</div>
                  <div className="store-summary-meta">
                    id: <code>{store.id}</code>{'  '}·{'  '}vault: <code>{store.vault}</code>
                    {store.tenantId ? <> {'  '}·{'  '}tenant: <code>{store.tenantId.slice(0, 8)}…</code></> : null}
                  </div>
                </div>
                <div className="store-actions">
                  {renderTestResult(store.id)}
                  <button type="button" className="store-action-btn" onClick={() => testStore(store)}>Test</button>
                  <button type="button" className="store-action-btn" onClick={() => startEdit(store)}>
                    <IconEdit size={13} strokeWidth={2} /> Edit
                  </button>
                  <button type="button" className="store-action-btn store-action-btn-danger" onClick={() => removeStore(store.id)}>
                    <IconTrash size={13} strokeWidth={2} />
                  </button>
                </div>
              </div>
            </div>
          );
        }
        return null;
      })}

      {editingStore && (
        <div className="store-card">
          <div className="section-heading" style={{ marginBottom: '0.5rem' }}>
            {editingStore.isNew ? 'Add store' : `Edit store: ${editingId}`}
          </div>
          <div className="bruno-form">
            <div className="field-row">
              <label className="field-label">ID</label>
              <input
                type="text"
                className="block textbox field-input"
                value={editDraft.id}
                disabled={!editingStore.isNew}
                onChange={(e) => setEditDraft({ ...editDraft, id: e.target.value })}
                placeholder="dev-kv"
                autoComplete="off"
              />
            </div>
            <div className="field-row">
              <label className="field-label">Vault</label>
              <input
                type="text"
                className="block textbox field-input"
                value={editDraft.vault}
                onChange={(e) => setEditDraft({ ...editDraft, vault: e.target.value })}
                placeholder="contoso-dev-kv  (short name or full host)"
                autoComplete="off"
              />
            </div>
            <div className="field-row">
              <label className="field-label">Display name</label>
              <input
                type="text"
                className="block textbox field-input"
                value={editDraft.displayName}
                onChange={(e) => setEditDraft({ ...editDraft, displayName: e.target.value })}
                placeholder="Dev secrets"
                autoComplete="off"
              />
            </div>
            <div className="field-row">
              <label className="field-label">Tenant override</label>
              <input
                type="text"
                className="block textbox field-input"
                value={editDraft.tenantId}
                onChange={(e) => setEditDraft({ ...editDraft, tenantId: e.target.value })}
                placeholder="(optional — falls back to default tenant)"
                autoComplete="off"
              />
            </div>
          </div>
          <div className="store-actions" style={{ marginTop: '0.6rem' }}>
            <button type="button" className="store-action-btn" onClick={commitEdit}>
              <IconCheck size={13} strokeWidth={2.5} /> {editingStore.isNew ? 'Add' : 'Save'}
            </button>
            <button type="button" className="store-action-btn" onClick={cancelEdit}>
              <IconX size={13} strokeWidth={2} /> Cancel
            </button>
          </div>
        </div>
      )}

      {editingId !== '__new__' && (
        <button type="button" className="add-store-btn" onClick={startAdd}>
          <IconPlus size={13} strokeWidth={2} style={{ marginRight: '0.25rem', verticalAlign: '-2px' }} />
          Add store
        </button>
      )}

      <div className="divider" />

      <div>
        <Button type="submit" size="sm" onClick={handleSave}>
          Save
        </Button>
      </div>
    </StyledWrapper>
  );
};

export default SecretStores;
