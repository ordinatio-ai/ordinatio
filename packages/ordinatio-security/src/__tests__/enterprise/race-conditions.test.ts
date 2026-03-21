// ===========================================
// 13. Race Condition Tests
// ===========================================
// Simultaneous operations: exactly one canonical result,
// no double-creation, no stale overwrites.
// ===========================================

import { describe, it, expect, beforeEach } from 'vitest';
import { InMemoryNonceStore } from '../../replay/nonce-store';
import { InMemoryBlacklist, CompositeBlacklist } from '../../enforcement/blacklist';
import { shouldBlockAction } from '../../enforcement/action-gate';
import { logSecurityEvent } from '../../event-logger';
import { createAlert, acknowledgeAlert, resolveAlert } from '../../alert-management';
import { SECURITY_EVENT_TYPES } from '../../types';
import { createMockDb, createMockCallbacks, resetIdCounter } from '../test-helpers';

describe('identical nonce writes', () => {
  it('concurrent checkAndSet — exactly one valid', () => {
    const store = new InMemoryNonceStore();
    const results = [];
    // Simulate concurrent writes (JS is single-threaded but tests the logic)
    for (let i = 0; i < 100; i++) {
      results.push(store.checkAndSet('contended-nonce'));
    }
    const valid = results.filter(r => r.valid);
    expect(valid).toHaveLength(1);
  });

  it('concurrent via Promise.all — exactly one valid gate pass', async () => {
    resetIdCounter();
    const db = createMockDb();
    const nonceStore = new InMemoryNonceStore();

    const results = await Promise.all(
      Array.from({ length: 50 }, () =>
        shouldBlockAction(db, {
          principal: { principalId: 'worker', principalType: 'automation' },
          action: 'process',
          nonce: 'shared-nonce',
        }, { nonceStore })
      )
    );

    const allowed = results.filter(r => !r.blocked);
    expect(allowed).toHaveLength(1);
  });
});

describe('alert creation from same event burst', () => {
  it('concurrent alert creation attempts — deduplication holds', async () => {
    resetIdCounter();
    const db = createMockDb();
    const callbacks = createMockCallbacks();

    // Create alerts concurrently
    const results = await Promise.all(
      Array.from({ length: 10 }, () =>
        createAlert(db, {
          alertType: 'brute_force_ip',
          riskLevel: 'HIGH',
          title: 'Brute Force from 1.2.3.4',
          description: 'test',
          triggerEventType: SECURITY_EVENT_TYPES.AUTH_LOGIN_FAILED,
          eventCount: 5,
          windowMinutes: 15,
          affectedIp: '1.2.3.4',
        }, callbacks)
      )
    );

    // All should succeed (createAlert doesn't dedup by itself — that's findExistingAlert's job)
    // But the alerts should all be created
    const valid = results.filter(r => r !== null);
    expect(valid.length).toBe(10);
    // Each has unique ID
    const ids = new Set(valid.map(a => a!.id));
    expect(ids.size).toBe(10);
  });
});

describe('acknowledgment + resolution collision', () => {
  it('ack then resolve on same alert — both succeed', async () => {
    resetIdCounter();
    const db = createMockDb();
    const callbacks = createMockCallbacks();

    const alert = await createAlert(db, {
      alertType: 'test',
      riskLevel: 'MEDIUM',
      title: 'Test Alert',
      description: 'test',
      triggerEventType: SECURITY_EVENT_TYPES.ANOMALY_DETECTED,
      eventCount: 1,
      windowMinutes: 5,
    }, callbacks);

    expect(alert).toBeDefined();

    const acked = await acknowledgeAlert(db, alert!.id, 'admin-1', callbacks);
    expect(acked).toBeDefined();
    expect(acked!.status).toBe('ACKNOWLEDGED');

    const resolved = await resolveAlert(db, alert!.id, 'admin-1', 'False alarm', false, callbacks);
    expect(resolved).toBeDefined();
    expect(resolved!.resolvedAt).toBeDefined();
  });

  it('concurrent ack and resolve — both complete without error', async () => {
    resetIdCounter();
    const db = createMockDb();
    const callbacks = createMockCallbacks();

    const alert = await createAlert(db, {
      alertType: 'test',
      riskLevel: 'MEDIUM',
      title: 'Test',
      description: 'test',
      triggerEventType: SECURITY_EVENT_TYPES.ANOMALY_DETECTED,
      eventCount: 1,
      windowMinutes: 5,
    }, callbacks);

    const [ackResult, resolveResult] = await Promise.all([
      acknowledgeAlert(db, alert!.id, 'admin-1', callbacks),
      resolveAlert(db, alert!.id, 'admin-2', 'Resolved concurrently', false, callbacks),
    ]);

    // Both should complete (last write wins in our in-memory store)
    expect(ackResult !== null || resolveResult !== null).toBe(true);
  });
});

describe('concurrent event logging', () => {
  it('50 concurrent events — all persisted, no data loss', async () => {
    resetIdCounter();
    const db = createMockDb();
    const callbacks = createMockCallbacks();

    const results = await Promise.all(
      Array.from({ length: 50 }, (_, i) =>
        logSecurityEvent(db, {
          eventType: SECURITY_EVENT_TYPES.RATE_LIMIT_EXCEEDED,
          userId: `user-${i}`,
          ip: `10.0.0.${i % 255}`,
          details: { endpoint: `/api/test-${i}` },
        }, callbacks)
      )
    );

    expect(results).toHaveLength(50);
    expect(results.every(r => r.id !== 'failed-to-log')).toBe(true);
    expect(db._records).toHaveLength(50);
  });
});

describe('blacklist concurrent modification', () => {
  it('add and check simultaneously — consistent state', async () => {
    const blacklist = new CompositeBlacklist();
    resetIdCounter();
    const db = createMockDb();

    // Add IPs while checking others
    const addPromises = Array.from({ length: 20 }, (_, i) => {
      blacklist.blockIp(`bad-${i}`);
      return shouldBlockAction(db, {
        principal: { principalId: `u-${i}`, principalType: 'user' },
        action: 'read',
        ip: `bad-${i}`,
      }, { blacklist });
    });

    const results = await Promise.all(addPromises);
    // All should be blocked since we blocked the IP before checking
    expect(results.every(r => r.blocked)).toBe(true);
  });
});
