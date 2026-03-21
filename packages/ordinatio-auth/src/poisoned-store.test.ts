import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  recordLoginAttempt,
  checkAccountLockout,
  setLockoutStore,
  setSessionStore,
  detectSuspiciousActivity,
  checkSessionValidity,
  _resetLoginAttemptStore,
  _resetSessionActivityStore,
  InMemoryStore,
} from './index';
import type { SecurityStore } from './store';
import type { Session } from './types';

// =========================================
// POISONED STORE — a SecurityStore that
// throws, returns garbage, or delays
// =========================================

type PoisonMode = 'throw-on-get' | 'throw-on-set' | 'throw-on-delete' | 'throw-on-entries'
  | 'return-undefined' | 'infinite-size' | 'throw-all';

class PoisonedStore<V> implements SecurityStore<V> {
  private readonly fallback = new Map<string, V>();
  private mode: PoisonMode;
  public callCounts = { get: 0, set: 0, delete: 0, has: 0, entries: 0, clear: 0 };

  constructor(mode: PoisonMode) {
    this.mode = mode;
  }

  get(key: string): V | undefined {
    this.callCounts.get++;
    if (this.mode === 'throw-on-get' || this.mode === 'throw-all') {
      throw new Error('PoisonedStore: get failed');
    }
    if (this.mode === 'return-undefined') return undefined;
    return this.fallback.get(key);
  }

  set(key: string, value: V): void {
    this.callCounts.set++;
    if (this.mode === 'throw-on-set' || this.mode === 'throw-all') {
      throw new Error('PoisonedStore: set failed');
    }
    this.fallback.set(key, value);
  }

  delete(key: string): boolean {
    this.callCounts.delete++;
    if (this.mode === 'throw-on-delete' || this.mode === 'throw-all') {
      throw new Error('PoisonedStore: delete failed');
    }
    return this.fallback.delete(key);
  }

  has(key: string): boolean {
    this.callCounts.has++;
    if (this.mode === 'throw-all') {
      throw new Error('PoisonedStore: has failed');
    }
    return this.fallback.has(key);
  }

  get size(): number {
    if (this.mode === 'infinite-size') return Number.MAX_SAFE_INTEGER;
    return this.fallback.size;
  }

  entries(): IterableIterator<[string, V]> {
    this.callCounts.entries++;
    if (this.mode === 'throw-on-entries' || this.mode === 'throw-all') {
      throw new Error('PoisonedStore: entries failed');
    }
    return this.fallback.entries();
  }

  clear(): void {
    this.callCounts.clear++;
    this.fallback.clear();
  }
}

// A store that silently drops writes
class BlackHoleStore<V> implements SecurityStore<V> {
  get(_key: string): V | undefined { return undefined; }
  set(_key: string, _value: V): void { /* swallowed */ }
  delete(_key: string): boolean { return false; }
  has(_key: string): boolean { return false; }
  get size(): number { return 0; }
  *entries(): IterableIterator<[string, V]> { /* empty */ }
  clear(): void { /* no-op */ }
}

// A store that always returns the same value regardless of key
class StaleStore<V> implements SecurityStore<V> {
  private staleValue: V;
  private store = new Map<string, V>();

  constructor(staleValue: V) {
    this.staleValue = staleValue;
  }

  get(_key: string): V | undefined { return this.staleValue; }
  set(key: string, value: V): void { this.store.set(key, value); }
  delete(key: string): boolean { return this.store.delete(key); }
  has(_key: string): boolean { return true; }
  get size(): number { return this.store.size; }
  entries(): IterableIterator<[string, V]> { return this.store.entries(); }
  clear(): void { this.store.clear(); }
}

