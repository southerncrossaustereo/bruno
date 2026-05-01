// Maps errors thrown by Azure SDK / our resolver into a small set of
// stable, user-facing error codes. The UI only surfaces the code + a
// short message — never the raw error (which can leak vault internals).

const ERROR_CODES = {
  INVALID_REFERENCE: 'INVALID_REFERENCE',
  NOT_FOUND: 'NOT_FOUND',
  FORBIDDEN: 'FORBIDDEN',
  AUTH_FAILED: 'AUTH_FAILED',
  NETWORK: 'NETWORK',
  CONFIG: 'CONFIG',
  UNKNOWN: 'UNKNOWN'
};

const FRIENDLY_MESSAGES = {
  INVALID_REFERENCE: 'Not a valid {{azkv://...}} reference.',
  NOT_FOUND: 'Secret not found in the configured vault.',
  FORBIDDEN: 'Authenticated, but missing read access to this secret. Add the "Key Vault Secrets User" role.',
  AUTH_FAILED: 'Could not authenticate to Azure. Try `az login` or sign in via the picker.',
  NETWORK: 'Could not reach the vault. Check your network or VPN.',
  CONFIG: 'Secret-provider config is missing or invalid.',
  UNKNOWN: 'Resolution failed for an unknown reason.'
};

const classifyError = (err) => {
  if (!err) return { ok: false, errorCode: ERROR_CODES.UNKNOWN, message: FRIENDLY_MESSAGES.UNKNOWN };

  // Azure SDK RestError carries an HTTP statusCode
  const status = err.statusCode || err.response?.status;
  if (status === 404) return { ok: false, errorCode: ERROR_CODES.NOT_FOUND, message: FRIENDLY_MESSAGES.NOT_FOUND };
  if (status === 403) return { ok: false, errorCode: ERROR_CODES.FORBIDDEN, message: FRIENDLY_MESSAGES.FORBIDDEN };
  if (status === 401) return { ok: false, errorCode: ERROR_CODES.AUTH_FAILED, message: FRIENDLY_MESSAGES.AUTH_FAILED };

  // @azure/identity surfaces these names when no credential succeeds
  const name = err.name || '';
  if (name === 'CredentialUnavailableError' || name === 'AuthenticationRequiredError' || name === 'AuthenticationError') {
    return { ok: false, errorCode: ERROR_CODES.AUTH_FAILED, message: FRIENDLY_MESSAGES.AUTH_FAILED };
  }
  if (name === 'AggregateAuthenticationError') {
    return { ok: false, errorCode: ERROR_CODES.AUTH_FAILED, message: FRIENDLY_MESSAGES.AUTH_FAILED };
  }

  // Network-layer
  const code = err.code || '';
  if (code === 'ENOTFOUND' || code === 'ECONNREFUSED' || code === 'ETIMEDOUT' || code === 'EAI_AGAIN' || code === 'ECONNRESET') {
    return { ok: false, errorCode: ERROR_CODES.NETWORK, message: FRIENDLY_MESSAGES.NETWORK };
  }

  return { ok: false, errorCode: ERROR_CODES.UNKNOWN, message: err.message || FRIENDLY_MESSAGES.UNKNOWN };
};

module.exports = { ERROR_CODES, FRIENDLY_MESSAGES, classifyError };
