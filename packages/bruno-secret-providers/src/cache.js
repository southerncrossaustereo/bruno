// In-memory TTL cache for resolved secrets.
// Stores the in-flight Promise so concurrent fetches dedupe.
// Negative results are cached for a short window to avoid hammering KV
// on misconfigured references.

const DEFAULT_TTL_MS = 5 * 60 * 1000;
const NEGATIVE_TTL_MS = 5 * 1000;

class SecretCache {
  constructor({ ttlMs = DEFAULT_TTL_MS, negativeTtlMs = NEGATIVE_TTL_MS } = {}) {
    this.ttlMs = ttlMs;
    this.negativeTtlMs = negativeTtlMs;
    this.entries = new Map();
  }

  get(key) {
    const entry = this.entries.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.entries.delete(key);
      return null;
    }
    return entry;
  }

  // fetcher: () => Promise<string>
  async getOrFetch(key, fetcher) {
    const existing = this.get(key);
    if (existing) {
      if (existing.error) throw existing.error;
      return existing.promise ? existing.promise : Promise.resolve(existing.value);
    }

    const promise = (async () => {
      try {
        const value = await fetcher();
        this.entries.set(key, {
          value,
          error: null,
          promise: null,
          expiresAt: Date.now() + this.ttlMs
        });
        return value;
      } catch (err) {
        this.entries.set(key, {
          value: null,
          error: err,
          promise: null,
          expiresAt: Date.now() + this.negativeTtlMs
        });
        throw err;
      }
    })();

    this.entries.set(key, {
      value: null,
      error: null,
      promise,
      expiresAt: Date.now() + this.ttlMs
    });
    return promise;
  }

  clear() {
    this.entries.clear();
  }
}

module.exports = { SecretCache, DEFAULT_TTL_MS, NEGATIVE_TTL_MS };
