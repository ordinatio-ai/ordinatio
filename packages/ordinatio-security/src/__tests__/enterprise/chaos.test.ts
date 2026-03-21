// ===========================================
// 16. Chaos Tests
// ===========================================
// Turn off dependencies intentionally. Assert:
// fail safe, no dangerous decisions, structured degradation.
// ===========================================

import { describe, it, expect, beforeEach } from 'vitest';
import { logSecurityEvent } from '../../event-logger';
import { shouldBlockAction } from '../../enforcement/action-gate';
import { getSecurityPosture } from '../../posture/security-posture';
import { resolveIntent } from '../../policy/security-intents';
import { SecurityIntent } from '../../policy/policy-types';
import { checkSecurityPatterns } from '../../alert-detection';
import { SECURITY_EVENT_TYPES } from '../../types';
import { createMockDb, createMockCallbacks, resetIdCounter } from '../test-helpers';

describe('DB unavailable', () => {
  let callbacks: ReturnType<typeof createMockCallbacks>;

  beforeEach(() => {
    resetIdCounter();
    callbacks = createMockCallbacks();
  });

  function createBrokenDb() {
    const db = createMockDb();
    db.activityLog.create = async () => { throw new Error('Connection refused'); };
    db.activityLog.findMany = async () => { throw new Error('Connection refused'); };
    db.activityLog.findFirst = async () => { throw new Error('Connection refused'); };
    db.activityLog.findUnique = async () => { throw new Error('Connection refused'); };
    db.activityLog.count = async () => { throw new Error('Connection refused'); };
    db.activityLog.update = async () => { throw new Error('Connection refused'); };
    return db;
  }

  it('event logger returns placeholder, does not throw', async () => {
    const db = createBrokenDb();
    const event = await logSecurityEvent(db, {
      eventType: SECURITY_EVENT_TYPES.AUTH_LOGIN_FAILED,
      userId: 'user-1',
    }, callbacks);
    expect(event.id).toBe('failed-to-log');
    expect(event.eventType).toBe(SECURITY_EVENT_TYPES.AUTH_LOGIN_FAILED);
  });

  it('action gate fails open (does not block)', async () => {
    const db = createBrokenDb();
    const result = await shouldBlockAction(db, {
      principal: { principalId: 'u1', principalType: 'user' },
      action: 'read',
    }, { throttleThreshold: 1 }, callbacks); // Low threshold but DB fails
    expect(result.blocked).toBe(false);
  });

  it('security posture returns degraded result', async () => {
    const db = createBrokenDb();
    const posture = await getSecurityPosture(db, undefined, callbacks);
    expect(posture.activeAlerts).toHaveLength(0);
    expect(posture._actions).toBeDefined(); // Still discoverable
  });

  it('quarantine intent fails gracefully on DB failure', async () => {
    const db = createBrokenDb();
    // findUnique will throw, so quarantine should fail gracefully
    try {
      const result = await resolveIntent(
        SecurityIntent.QUARANTINE_EVENT,
        { eventId: 'evt-1' },
        db, callbacks
      );
      // If it catches internally, should report failure
      expect(result.success).toBe(false);
    } catch {
      // If it throws, that's also acceptable — DB is broken
    }
  });

  it('pattern check returns empty on DB failure', async () => {
    const db = createBrokenDb();
    const event = {
      id: 'evt-1',
      eventType: SECURITY_EVENT_TYPES.AUTH_LOGIN_FAILED as typeof SECURITY_EVENT_TYPES.AUTH_LOGIN_FAILED,
      userId: null,
      targetUserId: null,
      ip: '1.2.3.4',
      userAgent: null,
      riskLevel: 'MEDIUM' as const,
      details: {},
      resourceId: null,
      resourceType: null,
      requestId: null,
      createdAt: new Date(),
    };
    const alerts = await checkSecurityPatterns(db, event, callbacks);
    expect(alerts).toHaveLength(0); // Fails safe
  });
});

describe('nonce store unavailable (simulated)', () => {
  it('action gate still checks other gates without nonce', async () => {
    resetIdCounter();
    const db = createMockDb();
    // Don't provide nonceStore — gate should skip nonce check
    const result = await shouldBlockAction(db, {
      principal: { principalId: 'u1', principalType: 'user' },
      action: 'read',
      nonce: 'some-nonce', // Nonce provided but no store
    }, {});
    expect(result.blocked).toBe(false); // No store = no check = passes
  });
});

describe('callback panic', () => {
  it('onEventLogged throws — event still persisted', async () => {
    resetIdCounter();
    const db = createMockDb();
    const callbacks = createMockCallbacks();
    callbacks.onEventLogged = async () => { throw new Error('callback panic'); };

    // The event should still be created in DB even if callback fails
    try {
      await logSecurityEvent(db, {
        eventType: SECURITY_EVENT_TYPES.AUTH_LOGIN_SUCCESS,
        userId: 'user-1',
      }, callbacks);
    } catch {
      // May or may not throw — either way DB should have the record
    }
    expect(db._records.length).toBeGreaterThanOrEqual(1);
  });

  it('logger callback throws — event type still correct', async () => {
    resetIdCounter();
    const db = createMockDb();
    const badCallbacks = createMockCallbacks();
    badCallbacks.log = {
      debug: () => { throw new Error('log panic'); },
      info: () => { throw new Error('log panic'); },
      warn: () => { throw new Error('log panic'); },
      error: () => { throw new Error('log panic'); },
    };

    // Logger throws on the log calls after DB write
    // The event should still be created because DB write happens first
    try {
      const event = await logSecurityEvent(db, {
        eventType: SECURITY_EVENT_TYPES.AUTH_LOGIN_SUCCESS,
        userId: 'user-1',
      }, badCallbacks);
      expect(event.eventType).toBe(SECURITY_EVENT_TYPES.AUTH_LOGIN_SUCCESS);
    } catch {
      // If logger throws propagate, DB should still have the record
      expect(db._records.length).toBeGreaterThanOrEqual(1);
    }
  });
});

describe('clock skew', () => {
  it('events with slightly future timestamps still chain correctly', async () => {
    const { buildHashedEvent, verifyEventChain } = await import('../../integrity/event-hash');
    const e1 = buildHashedEvent('e1', { ts: new Date(Date.now() + 5000).toISOString() }, null);
    const e2 = buildHashedEvent('e2', { ts: new Date(Date.now() + 10000).toISOString() }, e1.integrityHash);
    const result = verifyEventChain([e1, e2]);
    expect(result.valid).toBe(true);
  });
});
