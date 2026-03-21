import { describe, it, expect } from 'vitest';
import { InMemoryStore } from './store';
import type { SecurityStore } from './store';

describe('InMemoryStore', () => {
  describe('basic CRUD', () => {
    it('stores and retrieves values', () => {
      const store = new InMemoryStore<string>();
      store.set('key1', 'value1');
      expect(store.get('key1')).toBe('value1');
    });

    it('returns undefined for missing keys', () => {
      const store = new InMemoryStore<string>();
      expect(store.get('nonexistent')).toBeUndefined();
    });

    it('overwrites existing values', () => {
      const store = new InMemoryStore<number>();
      store.set('key', 1);
      store.set('key', 2);
      expect(store.get('key')).toBe(2);
      expect(store.size).toBe(1);
    });

    it('deletes entries', () => {
      const store = new InMemoryStore<string>();
      store.set('key', 'value');
      expect(store.delete('key')).toBe(true);
      expect(store.get('key')).toBeUndefined();
      expect(store.size).toBe(0);
    });

    it('returns false when deleting nonexistent key', () => {
      const store = new InMemoryStore<string>();
      expect(store.delete('nonexistent')).toBe(false);
    });

    it('checks key existence with has()', () => {
      const store = new InMemoryStore<string>();
      store.set('key', 'value');
      expect(store.has('key')).toBe(true);
      expect(store.has('other')).toBe(false);
    });

    it('tracks size correctly', () => {
      const store = new InMemoryStore<string>();
      expect(store.size).toBe(0);
      store.set('a', '1');
      expect(store.size).toBe(1);
      store.set('b', '2');
      expect(store.size).toBe(2);
      store.delete('a');
      expect(store.size).toBe(1);
    });

    it('clears all entries', () => {
      const store = new InMemoryStore<string>();
      store.set('a', '1');
      store.set('b', '2');
      store.set('c', '3');
      store.clear();
      expect(store.size).toBe(0);
      expect(store.get('a')).toBeUndefined();
    });

    it('iterates entries', () => {
      const store = new InMemoryStore<number>();
      store.set('a', 1);
      store.set('b', 2);
      store.set('c', 3);
      const entries = Array.from(store.entries());
      expect(entries).toHaveLength(3);
      expect(entries.map(([k]) => k)).toEqual(['a', 'b', 'c']);
    });
  });

  describe('LRU eviction', () => {
    it('evicts oldest entry when maxEntries exceeded', () => {
      const store = new InMemoryStore<string>({ maxEntries: 3 });
      store.set('a', '1');
      store.set('b', '2');
      store.set('c', '3');
      store.set('d', '4'); // Should evict 'a'

      expect(store.size).toBe(3);
      expect(store.has('a')).toBe(false);
      expect(store.get('b')).toBe('2');
      expect(store.get('c')).toBe('3');
      expect(store.get('d')).toBe('4');
    });

    it('promotes accessed entry on get()', () => {
      const store = new InMemoryStore<string>({ maxEntries: 3 });
      store.set('a', '1');
      store.set('b', '2');
      store.set('c', '3');

      // Access 'a' to promote it
      store.get('a');

      // Now 'b' is the oldest
      store.set('d', '4'); // Should evict 'b'

      expect(store.has('a')).toBe(true); // Promoted
      expect(store.has('b')).toBe(false); // Evicted
      expect(store.has('c')).toBe(true);
      expect(store.has('d')).toBe(true);
    });

    it('promotes entry on set() (overwrite)', () => {
      const store = new InMemoryStore<string>({ maxEntries: 3 });
      store.set('a', '1');
      store.set('b', '2');
      store.set('c', '3');

      // Overwrite 'a' to promote it
      store.set('a', 'updated');

      // Now 'b' is the oldest
      store.set('d', '4'); // Should evict 'b'

      expect(store.get('a')).toBe('updated');
      expect(store.has('b')).toBe(false);
    });

    it('handles maxEntries: 1', () => {
      const store = new InMemoryStore<string>({ maxEntries: 1 });
      store.set('a', '1');
      store.set('b', '2');
      expect(store.size).toBe(1);
      expect(store.has('a')).toBe(false);
      expect(store.get('b')).toBe('2');
    });

    it('handles maxEntries: 0 as unlimited', () => {
      const store = new InMemoryStore<string>({ maxEntries: 0 });
      for (let i = 0; i < 100; i++) {
        store.set(`key-${i}`, `value-${i}`);
      }
      expect(store.size).toBe(100);
      expect(store.get('key-0')).toBe('value-0');
    });

    it('uses default maxEntries of 10_000', () => {
      const store = new InMemoryStore<string>();
      // Verify it doesn't evict before 10k
      for (let i = 0; i < 100; i++) {
        store.set(`key-${i}`, `value-${i}`);
      }
      expect(store.size).toBe(100);
    });

    it('evicts multiple entries during bulk insert', () => {
      const store = new InMemoryStore<string>({ maxEntries: 5 });
      for (let i = 0; i < 10; i++) {
        store.set(`key-${i}`, `value-${i}`);
      }
      expect(store.size).toBe(5);
      // Only the last 5 should remain
      for (let i = 0; i < 5; i++) {
        expect(store.has(`key-${i}`)).toBe(false);
      }
      for (let i = 5; i < 10; i++) {
        expect(store.has(`key-${i}`)).toBe(true);
      }
    });

    it('does not evict when under capacity', () => {
      const store = new InMemoryStore<string>({ maxEntries: 10 });
      store.set('a', '1');
      store.set('b', '2');
      store.set('c', '3');
      expect(store.size).toBe(3);
      expect(store.get('a')).toBe('1');
    });

    it('does not return undefined value on get() for missing key (no side effects)', () => {
      const store = new InMemoryStore<string>({ maxEntries: 3 });
      store.set('a', '1');
      store.get('nonexistent'); // Should not promote anything
      store.set('b', '2');
      store.set('c', '3');
      store.set('d', '4'); // Should evict 'a'
      expect(store.has('a')).toBe(false);
    });
  });

  describe('empty store', () => {
    it('handles operations on empty store', () => {
      const store = new InMemoryStore<string>();
      expect(store.size).toBe(0);
      expect(store.get('key')).toBeUndefined();
      expect(store.has('key')).toBe(false);
      expect(store.delete('key')).toBe(false);
      expect(Array.from(store.entries())).toHaveLength(0);
      store.clear(); // Should not throw
    });
  });

  describe('SecurityStore interface', () => {
    it('conforms to SecurityStore interface', () => {
      const store: SecurityStore<string> = new InMemoryStore<string>();
      store.set('key', 'value');
      expect(store.get('key')).toBe('value');
      expect(store.has('key')).toBe(true);
      expect(store.size).toBe(1);
      expect(Array.from(store.entries())).toHaveLength(1);
      store.delete('key');
      expect(store.size).toBe(0);
    });
  });

  describe('complex value types', () => {
    it('stores objects', () => {
      const store = new InMemoryStore<{ count: number; locked: boolean }>();
      store.set('user1', { count: 5, locked: true });
      const value = store.get('user1');
      expect(value).toEqual({ count: 5, locked: true });
    });

    it('stores arrays', () => {
      const store = new InMemoryStore<number[]>();
      store.set('list', [1, 2, 3]);
      expect(store.get('list')).toEqual([1, 2, 3]);
    });
  });
});
