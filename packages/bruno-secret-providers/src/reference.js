// Grammar:
//   {{azkv://<vault>/<secret>}}              -> latest version
//   {{azkv://<vault>/<secret>/<version>}}    -> pinned version
//
// <vault> is either a short name ("my-vault") or a full host
// containing a dot ("my-vault.vault.azure.net"). Short names are
// expanded via vaultBaseUrlTemplate from config.

const REFERENCE_REGEX = /\{\{\s*azkv:\/\/([^\/\s}]+)\/([^\/\s}]+)(?:\/([^\/\s}]+))?\s*\}\}/g;

const buildVaultUrl = (vault, template) => {
  if (vault.includes('.')) {
    return vault.startsWith('http') ? vault : `https://${vault}`;
  }
  const tpl = template || 'https://{vault}.vault.azure.net';
  return tpl.replace('{vault}', vault);
};

const findReferences = (str, options = {}) => {
  if (!str || typeof str !== 'string' || str.indexOf('azkv://') === -1) {
    return [];
  }
  const refs = [];
  let m;
  REFERENCE_REGEX.lastIndex = 0;
  while ((m = REFERENCE_REGEX.exec(str)) !== null) {
    const [raw, vault, secret, version] = m;
    const vaultUrl = buildVaultUrl(vault, options.vaultBaseUrlTemplate);
    refs.push({
      raw,
      vault,
      secret,
      version: version || null,
      vaultUrl,
      cacheKey: `${vaultUrl}|${secret}|${version || 'latest'}`
    });
  }
  return refs;
};

// resolvedByRaw: Map<raw-token-string, resolved-secret-value>
const replaceReferences = (str, resolvedByRaw) => {
  if (!str || typeof str !== 'string' || str.indexOf('azkv://') === -1) {
    return str;
  }
  return str.replace(REFERENCE_REGEX, (raw) => {
    return resolvedByRaw.has(raw) ? resolvedByRaw.get(raw) : raw;
  });
};

module.exports = {
  REFERENCE_REGEX,
  buildVaultUrl,
  findReferences,
  replaceReferences
};
