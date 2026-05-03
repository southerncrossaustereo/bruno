import styled from 'styled-components';

const Wrapper = styled.div`
  .section-heading {
    font-size: 0.85rem;
    font-weight: 600;
    margin-bottom: 0.5rem;
  }

  .section-help {
    font-size: 0.72rem;
    color: ${(props) => props.theme.text};
    opacity: 0.7;
    margin-bottom: 0.75rem;
    max-width: 36rem;
  }

  .field-row {
    display: flex;
    align-items: center;
    margin-bottom: 0.5rem;
  }

  .field-label {
    width: 9rem;
    font-size: 0.78rem;
    flex-shrink: 0;
  }

  .field-input {
    width: 22rem;
    max-width: 100%;
  }

  .store-card {
    border: 1px solid ${(props) => props.theme.input?.border || 'rgba(127,127,127,0.4)'};
    border-radius: 4px;
    padding: 0.75rem 1rem;
    margin-bottom: 0.5rem;
    background: ${(props) => props.theme.bg};
  }

  .store-card-summary {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
  }

  .store-summary-text {
    display: flex;
    flex-direction: column;
    gap: 0.1rem;
  }

  .store-summary-name {
    font-weight: 600;
    font-size: 0.85rem;
  }

  .store-summary-meta {
    font-family: ${(props) => props.theme.font?.monospace || 'monospace'};
    font-size: 0.72rem;
    opacity: 0.75;
  }

  .store-actions {
    display: flex;
    gap: 0.4rem;
    flex-shrink: 0;
  }

  .store-action-btn {
    font-size: 0.72rem;
    padding: 0.15rem 0.55rem;
    border-radius: 3px;
    border: 1px solid ${(props) => props.theme.input?.border || 'rgba(127,127,127,0.4)'};
    background: transparent;
    color: ${(props) => props.theme.text};
    cursor: pointer;
  }
  .store-action-btn:hover { background: ${(props) => props.theme.dropdown?.hoverBg || 'rgba(127,127,127,0.12)'}; }
  .store-action-btn-danger { color: ${(props) => props.theme.colors?.text?.danger || '#c62828'}; }

  .test-result {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    font-size: 0.72rem;
    margin-left: 0.5rem;
  }
  .test-result-ok { color: ${(props) => props.theme.colors?.text?.green || '#2e7d32'}; }
  .test-result-error { color: ${(props) => props.theme.colors?.text?.danger || '#c62828'}; }

  .test-spinner {
    width: 11px; height: 11px;
    border: 1.5px solid currentColor;
    border-top-color: transparent;
    border-radius: 50%;
    animation: kv-spin 0.7s linear infinite;
  }
  @keyframes kv-spin { to { transform: rotate(360deg); } }

  .add-store-btn {
    font-size: 0.78rem;
    padding: 0.25rem 0.7rem;
    border-radius: 3px;
    border: 1px dashed ${(props) => props.theme.input?.border || 'rgba(127,127,127,0.5)'};
    background: transparent;
    color: ${(props) => props.theme.text};
    cursor: pointer;
  }
  .add-store-btn:hover { background: ${(props) => props.theme.dropdown?.hoverBg || 'rgba(127,127,127,0.12)'}; }

  .divider {
    height: 1px;
    background: ${(props) => props.theme.input?.border || 'rgba(127,127,127,0.25)'};
    margin: 1.25rem 0;
  }

  .empty-state {
    font-size: 0.78rem;
    opacity: 0.7;
    padding: 0.75rem 0;
  }
`;

export default Wrapper;
