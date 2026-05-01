const { SecretCache } = require('../src/cache');

describe('SecretCache', () => {
  test('caches a value for the configured TTL', async () => {
    const cache = new SecretCache({ ttlMs: 60_000 });
    let calls = 0;
    const fetcher = async () => { calls++; return 'value'; };
    expect(await cache.getOrFetch('k', fetcher)).toBe('value');
    expect(await cache.getOrFetch('k', fetcher)).toBe('value');
    expect(calls).toBe(1);
  });

  test('expires stale entries', async () => {
    const cache = new SecretCache({ ttlMs: 5 });
    let calls = 0;
    const fetcher = async () => { calls++; return 'v' + calls; };
    expect(await cache.getOrFetch('k', fetcher)).toBe('v1');
    await new Promise((r) => setTimeout(r, 15));
    expect(await cache.getOrFetch('k', fetcher)).toBe('v2');
  });

  test('dedupes concurrent in-flight fetches', async () => {
    const cache = new SecretCache({ ttlMs: 60_000 });
    let calls = 0;
    const fetcher = () => new Promise((resolve) => setTimeout(() => { calls++; resolve('v'); }, 10));
    const [a, b, c] = await Promise.all([
      cache.getOrFetch('k', fetcher),
      cache.getOrFetch('k', fetcher),
      cache.getOrFetch('k', fetcher)
    ]);
    expect([a, b, c]).toEqual(['v', 'v', 'v']);
    expect(calls).toBe(1);
  });

  test('caches negative results briefly to avoid hammering', async () => {
    const cache = new SecretCache({ ttlMs: 60_000, negativeTtlMs: 50 });
    let calls = 0;
    const fetcher = async () => { calls++; throw new Error('nope'); };
    await expect(cache.getOrFetch('k', fetcher)).rejects.toThrow('nope');
    await expect(cache.getOrFetch('k', fetcher)).rejects.toThrow('nope');
    expect(calls).toBe(1);
    await new Promise((r) => setTimeout(r, 60));
    await expect(cache.getOrFetch('k', fetcher)).rejects.toThrow('nope');
    expect(calls).toBe(2);
  });
});
