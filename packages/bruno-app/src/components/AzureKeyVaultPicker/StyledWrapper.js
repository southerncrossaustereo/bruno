import styled from 'styled-components';

const Wrapper = styled.div`
  .picker-help {
    font-size: 0.72rem;
    opacity: 0.7;
    margin-bottom: 0.75rem;
  }

  .field-row {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin-bottom: 0.6rem;
  }
  .field-label {
    font-size: 0.78rem;
    width: 5rem;
    flex-shrink: 0;
  }

  .store-select, .search-input {
    flex: 1;
    min-width: 0;
  }

  .secret-list {
    max-height: 18rem;
    overflow-y: auto;
    border: 1px solid ${(props) => props.theme.input?.border || 'rgba(127,127,127,0.3)'};
    border-radius: 4px;
    padding: 0.25rem;
    background: ${(props) => props.theme.bg};
  }

  .secret-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
    padding: 0.35rem 0.5rem;
    border-radius: 3px;
    cursor: pointer;
    font-family: ${(props) => props.theme.font?.monospace || 'monospace'};
    font-size: 0.78rem;
  }
  .secret-row:hover { background: ${(props) => props.theme.dropdown?.hoverBg || 'rgba(127,127,127,0.12)'}; }
  .secret-row-selected { background: ${(props) => props.theme.dropdown?.hoverBg || 'rgba(127,127,127,0.18)'}; }
  .secret-row-disabled { opacity: 0.5; }

  .secret-row-meta {
    font-size: 0.65rem;
    opacity: 0.65;
  }

  .reference-preview {
    margin-top: 0.75rem;
    padding: 0.5rem 0.75rem;
    border: 1px solid ${(props) => props.theme.input?.border || 'rgba(127,127,127,0.3)'};
    border-radius: 4px;
    background: ${(props) => props.theme.bg};
    font-family: ${(props) => props.theme.font?.monospace || 'monospace'};
    font-size: 0.78rem;
    word-break: break-all;
  }

  .picker-status {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    padding: 0.5rem;
    font-size: 0.78rem;
  }
  .picker-status-error { color: ${(props) => props.theme.colors?.text?.danger || '#c62828'}; }

  .picker-spinner {
    width: 13px; height: 13px;
    border: 1.5px solid currentColor;
    border-top-color: transparent;
    border-radius: 50%;
    animation: kv-spin 0.7s linear infinite;
  }
  @keyframes kv-spin { to { transform: rotate(360deg); } }

  .empty-stores-link {
    color: ${(props) => props.theme.colors?.text?.yellow || '#d39e00'};
  }
`;

export default Wrapper;
