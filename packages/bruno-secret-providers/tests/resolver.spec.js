const { resolveExternalSecrets } = require('../src');

const fakeProvider = (responses, opts = {}) => {
  const calls = [];
  return {
    calls,
    async resolve(ref) {
      calls.push(ref.cacheKey);
      if (opts.fail && opts.fail.has(ref.cacheKey)) {
        throw new Error(`forced failure for ${ref.cacheKey}`);
      }
      const v = responses[ref.cacheKey];
      if (v === undefined) throw new Error(`no fake response for ${ref.cacheKey}`);
      return v;
    }
  };
};

describe('resolveExternalSecrets', () => {
  test('returns early for objects with no references', async () => {
    const target = { url: 'https://example.com', headers: { 'X-A': 'plain' } };
    const provider = fakeProvider({});
    const out = await resolveExternalSecrets(target, { provider });
    expect(out).toEqual({ resolved: 0, errors: [] });
    expect(provider.calls).toEqual([]);
    expect(target.url).toBe('https://example.com');
  });

  test('substitutes references across nested fields', async () => {
    const target = {
      url: 'https://api.example/{{azkv://kv/path-key}}',
      headers: { Authorization: 'Bearer {{azkv://kv/api-token}}' },
      body: { nested: { creds: '{{azkv://kv/db-pass}}' } },
      array: ['x', '{{azkv://kv/api-token}}', 'y'] // duplicate of an earlier ref
    };
    const provider = fakeProvider({
      'https://kv.vault.azure.net|path-key|latest': 'p',
      'https://kv.vault.azure.net|api-token|latest': 'TOKEN',
      'https://kv.vault.azure.net|db-pass|latest': 'DBPASS'
    });
    const out = await resolveExternalSecrets(target, { provider });
    expect(out.errors).toEqual([]);
    expect(out.resolved).toBe(3); // 3 unique refs even though 4 occurrences
    expect(target.url).toBe('https://api.example/p');
    expect(target.headers.Authorization).toBe('Bearer TOKEN');
    expect(target.body.nested.creds).toBe('DBPASS');
    expect(target.array[1]).toBe('TOKEN');
    // dedupe: api-token fetched only once
    const fetches = provider.calls.filter((k) => k.includes('api-token'));
    expect(fetches).toHaveLength(1);
  });

  test('reports errors but leaves token in place when a reference fails', async () => {
    const target = { url: '{{azkv://kv/good}}', header: '{{azkv://kv/bad}}' };
    const provider = fakeProvider(
      { 'https://kv.vault.azure.net|good|latest': 'G' },
      { fail: new Set(['https://kv.vault.azure.net|bad|latest']) }
    );
    const out = await resolveExternalSecrets(target, { provider });
    expect(out.resolved).toBe(1);
    expect(out.errors).toHaveLength(1);
    expect(out.errors[0].raw).toBe('{{azkv://kv/bad}}');
    expect(target.url).toBe('G');
    expect(target.header).toBe('{{azkv://kv/bad}}'); // left intact for downstream warning
  });

  test('honors vaultBaseUrlTemplate from brunoConfig', async () => {
    const target = { url: '{{azkv://gov-kv/secret}}' };
    const provider = fakeProvider({
      'https://gov-kv.vault.usgovcloudapi.net|secret|latest': 'OK'
    });
    const out = await resolveExternalSecrets(target, {
      provider,
      brunoConfig: {
        secretProviders: {
          azureKeyVault: { vaultBaseUrlTemplate: 'https://{vault}.vault.usgovcloudapi.net' }
        }
      }
    });
    expect(out.errors).toEqual([]);
    expect(target.url).toBe('OK');
  });

  test('does not recurse into Buffers', async () => {
    const target = { url: '{{azkv://kv/x}}', body: Buffer.from('binary {{azkv://kv/should-not-fetch}}') };
    const provider = fakeProvider({ 'https://kv.vault.azure.net|x|latest': 'V' });
    const out = await resolveExternalSecrets(target, { provider });
    expect(out.errors).toEqual([]);
    expect(target.url).toBe('V');
    expect(provider.calls).toEqual(['https://kv.vault.azure.net|x|latest']);
  });

  test('accepts an array of targets and substitutes across all of them', async () => {
    // Mirrors the real call: a request that references {{myVar}} plus an
    // env-var map whose value is the {{azkv://...}} reference. Resolving
    // both in one pass means subsequent variable interpolation expands
    // {{myVar}} to the resolved secret rather than the literal token.
    const request = { body: 'token={{myVar}}' };
    const envVars = { myVar: '{{azkv://kv/api-token}}', plain: 'untouched' };
    const provider = fakeProvider({ 'https://kv.vault.azure.net|api-token|latest': 'TOKEN' });
    const out = await resolveExternalSecrets([request, envVars], { provider });
    expect(out.errors).toEqual([]);
    expect(out.resolved).toBe(1);
    expect(envVars.myVar).toBe('TOKEN');
    expect(envVars.plain).toBe('untouched');
    expect(request.body).toBe('token={{myVar}}'); // request body has no azkv ref — left as-is
  });

  test('dedupes references seen across multiple targets', async () => {
    const request = { url: 'https://example/{{azkv://kv/api-token}}' };
    const envVars = { myVar: '{{azkv://kv/api-token}}' };
    const provider = fakeProvider({ 'https://kv.vault.azure.net|api-token|latest': 'TOKEN' });
    const out = await resolveExternalSecrets([request, envVars], { provider });
    expect(out.errors).toEqual([]);
    expect(out.resolved).toBe(1);
    expect(provider.calls).toEqual(['https://kv.vault.azure.net|api-token|latest']);
    expect(request.url).toBe('https://example/TOKEN');
    expect(envVars.myVar).toBe('TOKEN');
  });

  test('skips invalid entries in a target array', async () => {
    const request = { url: '{{azkv://kv/x}}' };
    const provider = fakeProvider({ 'https://kv.vault.azure.net|x|latest': 'V' });
    const out = await resolveExternalSecrets([request, null, undefined, 'not-an-object'], { provider });
    expect(out.errors).toEqual([]);
    expect(request.url).toBe('V');
  });
});
