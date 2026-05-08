import React, { useMemo, useState } from 'react';
import { useDispatch } from 'react-redux';
import IconEdit from 'components/Icons/IconEdit';
import { IconCode, IconDeviceFloppy, IconArrowDown } from '@tabler/icons';
import StyledWrapper from './StyledWrapper';
import { useTheme } from 'providers/Theme';
import TruncatedText from 'components/TruncatedText';
import {
  updateResponseExampleName,
  updateResponseExampleDescription,
  loadExampleIntoRequest
} from 'providers/ReduxStore/slices/collections';
import get from 'lodash/get';
import Button from 'ui/Button';
import Modal from 'components/Modal';

const ResponseExampleTopBar = ({
  item,
  collection,
  exampleUid,
  editMode,
  onEditToggle,
  onSave,
  onCancel,
  onGenerateCode
}) => {
  const { theme } = useTheme();
  const dispatch = useDispatch();

  const example = useMemo(() => {
    return item.draft ? get(item, 'draft.examples', []).find((e) => e.uid === exampleUid) : get(item, 'examples', []).find((e) => e.uid === exampleUid);
  }, [item.draft, item.examples, item, exampleUid]);

  const handleGenerateCode = () => {
    if (onGenerateCode) {
      onGenerateCode({
        ...example,
        isExample: true,
        exampleUid: exampleUid
      });
    }
  };

  const handleNameChange = (e) => {
    // Validate required fields before dispatching
    if (!item?.uid) {
      console.error('item.uid is missing');
      return;
    }
    if (!collection?.uid) {
      console.error('collection.uid is missing');
      return;
    }
    if (!exampleUid) {
      console.error('exampleUid is missing');
      return;
    }

    dispatch(updateResponseExampleName({
      itemUid: item.uid,
      collectionUid: collection.uid,
      exampleUid: exampleUid,
      name: e.target.value
    }));
  };

  const handleDescriptionChange = (e) => {
    // Validate required fields before dispatching
    if (!item?.uid) {
      console.error('item.uid is missing');
      return;
    }
    if (!collection?.uid) {
      console.error('collection.uid is missing');
      return;
    }
    if (!exampleUid) {
      console.error('exampleUid is missing');
      return;
    }

    dispatch(updateResponseExampleDescription({
      itemUid: item.uid,
      collectionUid: collection.uid,
      exampleUid: exampleUid,
      description: e.target.value
    }));
  };

  const handleSave = () => {
    // Call the parent save handler
    if (onSave) {
      onSave();
    }
  };

  const handleCancel = () => {
    if (onCancel) {
      onCancel();
    }
  };

  // "Load into request" — overwrites the working request with this
  // example's url/method/headers/params/body. Auth/scripts/vars/assertions/
  // tests/docs are preserved (handled in the reducer). If item.draft exists
  // we prompt first so accidentally clobbering an in-progress edit is hard.
  const [showLoadConfirm, setShowLoadConfirm] = useState(false);

  const dispatchLoadIntoRequest = () => {
    dispatch(loadExampleIntoRequest({
      itemUid: item.uid,
      collectionUid: collection.uid,
      exampleUid
    }));
  };

  const handleLoadIntoRequest = () => {
    if (item?.draft) {
      setShowLoadConfirm(true);
      return;
    }
    dispatchLoadIntoRequest();
  };

  if (!example || !exampleUid) {
    return null;
  }

  if (editMode) {
    return (
      <StyledWrapper className="p-4">
        <div className="max-w-full">
          <div className="flex items-start justify-between gap-6 md:flex-row flex-col">
            <div className="flex-1 min-w-0">
              <div className="space-y-3">
                <div>
                  <input
                    type="text"
                    value={example?.name || ''}
                    onChange={handleNameChange}
                    className="example-input example-input-name"
                    placeholder="Enter example name"
                    autoFocus
                    data-testid="response-example-name-input"
                  />
                </div>
                <div>
                  <textarea
                    value={example?.description || ''}
                    onChange={handleDescriptionChange}
                    className="example-input example-input-description"
                    placeholder="Enter example description"
                    rows={3}
                    data-testid="response-example-description-input"
                  />
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3 flex-shrink-0 md:w-auto w-full md:justify-end">
              <Button
                color="secondary"
                onClick={handleCancel}
                data-testid="response-example-cancel-btn"
              >
                Cancel
              </Button>
              <Button
                color="primary"
                style={{ padding: '6px 12px' }}
                icon={<IconDeviceFloppy size={16} />}
                onClick={handleSave}
                data-testid="response-example-save-btn"
              >
                Save
              </Button>
            </div>
          </div>
        </div>
      </StyledWrapper>
    );
  }

  // Default view mode
  return (
    <StyledWrapper className="p-4">
      <div className="max-w-full">
        <div className="flex items-center justify-between gap-6 md:flex-row flex-col">
          <div className="flex-1 min-w-0">
            <h2 className="response-example-title font-medium leading-tight" data-testid="response-example-title">
              <span className="opacity-60">{item.name}</span>
              {' / '}
              <span>{example.name}</span>
            </h2>
            {example.description && example.description.trim().length > 0 && (
              <TruncatedText
                text={example.description}
                maxLines={2}
                className="response-example-description-container"
                textClassName="response-example-description leading-relaxed max-w-fit"
                buttonClassName="text-blue-600 hover:text-blue-800 font-medium"
                viewMoreText="View More"
                viewLessText="View Less"
                dataTestId="response-example-description"
              />
            )}
          </div>

          <div className="flex items-center gap-3 flex-shrink-0 md:w-auto w-full md:justify-end">
            <Button
              color="secondary"
              size="sm"
              icon={<IconArrowDown size={16} color={theme.examples.buttonIconColor} />}
              onClick={handleLoadIntoRequest}
              title="Replace the working request with this example's url, method, headers, params and body. Auth, scripts and variables are kept."
              data-testid="response-example-load-into-request-btn"
            >
              Load into Request
            </Button>
            <Button
              color="secondary"
              size="sm"
              icon={<IconCode size={16} color={theme.examples.buttonIconColor} />}
              onClick={handleGenerateCode}
              title="Generate Code"
              data-testid="response-example-generate-code-btn"
            />
            <Button
              color="secondary"
              size="sm"
              icon={<IconEdit size={16} color={theme.examples.buttonIconColor} />}
              onClick={onEditToggle}
              data-testid="response-example-edit-btn"
            >
              Edit Example
            </Button>
          </div>
        </div>
      </div>
      {showLoadConfirm && (
        <Modal
          size="sm"
          title="Overwrite working request?"
          confirmText="Load and overwrite"
          cancelText="Cancel"
          confirmButtonColor="danger"
          handleCancel={() => setShowLoadConfirm(false)}
          handleConfirm={() => {
            dispatchLoadIntoRequest();
            setShowLoadConfirm(false);
          }}
        >
          <div className="text-sm">
            This request has unsaved changes. Loading <strong>{example.name}</strong>{' '}
            will replace the URL, method, headers, params and body with the example's values.
            Your auth, scripts and variables will be kept.
          </div>
        </Modal>
      )}
    </StyledWrapper>
  );
};

export default ResponseExampleTopBar;
