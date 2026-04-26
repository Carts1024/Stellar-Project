/**
 * Simple TTL-based in-memory cache for contract read results.
 *
 * Responsibilities:
 *  - Store serialisable values keyed by a string
 *  - Expire entries after a configurable TTL
 *  - Allow targeted invalidation by exact key or key prefix
 *
 * This module has no external dependencies and makes no network calls.
 * It is intentionally kept small — one concern, one file.
 */

interface CacheEntry<T> {
  readonly value: T;
  readonly expiresAt: number;
}

/** Default TTL: 30 seconds — long enough to avoid redundant RPC calls on
 *  the same page, short enough that stale data resolves quickly. */
const DEFAULT_TTL_MS = 30_000;

const store = new Map<string, CacheEntry<unknown>>();

export function getCached<T>(key: string): T | undefined {
  const entry = store.get(key) as CacheEntry<T> | undefined;
  if (!entry) return undefined;
  if (Date.now() > entry.expiresAt) {
    store.delete(key);
    return undefined;
  }
  return entry.value;
}

export function setCached<T>(key: string, value: T, ttlMs = DEFAULT_TTL_MS): void {
  store.set(key, { value, expiresAt: Date.now() + ttlMs });
}

/** Remove one or more exact-match keys. */
export function invalidateCached(...keys: string[]): void {
  for (const key of keys) {
    store.delete(key);
  }
}

/** Remove every key that starts with the given prefix. */
export function invalidateCachedByPrefix(prefix: string): void {
  for (const key of store.keys()) {
    if (key.startsWith(prefix)) {
      store.delete(key);
    }
  }
}
