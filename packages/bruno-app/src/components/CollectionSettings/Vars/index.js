import React, { useRef, useState } from 'react';
import get from 'lodash/get';
import { IconKey } from '@tabler/icons';
import toast from 'react-hot-toast';
import VarsTable from './VarsTable';
import StyledWrapper from './StyledWrapper';
import { saveCollectionSettings } from 'providers/ReduxStore/slices/collections/actions';
import { setCollectionVars } from 'providers/ReduxStore/slices/collections';
import { useDispatch } from 'react-redux';
import Button from 'ui/Button';
import AzureKeyVaultPicker from 'components/AzureKeyVaultPicker';
import { uuid } from 'utils/common';
import { usePersistedState } from 'hooks/usePersistedState';
import { useTrackScroll } from 'hooks/useTrackScroll';

const Vars = ({ collection }) => {
  const dispatch = useDispatch();
  const requestVars = collection.draft?.root ? get(collection, 'draft.root.request.vars.req', []) : get(collection, 'root.request.vars.req', []);
  const responseVars = collection.draft?.root ? get(collection, 'draft.root.request.vars.res', []) : get(collection, 'root.request.vars.res', []);
  const handleSave = () => dispatch(saveCollectionSettings(collection.uid));

  const wrapperRef = useRef(null);
  const [scroll, setScroll] = usePersistedState({ key: `collection-vars-scroll-${collection.uid}`, default: 0 });
  useTrackScroll({ ref: wrapperRef, selector: '.collection-settings-content', onChange: setScroll, initialValue: scroll });

  const [openKvPicker, setOpenKvPicker] = useState(false);

  const handleKvPick = ({ reference, secretName }) => {
    // Sanitize the secret name into a valid variable identifier; suffix on
    // collision with an existing collection request var.
    const sanitized = secretName.replace(/[^a-zA-Z0-9_]/g, '_');
    let varName = sanitized;
    let suffix = 1;
    while (requestVars.some((v) => v.name === varName)) {
      suffix += 1;
      varName = `${sanitized}_${suffix}`;
    }
    const next = [
      ...requestVars,
      { uid: uuid(), name: varName, value: reference, enabled: true }
    ];
    dispatch(setCollectionVars({ collectionUid: collection.uid, vars: next, type: 'request' }));
    setOpenKvPicker(false);
    toast.success(`Added "${varName}" — click Save to persist`);
  };

  return (
    <StyledWrapper className="w-full flex flex-col" ref={wrapperRef}>
      <div className="flex-1">
        <div className="mb-3 flex items-center justify-between">
          <div className="title text-xs">Pre Request</div>
          <button
            type="button"
            onClick={() => setOpenKvPicker(true)}
            title="Pick a secret from Azure Key Vault"
            className="text-xs flex items-center px-2 py-1 rounded border"
            style={{ borderColor: 'rgba(127,127,127,0.4)' }}
          >
            <IconKey size={13} strokeWidth={2} style={{ marginRight: '0.3rem' }} />
            From Key Vault
          </button>
        </div>
        <VarsTable collection={collection} vars={requestVars} varType="request" initialScroll={scroll} />
      </div>
      <div className="flex-1">
        <div className="mt-3 mb-3 title text-xs">Post Response</div>
        <VarsTable collection={collection} vars={responseVars} varType="response" initialScroll={scroll} />
      </div>
      <div className="mt-6">
        <Button type="submit" size="sm" onClick={handleSave}>
          Save
        </Button>
      </div>

      {openKvPicker && (
        <AzureKeyVaultPicker
          collection={collection}
          onPick={handleKvPick}
          onCancel={() => setOpenKvPicker(false)}
        />
      )}
    </StyledWrapper>
  );
};

export default Vars;
