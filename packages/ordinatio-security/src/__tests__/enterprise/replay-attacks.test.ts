// ===========================================
// 4. Replay Attack Tests
// ===========================================
// Critical for email capsules, auth tokens, approvals.
// Includes concurrency, not just serial.
// ===========================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { InMemoryNonceStore } from '../../replay/nonce-store';
import { shouldBlockAction } from '../../enforcement/action-gate';
import { createMockDb, resetIdCounter } from '../test-helpers';

describe('serial replay scenarios', () => {
  let store: InMemoryNonceStore;

  beforeEach(() => {
    store = new InMemoryNonceStore();
  });

  it('same nonce twice → second rejected', () => {
    const r1 = store.checkAndSet('nonce-A');
    const r2 = store.checkAndSet('nonce-A');
    expect(r1.valid).toBe(true);
    expect(r2.valid).toBe(false);
    expect(r2.reason).toBe('duplicate');
  });

  it('same nonce three times → all after first rejected', () => {
    expect(store.checkAndSet('n1').valid).toBe(true);
    expect(store.checkAndSet('n1').valid).toBe(false);
    expect(store.checkAndSet('n1').valid).toBe(false);
  });

  it('nonce expired → rejected with "expired"', () => {
    const result = store.checkAndSet('stale', undefined, new Date(Date.now() - 1000));
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('expired');
  });

  it('nonce valid but old timestamp (within TTL)', () => {
    // Store with 1h TTL
    const longStore = new InMemoryNonceStore(10_000, 3_600_000);
    const result = longStore.checkAndSet('old-but-valid');
    expect(result.valid).toBe(true);
    // Can't replay
    expect(longStore.checkAndSet('old-but-valid').valid).toBe(false);
  });

  it('nonce with future timestamp (custom expiry)', () => {
    const future = new Date(Date.now() + 60_000);
    const result = store.checkAndSet('future-nonce', undefined, future);
    expect(result.valid).toBe(true);
  });

  it('different nonces are all accepted', () => {
    for (let i = 0; i < 100; i++) {
      expect(store.checkAndSet(`unique-${i}`).valid).toBe(true);
    }
  });
});

describe('concurrent replay scenarios', () => {
  it('same nonce from concurrent "workers" → only first succeeds', async () => {
    resetIdCounter();
    const db = createMockDb();
    const nonceStore = new InMemoryNonceStore();

    // Simulate 5 concurrent workers trying the same nonce
    const results = await Promise.all(
      Array.from({ length: 5 }, (_, i) =>
        shouldBlockAction(db, {
          principal: { principalId: `worker-${i}`, principalType: 'automation' },
          action: 'process',
          nonce: 'shared-nonce',
        }, { nonceStore })
      )
    );

    const allowed = results.filter(r => !r.blocked);
    const blocked = results.filter(r => r.blocked);

    expect(allowed).toHaveLength(1); // Exactly one succeeds
    expect(blocked).toHaveLength(4); // Rest are blocked
  });

  it('different nonces from concurrent workers → all succeed', async () => {
    resetIdCounter();
    const db = createMockDb();
    const nonceStore = new InMemoryNonceStore();

    const results = await Promise.all(
      Array.from({ length: 10 }, (_, i) =>
        shouldBlockAction(db, {
          principal: { principalId: `worker-${i}`, principalType: 'automation' },
          action: 'process',
          nonce: `unique-nonce-${i}`,
        }, { nonceStore })
      )
    );

    expect(results.every(r => !r.blocked)).toBe(true);
  });

  it('burst of same nonce → no duplicate execution', async () => {
    resetIdCounter();
    const db = createMockDb();
    const nonceStore = new InMemoryNonceStore();
    let executionCount = 0;

    const results = await Promise.all(
      Array.from({ length: 20 }, () =>
        shouldBlockAction(db, {
          principal: { principalId: 'worker', principalType: 'automation' },
          action: 'critical_op',
          nonce: 'burst-nonce',
        }, { nonceStore }).then(r => {
          if (!r.blocked) executionCount++;
          return r;
        })
      )
    );

    expect(executionCount).toBe(1); // Exactly once
  });
});

describe('nonce TTL interaction with replay', () => {
  it('expired nonce can be reused after TTL', () => {
    vi.useFakeTimers();
    const store = new InMemoryNonceStore(100, 1000); // 1s TTL

    store.checkAndSet('reusable');
    vi.advanceTimersByTime(2000); // Past TTL

    const result = store.checkAndSet('reusable');
    expect(result.valid).toBe(true); // Accepted again after expiry

    vi.useRealTimers();
  });

  it('nonce within TTL cannot be reused', () => {
    vi.useFakeTimers();
    const store = new InMemoryNonceStore(100, 10_000); // 10s TTL

    store.checkAndSet('recent');
    vi.advanceTimersByTime(5000); // Still within TTL

    const result = store.checkAndSet('recent');
    expect(result.valid).toBe(false);

    vi.useRealTimers();
  });
});

describe('issuer isolation', () => {
  it('same nonce from different logical contexts — store does not isolate by issuer', () => {
    const store = new InMemoryNonceStore();
    // Current implementation: nonce is globally unique, not per-issuer
    expect(store.checkAndSet('n1', 'issuer-A').valid).toBe(true);
    expect(store.checkAndSet('n1', 'issuer-B').valid).toBe(false);
    // This is a design choice — nonces should be globally unique
  });
});
