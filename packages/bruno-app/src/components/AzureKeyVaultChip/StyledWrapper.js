import styled from 'styled-components';

const Wrapper = styled.span`
  .kv-chip {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    padding: 0.1rem 0.5rem 0.1rem 0.4rem;
    margin-left: 0.5rem;
    border-radius: 999px;
    font-size: 0.7rem;
    font-family: ${(props) => props.theme.font?.monospace || 'monospace'};
    line-height: 1.4;
    cursor: pointer;
    user-select: none;
    border: 1px solid transparent;
    background: ${(props) => props.theme.bg};
    transition: background 0.1s ease;
  }

  .kv-chip:hover { background: ${(props) => props.theme.dropdown?.hoverBg || 'rgba(127,127,127,0.12)'}; }

  .kv-chip-idle    { color: ${(props) => props.theme.text}; border-color: ${(props) => props.theme.input?.border || 'rgba(127,127,127,0.4)'}; }
  .kv-chip-testing { color: ${(props) => props.theme.text}; border-color: ${(props) => props.theme.colors?.text?.yellow || '#d39e00'}; }
  .kv-chip-ok      { color: ${(props) => props.theme.colors?.text?.green || '#2e7d32'}; border-color: ${(props) => props.theme.colors?.text?.green || '#2e7d32'}; }
  .kv-chip-error   { color: ${(props) => props.theme.colors?.text?.danger || '#c62828'}; border-color: ${(props) => props.theme.colors?.text?.danger || '#c62828'}; }

  .kv-chip-icon { flex-shrink: 0; }
  .kv-chip-label { white-space: nowrap; }
  .kv-chip-spinner {
    width: 12px;
    height: 12px;
    border: 1.5px solid currentColor;
    border-top-color: transparent;
    border-radius: 50%;
    animation: kv-spin 0.7s linear infinite;
  }

  @keyframes kv-spin { to { transform: rotate(360deg); } }

  .tooltip-mod { max-width: 22rem; }
`;

export default Wrapper;
