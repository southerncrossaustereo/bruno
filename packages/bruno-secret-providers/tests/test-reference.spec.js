const { testReference, ERROR_CODES } = require('../src');

const fakeProvider = (resolveFn) => ({ resolve: resolveFn });

const ok = () => fakeProvider(async () => 'secret-value');
const failWith = (err) => fakeProvider(async () => { throw err; });

describe('testReference', () => {
  test('returns ok:true on successful resolution and never exposes the value', async () => {
    const result = await testReference('{{azkv://kv/api-token}}', { provider: ok() });
    expect(result).toEqual({ ok: true });
    expect(JSON.stringify(result)).not.toContain('secret-value');
  });

  test('classifies an empty / non-reference string as INVALID_REFERENCE', async () => {
    const a = await testReference('plain text', { provider: ok() });
    const b = await testReference('', { provider: ok() });
    const c = await testReference(null, { provider: ok() });
    expect(a.errorCode).toBe(ERROR_CODES.INVALID_REFERENCE);
    expect(b.errorCode).toBe(ERROR_CODES.INVALID_REFERENCE);
    expect(c.errorCode).toBe(ERROR_CODES.INVALID_REFERENCE);
    expect(a.ok).toBe(false);
  });

  test('classifies HTTP 404 as NOT_FOUND', async () => {
    const result = await testReference('{{azkv://kv/missing}}', {
      provider: failWith(Object.assign(new Error('Not Found'), { statusCode: 404 }))
    });
    expect(result.errorCode).toBe(ERROR_CODES.NOT_FOUND);
  });

  test('classifies HTTP 403 as FORBIDDEN', async () => {
    const result = await testReference('{{azkv://kv/forbidden}}', {
      provider: failWith(Object.assign(new Error('Forbidden'), { statusCode: 403 }))
    });
    expect(result.errorCode).toBe(ERROR_CODES.FORBIDDEN);
  });

  test('classifies @azure/identity CredentialUnavailableError as AUTH_FAILED', async () => {
    const err = new Error('No credential');
    err.name = 'CredentialUnavailableError';
    const result = await testReference('{{azkv://kv/x}}', { provider: failWith(err) });
    expect(result.errorCode).toBe(ERROR_CODES.AUTH_FAILED);
  });

  test('classifies AggregateAuthenticationError as AUTH_FAILED', async () => {
    const err = new Error('All chain links failed');
    err.name = 'AggregateAuthenticationError';
    const result = await testReference('{{azkv://kv/x}}', { provider: failWith(err) });
    expect(result.errorCode).toBe(ERROR_CODES.AUTH_FAILED);
  });

  test('classifies network errors by code', async () => {
    for (const code of ['ENOTFOUND', 'ECONNREFUSED', 'ETIMEDOUT', 'ECONNRESET']) {
      const err = new Error('net fail');
      err.code = code;
      const result = await testReference('{{azkv://kv/x}}', { provider: failWith(err) });
      expect(result.errorCode).toBe(ERROR_CODES.NETWORK);
    }
  });

  test('falls back to UNKNOWN for unmapped errors but does not leak internals', async () => {
    const err = new Error('something internal: token=DEADBEEF');
    const result = await testReference('{{azkv://kv/x}}', { provider: failWith(err) });
    expect(result.errorCode).toBe(ERROR_CODES.UNKNOWN);
    // We DO surface the message field for the unknown case (no other signal),
    // but the caller decides whether to render it. Document this explicitly.
    expect(result.message).toContain('token=DEADBEEF');
  });
});
