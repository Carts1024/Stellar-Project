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

import { readStoredValue, removeStoredValue, writeStoredValue } from "@/lib/pwa/browser-storage";

type PersistedCacheEntry = {
  key: string;
  value: unknown;
  expiresAt: number;
};

type PersistedCacheSnapshot = {
  entries: PersistedCacheEntry[];
  version: 1;
};

/** Default TTL: 30 seconds — long enough to avoid redundant RPC calls on
 *  the same page, short enough that stale data resolves quickly. */
const DEFAULT_TTL_MS = 30_000;
const MAX_PERSISTED_ENTRIES = 100;
const PERSISTED_CACHE_KEY = "talambag:read-cache:v1";

const store = new Map<string, CacheEntry<unknown>>();
let hydrated = false;

function hydrateStore() {
  if (hydrated) {
    return;
  }

  hydrated = true;
  const snapshot = readStoredValue<unknown>(PERSISTED_CACHE_KEY);
  if (
    typeof snapshot !== "object" ||
    snapshot === null ||
    !("version" in snapshot) ||
    snapshot.version !== 1 ||
    !("entries" in snapshot) ||
    !Array.isArray(snapshot.entries)
  ) {
    removeStoredValue(PERSISTED_CACHE_KEY);
    return;
  }

  const now = Date.now();
  for (const entry of snapshot.entries as PersistedCacheSnapshot["entries"]) {
    if (
      typeof entry !== "object" ||
      entry === null ||
      typeof entry.key !== "string" ||
      typeof entry.expiresAt !== "number" ||
      entry.expiresAt <= now
    ) {
      continue;
    }

    store.set(entry.key, {
      value: entry.value,
      expiresAt: entry.expiresAt,
    });
  }
}

function persistStore() {
  const now = Date.now();
  const entries = Array.from(store.entries())
    .filter(([, entry]) => entry.expiresAt > now)
    .slice(-MAX_PERSISTED_ENTRIES)
    .map(([key, entry]) => ({
      key,
      value: entry.value,
      expiresAt: entry.expiresAt,
    } satisfies PersistedCacheEntry));

  if (entries.length === 0) {
    removeStoredValue(PERSISTED_CACHE_KEY);
    return;
  }

  writeStoredValue(PERSISTED_CACHE_KEY, {
    entries,
    version: 1,
  } satisfies PersistedCacheSnapshot);
}

export function getCached<T>(key: string): T | undefined {
  hydrateStore();
  const entry = store.get(key) as CacheEntry<T> | undefined;
  if (!entry) return undefined;
  if (Date.now() > entry.expiresAt) {
    store.delete(key);
    persistStore();
    return undefined;
  }
  return entry.value;
}

export function setCached<T>(key: string, value: T, ttlMs = DEFAULT_TTL_MS): void {
  hydrateStore();
  store.set(key, { value, expiresAt: Date.now() + ttlMs });
  persistStore();
}

/** Remove one or more exact-match keys. */
export function invalidateCached(...keys: string[]): void {
  hydrateStore();
  for (const key of keys) {
    store.delete(key);
  }

  persistStore();
}

/** Remove every key that starts with the given prefix. */
export function invalidateCachedByPrefix(prefix: string): void {
  hydrateStore();
  for (const key of store.keys()) {
    if (key.startsWith(prefix)) {
      store.delete(key);
    }
  }

  persistStore();
}