describe('poisoned store stress tests', () => {
  beforeEach(() => {
    _resetLoginAttemptStore();
    _resetSessionActivityStore();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-02-07T10:00:00Z'));
  });

  afterEach(() => {
    // Reset to default InMemoryStore after each test
    setLockoutStore(new InMemoryStore({ maxEntries: 10_000 }));
    setSessionStore(new InMemoryStore({ maxEntries: 50_000 }));
    vi.useRealTimers();
  });

  const createSession = (): Session => ({
    id: 'poison-session',
    userId: 'user-1',
    createdAt: new Date(),
    lastActiveAt: new Date(),
    ip: '1.1.1.1',
  });

  describe('throw-on-get: lockout store', () => {
    it('recordLoginAttempt throws when store.get throws', () => {
      const poison = new PoisonedStore('throw-on-get');
      setLockoutStore(poison as SecurityStore<unknown> as any);

      expect(() => {
        recordLoginAttempt({
          email: 'test@test.com', ip: '1.1.1.1', timestamp: new Date(), success: false,
        });
      }).toThrow('PoisonedStore: get failed');
    });

    it('checkAccountLockout throws when store.get throws', () => {
      const poison = new PoisonedStore('throw-on-get');
      setLockoutStore(poison as SecurityStore<unknown> as any);

      expect(() => checkAccountLockout('test@test.com')).toThrow('PoisonedStore: get failed');
    });
  });

  describe('throw-on-set: lockout store', () => {
    it('recordLoginAttempt throws when store.set throws', () => {
      const poison = new PoisonedStore('throw-on-set');
      setLockoutStore(poison as SecurityStore<unknown> as any);

      expect(() => {
        recordLoginAttempt({
          email: 'test@test.com', ip: '1.1.1.1', timestamp: new Date(), success: false,
        });
      }).toThrow('PoisonedStore: set failed');
    });
  });

  describe('throw-on-get: session store', () => {
    it('detectSuspiciousActivity throws when session store.get throws', () => {
      const poison = new PoisonedStore('throw-on-get');
      setSessionStore(poison as SecurityStore<unknown> as any);

      expect(() => {
        detectSuspiciousActivity(createSession(), '1.1.1.1');
      }).toThrow('PoisonedStore: get failed');
    });
  });

  describe('black hole store: all writes silently lost', () => {
    it('lockout always reports 0 failed attempts with black hole', () => {
      setLockoutStore(new BlackHoleStore() as SecurityStore<unknown> as any);

      // Record 10 failures
      for (let i = 0; i < 10; i++) {
        recordLoginAttempt({
          email: 'black@test.com', ip: '1.1.1.1', timestamp: new Date(), success: false,
        });
      }

      // Store swallows everything — account is never locked
      const status = checkAccountLockout('black@test.com');
      expect(status.locked).toBe(false);
      expect(status.failedAttempts).toBe(0);
    });

    it('suspicious activity always starts fresh with black hole', () => {
      setSessionStore(new BlackHoleStore() as SecurityStore<unknown> as any);

      const session = createSession();

      // All activity is lost
      for (let i = 0; i < 10; i++) {
        detectSuspiciousActivity(session, `10.0.0.${i}`);
      }

      // Next check starts from scratch
      const result = detectSuspiciousActivity(session, '192.168.1.1');
      // With black hole, previous activities are gone
      // New record is created but then lost on next call
      expect(result).toBeDefined();
      expect(typeof result.suspicious).toBe('boolean');
    });
  });

  describe('stale store: always returns same value', () => {
    it('lockout sees stale data but does not crash', () => {
      const staleRecord = {
        attempts: [
          { email: 'stale@test.com', ip: '1.1.1.1', timestamp: new Date(), success: false },
        ],
        lockoutLevel: 0,
      };
      const stale = new StaleStore(staleRecord);
      setLockoutStore(stale as SecurityStore<unknown> as any);

      // Even though we record for different emails, store always returns same record
      recordLoginAttempt({
        email: 'other@test.com', ip: '2.2.2.2', timestamp: new Date(), success: false,
      });

      const status = checkAccountLockout('anyone@test.com');
      // Gets stale record for any email
      expect(status.failedAttempts).toBeGreaterThanOrEqual(0);
      expect(status.manifest).toBeDefined();
    });
  });

  describe('store injection lifecycle', () => {
    it('setLockoutStore replaces store and new writes go to new store', () => {
      const store1 = new InMemoryStore<any>({ maxEntries: 10_000 });
      const store2 = new InMemoryStore<any>({ maxEntries: 10_000 });

      setLockoutStore(store1);
      recordLoginAttempt({
        email: 'first@test.com', ip: '1.1.1.1', timestamp: new Date(), success: false,
      });
      expect(store1.size).toBe(1);

      setLockoutStore(store2);
      recordLoginAttempt({
        email: 'second@test.com', ip: '1.1.1.1', timestamp: new Date(), success: false,
      });
      expect(store2.size).toBe(1);
      // Old store still has its data but is no longer used
      expect(store1.size).toBe(1);
    });

    it('setSessionStore replaces store', () => {
      const store1 = new InMemoryStore<any>({ maxEntries: 50_000 });
      const store2 = new InMemoryStore<any>({ maxEntries: 50_000 });

      setSessionStore(store1);
      detectSuspiciousActivity(createSession(), '1.1.1.1');
      expect(store1.size).toBe(1);

      setSessionStore(store2);
      detectSuspiciousActivity({ ...createSession(), id: 'session-2' }, '2.2.2.2');
      expect(store2.size).toBe(1);
    });
  });

  describe('InMemoryStore edge cases under stress', () => {
    it('maxEntries=1: only keeps the last entry', () => {
      const store = new InMemoryStore<number>({ maxEntries: 1 });

      for (let i = 0; i < 100; i++) {
        store.set(`key-${i}`, i);
      }

      expect(store.size).toBe(1);
      expect(store.get('key-99')).toBe(99);
      expect(store.get('key-0')).toBeUndefined();
    });

    it('maxEntries=0: unlimited (no eviction)', () => {
      const store = new InMemoryStore<number>({ maxEntries: 0 });

      for (let i = 0; i < 1000; i++) {
        store.set(`key-${i}`, i);
      }

      expect(store.size).toBe(1000);
    });

    it('LRU eviction preserves recently accessed keys', () => {
      const store = new InMemoryStore<number>({ maxEntries: 5 });

      // Insert 5 entries
      for (let i = 0; i < 5; i++) {
        store.set(`key-${i}`, i);
      }

      // Access key-0 (promotes it to MRU)
      store.get('key-0');

      // Insert 3 more (should evict key-1, key-2, key-3 — the LRU)
      for (let i = 5; i < 8; i++) {
        store.set(`key-${i}`, i);
      }

      expect(store.size).toBe(5);
      expect(store.get('key-0')).toBe(0); // Survived (was accessed)
      expect(store.get('key-1')).toBeUndefined(); // Evicted
      expect(store.get('key-2')).toBeUndefined(); // Evicted
      expect(store.get('key-3')).toBeUndefined(); // Evicted
      expect(store.get('key-4')).toBe(4); // Survived (was after accessed key-0)
    });

    it('rapid set-delete-set cycle doesnt corrupt state', () => {
      const store = new InMemoryStore<string>({ maxEntries: 100 });

      for (let i = 0; i < 1000; i++) {
        store.set('volatile', `v-${i}`);
        store.delete('volatile');
        store.set('volatile', `v-${i}-2`);
      }

      expect(store.get('volatile')).toBe('v-999-2');
      expect(store.size).toBe(1);
    });

    it('clear during iteration doesnt crash', () => {
      const store = new InMemoryStore<number>({ maxEntries: 100 });

      for (let i = 0; i < 50; i++) {
        store.set(`key-${i}`, i);
      }

      // This tests that clear is safe even if someone iterates
      store.clear();
      expect(store.size).toBe(0);

      // And store is usable afterward
      store.set('after-clear', 42);
      expect(store.get('after-clear')).toBe(42);
    });

    it('overwrite existing key updates value and position', () => {
      const store = new InMemoryStore<number>({ maxEntries: 3 });

      store.set('a', 1);
      store.set('b', 2);
      store.set('c', 3);

      // Overwrite 'a' — moves it to MRU position
      store.set('a', 100);

      // Insert 'd' — should evict 'b' (LRU, since 'a' was re-inserted)
      store.set('d', 4);

      expect(store.size).toBe(3);
      expect(store.get('a')).toBe(100);
      expect(store.get('b')).toBeUndefined(); // Evicted
      expect(store.get('c')).toBe(3);
      expect(store.get('d')).toBe(4);
    });
  });

  describe('store with complex value types', () => {
    it('handles Set values (like session activity)', () => {
      const store = new InMemoryStore<{ ips: Set<string>; count: number }>({ maxEntries: 100 });

      store.set('session-1', { ips: new Set(['1.1.1.1', '2.2.2.2']), count: 5 });
      const val = store.get('session-1');
      expect(val).toBeDefined();
      expect(val!.ips.size).toBe(2);
      expect(val!.count).toBe(5);
    });

    it('handles array values', () => {
      const store = new InMemoryStore<number[]>({ maxEntries: 100 });
      store.set('list', [1, 2, 3]);
      const val = store.get('list')!;
      val.push(4);
      // Mutating the retrieved value should affect the stored value (reference)
      expect(store.get('list')).toEqual([1, 2, 3, 4]);
    });
  });
});
