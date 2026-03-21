// ===========================================
// @ordinatio/auth — Pluggable Security Store
// ===========================================
// SecurityStore interface + InMemoryStore with LRU eviction.
// Sync-only by design (async would cascade Promise through every consumer).
// ===========================================

/**
 * Configuration for InMemoryStore.
 */
export interface InMemoryStoreConfig {
  /** Maximum entries before LRU eviction kicks in. 0 = unlimited. */
  maxEntries: number;
}

/**
 * Sync, Map-compatible store interface for security state.
 * Implementations: InMemoryStore (built-in), Redis (app-layer bridge).
 */
export interface SecurityStore<V> {
  get(key: string): V | undefined;
  set(key: string, value: V): void;
  delete(key: string): boolean;
  has(key: string): boolean;
  readonly size: number;
  entries(): IterableIterator<[string, V]>;
  clear(): void;
}

/**
 * In-memory store with LRU eviction when maxEntries is exceeded.
 *
 * Access order is tracked: `get()` promotes an entry to most-recently-used.
 * When a `set()` would exceed maxEntries, the least-recently-used entry is evicted.
 *
 * Default maxEntries: 10,000. Set to 0 for unlimited (same as plain Map).
 */
export class InMemoryStore<V> implements SecurityStore<V> {
  private readonly store = new Map<string, V>();
  private readonly maxEntries: number;

  constructor(config?: Partial<InMemoryStoreConfig>) {
    this.maxEntries = config?.maxEntries ?? 10_000;
  }

  get(key: string): V | undefined {
    const value = this.store.get(key);
    if (value !== undefined) {
      // Promote to most-recently-used by re-inserting
      this.store.delete(key);
      this.store.set(key, value);
    }
    return value;
  }

  set(key: string, value: V): void {
    // If key already exists, delete first to update insertion order
    if (this.store.has(key)) {
      this.store.delete(key);
    }

    // Evict oldest entries if at capacity
    if (this.maxEntries > 0) {
      while (this.store.size >= this.maxEntries) {
        const oldest = this.store.keys().next();
        if (!oldest.done) {
          this.store.delete(oldest.value);
        }
      }
    }

    this.store.set(key, value);
  }

  delete(key: string): boolean {
    return this.store.delete(key);
  }

  has(key: string): boolean {
    return this.store.has(key);
  }

  get size(): number {
    return this.store.size;
  }

  entries(): IterableIterator<[string, V]> {
    return this.store.entries();
  }

  clear(): void {
    this.store.clear();
  }
}
