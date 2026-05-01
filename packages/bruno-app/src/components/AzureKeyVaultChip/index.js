import React, { useEffect, useState } from 'react';
import { IconLock, IconCheck, IconAlertCircle } from '@tabler/icons';
import { Tooltip } from 'react-tooltip';
import StyledWrapper from './StyledWrapper';

// Matches {{azkv://<vault>/<secret>[/<version>]}} — keep in sync with
// packages/bruno-secret-providers/src/reference.js. Duplicated here
// because the renderer is a separate process and we don't want to drag
// the provider package into the React build.
const AZKV_REGEX = /\{\{\s*azkv:\/\/([^\/\s}]+)\/([^\/\s}]+)(?:\/([^\/\s}]+))?\s*\}\}/;

const parseFirstReference = (value) => {
  if (!value || typeof value !== 'string') return null;
  const match = value.match(AZKV_REGEX);
  if (!match) return null;
  const [raw, vault, secret, version] = match;
  return { raw, vault, secret, version: version || null };
};

const AzureKeyVaultChip = ({ variable, collection }) => {
  const ref = parseFirstReference(variable?.value);
  const [status, setStatus] = useState('idle'); // 'idle' | 'testing' | 'ok' | 'error'
  const [errorInfo, setErrorInfo] = useState(null);
  const [lastTestedAt, setLastTestedAt] = useState(null);

  // Reset chip state if the variable value changes — a new reference is a fresh slate.
  useEffect(() => {
    setStatus('idle');
    setErrorInfo(null);
    setLastTestedAt(null);
  }, [ref?.raw]);

  if (!ref) return null;

  const tooltipId = `azkv-chip-${variable.uid}`;

  const handleTest = async (e) => {
    e?.stopPropagation();
    if (status === 'testing') return;
    setStatus('testing');
    setErrorInfo(null);
    try {
      const result = await window.ipcRenderer.invoke('renderer:test-keyvault-reference', {
        reference: ref.raw,
        collectionUid: collection?.uid,
        collection
      });
      if (result?.ok) {
        setStatus('ok');
        setErrorInfo(null);
      } else {
        setStatus('error');
        setErrorInfo(result || { errorCode: 'UNKNOWN', message: 'Unknown error' });
      }
    } catch (err) {
      setStatus('error');
      setErrorInfo({ errorCode: 'IPC', message: err?.message || 'IPC call failed' });
    }
    setLastTestedAt(new Date());
  };

  const renderIcon = () => {
    if (status === 'testing') return <span className="kv-chip-spinner" aria-label="Testing" />;
    if (status === 'ok') return <IconCheck className="kv-chip-icon" size={13} strokeWidth={2.5} />;
    if (status === 'error') return <IconAlertCircle className="kv-chip-icon" size={13} strokeWidth={2} />;
    return <IconLock className="kv-chip-icon" size={13} strokeWidth={2} />;
  };

  const tooltipContent = (
    <div>
      <div><strong>Azure Key Vault reference</strong></div>
      <div style={{ marginTop: '0.25rem', fontFamily: 'monospace', fontSize: '0.7rem', wordBreak: 'break-all' }}>
        {ref.raw}
      </div>
      <hr style={{ margin: '0.4rem 0', borderColor: 'currentColor', opacity: 0.2 }} />
      <div>Vault: <code>{ref.vault}</code></div>
      <div>Secret: <code>{ref.secret}</code></div>
      <div>Version: <code>{ref.version || 'latest'}</code></div>
      {status === 'idle' && <div style={{ marginTop: '0.4rem' }}>Click to test resolution.</div>}
      {status === 'testing' && <div style={{ marginTop: '0.4rem' }}>Resolving…</div>}
      {status === 'ok' && (
        <div style={{ marginTop: '0.4rem' }}>
          ✓ Resolved successfully{lastTestedAt ? ` at ${lastTestedAt.toLocaleTimeString()}` : ''}.
        </div>
      )}
      {status === 'error' && errorInfo && (
        <div style={{ marginTop: '0.4rem' }}>
          ✗ {errorInfo.errorCode}: {errorInfo.message}
        </div>
      )}
      {status !== 'idle' && (
        <div style={{ marginTop: '0.4rem', opacity: 0.75 }}>Click to re-test.</div>
      )}
    </div>
  );

  return (
    <StyledWrapper>
      <span
        id={tooltipId}
        role="button"
        tabIndex={0}
        className={`kv-chip kv-chip-${status}`}
        onClick={handleTest}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') handleTest(e); }}
        title="" /* react-tooltip handles the hover content; suppress native title */
      >
        {renderIcon()}
        <span className="kv-chip-label">azkv: {ref.vault} / {ref.secret}</span>
      </span>
      <Tooltip anchorId={tooltipId} className="tooltip-mod" content={tooltipContent} place="top" />
    </StyledWrapper>
  );
};

AzureKeyVaultChip.parseFirstReference = parseFirstReference;
AzureKeyVaultChip.AZKV_REGEX = AZKV_REGEX;

export default AzureKeyVaultChip;
