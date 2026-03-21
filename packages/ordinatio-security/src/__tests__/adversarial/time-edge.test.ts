// ===========================================
// Adversarial Tests: Time Edge Cases
// ===========================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { InMemoryNonceStore } from '../../replay/nonce-store';
import { buildHashedEvent, verifyEventChain } from '../../integrity/event-hash';
import { logSecurityEvent } from '../../event-logger';
import { SECURITY_EVENT_TYPES } from '../../types';
import { createMockDb, createMockCallbacks, resetIdCounter } from '../test-helpers';

describe('time edge cases — nonce store', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('handles nonce at exact TTL boundary', () => {
    const store = new InMemoryNonceStore(100, 1000); // 1s TTL
    store.checkAndSet('boundary-nonce');

    // Advance past TTL by 1ms to ensure expiration
    vi.advanceTimersByTime(1001);

    // Now expired — should be accepted again
    const result = store.checkAndSet('boundary-nonce');
    expect(result.valid).toBe(true); // Re-accepted because expired
  });

  it('handles nonce just before TTL', () => {
    const store = new InMemoryNonceStore(100, 1000);
    store.checkAndSet('almost-expired');

    vi.advanceTimersByTime(999);

    const result = store.checkAndSet('almost-expired');
    expect(result.valid).toBe(false); // Not yet expired
  });

  it('handles nonce well past TTL', () => {
    const store = new InMemoryNonceStore(100, 1000);
    store.checkAndSet('old-nonce');

    vi.advanceTimersByTime(10_000);

    const result = store.checkAndSet('old-nonce');
    expect(result.valid).toBe(true); // Expired and evicted
  });

  it('handles custom expiresAt in the past', () => {
    vi.useRealTimers(); // Need real timers for this
    const store = new InMemoryNonceStore();
    const result = store.checkAndSet('expired', undefined, new Date(Date.now() - 1));
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('expired');
  });

  it('handles custom expiresAt at epoch 0', () => {
    vi.useRealTimers();
    const store = new InMemoryNonceStore();
    const result = store.checkAndSet('epoch-0', undefined, new Date(0));
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('expired');
  });

  it('handles rapid time advancement', () => {
    const store = new InMemoryNonceStore(100, 100);
    for (let i = 0; i < 20; i++) {
      store.checkAndSet(`nonce-${i}`);
      vi.advanceTimersByTime(50);
    }
    // Some early nonces should have expired
    expect(store.size).toBeLessThan(20);
  });
});

describe('time edge cases — integrity chain', () => {
  it('handles events with same content at different times', () => {
    // Two identical events — should still have different integrity hashes
    // if they chain differently
    const e1 = buildHashedEvent('evt-1', { data: 'same' }, null);
    const e2 = buildHashedEvent('evt-2', { data: 'same' }, e1.integrityHash);
    expect(e1.contentHash).toBe(e2.contentHash); // Same content = same content hash
    expect(e1.integrityHash).not.toBe(e2.integrityHash); // Different chain position
    const result = verifyEventChain([e1, e2]);
    expect(result.valid).toBe(true);
  });

  it('handles events created at Date(0)', () => {
    const e = buildHashedEvent('evt-1', { createdAt: new Date(0).toISOString() }, null);
    expect(e.contentHash).toHaveLength(64);
  });

  it('handles events with future timestamps', () => {
    const futureDate = new Date('2099-12-31T23:59:59.999Z');
    const e = buildHashedEvent('evt-1', { timestamp: futureDate.toISOString() }, null);
    const result = verifyEventChain([e]);
    expect(result.valid).toBe(true);
  });
});

describe('time edge cases — event logging', () => {
  let db: ReturnType<typeof createMockDb>;
  let callbacks: ReturnType<typeof createMockCallbacks>;

  beforeEach(() => {
    vi.useRealTimers();
    resetIdCounter();
    db = createMockDb();
    callbacks = createMockCallbacks();
  });

  it('handles logging with principal at different trust tiers over time', async () => {
    // User starts untrusted, gains trust, loses it
    for (const tier of [0, 1, 2, 1, 0] as const) {
      const event = await logSecurityEvent(db, {
        eventType: SECURITY_EVENT_TYPES.AUTH_LOGIN_SUCCESS,
        userId: 'user-1',
        principal: { principalId: 'user-1', principalType: 'user', trustTier: tier },
      }, callbacks);
      expect(event.id).toBeTruthy();
    }
    expect(db._records).toHaveLength(5);
  });

  it('handles rapid sequential logging', async () => {
    const promises = [];
    for (let i = 0; i < 50; i++) {
      promises.push(logSecurityEvent(db, {
        eventType: SECURITY_EVENT_TYPES.RATE_LIMIT_EXCEEDED,
        userId: `user-${i}`,
        details: { endpoint: `/api/test-${i}` },
      }, callbacks));
    }
    const results = await Promise.all(promises);
    expect(results).toHaveLength(50);
    expect(results.every(r => r.id !== 'failed-to-log')).toBe(true);
  });
});
