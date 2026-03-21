// ===========================================
// Nonce Store Tests
// ===========================================

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { InMemoryNonceStore } from '../replay/nonce-store';

describe('InMemoryNonceStore', () => {
  let store: InMemoryNonceStore;

  beforeEach(() => {
    store = new InMemoryNonceStore(100, 60_000); // 100 max, 60s TTL
  });

  it('accepts a fresh nonce', () => {
    const result = store.checkAndSet('nonce-1');
    expect(result.valid).toBe(true);
    expect(result.reason).toBe('ok');
  });

  it('rejects a duplicate nonce', () => {
    store.checkAndSet('nonce-1');
    const result = store.checkAndSet('nonce-1');
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('duplicate');
  });

  it('rejects an already-expired nonce', () => {
    const past = new Date(Date.now() - 1000);
    const result = store.checkAndSet('nonce-expired', undefined, past);
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('expired');
  });

  it('accepts nonce with future expiry', () => {
    const future = new Date(Date.now() + 60_000);
    const result = store.checkAndSet('nonce-future', undefined, future);
    expect(result.valid).toBe(true);
  });

  it('tracks size correctly', () => {
    expect(store.size).toBe(0);
    store.checkAndSet('a');
    store.checkAndSet('b');
    expect(store.size).toBe(2);
  });

  it('has() returns true for stored nonces', () => {
    store.checkAndSet('test');
    expect(store.has('test')).toBe(true);
    expect(store.has('unknown')).toBe(false);
  });

  it('clear() removes all entries', () => {
    store.checkAndSet('a');
    store.checkAndSet('b');
    store.clear();
    expect(store.size).toBe(0);
    expect(store.has('a')).toBe(false);
  });

  it('evicts oldest when at capacity', () => {
    const smallStore = new InMemoryNonceStore(3, 60_000);
    smallStore.checkAndSet('a');
    smallStore.checkAndSet('b');
    smallStore.checkAndSet('c');
    // Store is full, adding d should evict a
    smallStore.checkAndSet('d');
    expect(smallStore.size).toBe(3);
    // 'a' should be evicted, so it's accepted again
    const result = smallStore.checkAndSet('a');
    expect(result.valid).toBe(true);
  });

  it('evicts expired entries on check', () => {
    const shortTtl = new InMemoryNonceStore(100, 1); // 1ms TTL
    shortTtl.checkAndSet('old');

    // Wait for expiration
    vi.useFakeTimers();
    vi.advanceTimersByTime(10);

    // Should be evicted and accepted again
    const result = shortTtl.checkAndSet('old');
    expect(result.valid).toBe(true);

    vi.useRealTimers();
  });

  it('handles many nonces without error', () => {
    for (let i = 0; i < 200; i++) {
      store.checkAndSet(`nonce-${i}`);
    }
    // Should have evicted down to capacity
    expect(store.size).toBeLessThanOrEqual(100);
  });

  it('ignores issuer parameter (reserved for future use)', () => {
    const result = store.checkAndSet('nonce-1', 'issuer-a');
    expect(result.valid).toBe(true);
    const result2 = store.checkAndSet('nonce-1', 'issuer-b');
    expect(result2.valid).toBe(false); // Same nonce regardless of issuer
  });

  it('accepts same nonce from different stores', () => {
    const store2 = new InMemoryNonceStore();
    store.checkAndSet('shared-nonce');
    const result = store2.checkAndSet('shared-nonce');
    expect(result.valid).toBe(true); // Different store, different state
  });
});
