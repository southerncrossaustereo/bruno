const { findReferences, replaceReferences, buildVaultUrl } = require('../src/reference');

describe('reference parsing', () => {
  test('finds a single latest-version reference with default template', () => {
    const refs = findReferences('Authorization: Bearer {{azkv://my-vault/api-token}}');
    expect(refs).toHaveLength(1);
    expect(refs[0]).toMatchObject({
      vault: 'my-vault',
      secret: 'api-token',
      version: null,
      vaultUrl: 'https://my-vault.vault.azure.net',
      cacheKey: 'https://my-vault.vault.azure.net|api-token|latest'
    });
  });

  test('finds a pinned version reference', () => {
    const refs = findReferences('{{azkv://kv1/db-pass/abc123}}');
    expect(refs[0].version).toBe('abc123');
    expect(refs[0].cacheKey).toContain('|abc123');
  });

  test('finds multiple references in one string and dedupes correctly when same', () => {
    const refs = findReferences('a={{azkv://v/s1}} b={{azkv://v/s2}} c={{azkv://v/s1}}');
    expect(refs).toHaveLength(3); // findReferences doesn't dedupe; resolver does
    expect(refs.map((r) => r.secret)).toEqual(['s1', 's2', 's1']);
  });

  test('skips non-references', () => {
    expect(findReferences('hello {{worldVar}} azkv://no-braces/x')).toEqual([]);
    expect(findReferences('')).toEqual([]);
    expect(findReferences(null)).toEqual([]);
  });

  test('respects custom vaultBaseUrlTemplate (e.g. Azure Gov)', () => {
    const refs = findReferences('{{azkv://gov-vault/api-key}}', {
      vaultBaseUrlTemplate: 'https://{vault}.vault.usgovcloudapi.net'
    });
    expect(refs[0].vaultUrl).toBe('https://gov-vault.vault.usgovcloudapi.net');
  });

  test('treats vault names containing dots as full hosts', () => {
    expect(buildVaultUrl('my-vault.custom-domain.example')).toBe('https://my-vault.custom-domain.example');
    expect(buildVaultUrl('https://full.example')).toBe('https://full.example');
  });

  test('replaceReferences swaps tokens for resolved values, leaves unknowns alone', () => {
    const resolved = new Map([['{{azkv://v/known}}', 'SECRET-VALUE']]);
    const out = replaceReferences('A={{azkv://v/known}} B={{azkv://v/missing}}', resolved);
    expect(out).toBe('A=SECRET-VALUE B={{azkv://v/missing}}');
  });

  test('replaceReferences is a no-op for plain strings', () => {
    const out = replaceReferences('hello world', new Map());
    expect(out).toBe('hello world');
  });
});
