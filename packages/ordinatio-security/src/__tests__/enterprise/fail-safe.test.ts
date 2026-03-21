// ===========================================
// 2. Fail-Safe Tests
// ===========================================
// When anything goes wrong, the module degrades safely:
// deny or Tier 0, no dangerous side effects, audit event
// attempted if possible, structured recovery returned.
// ===========================================

import { describe, it, expect, beforeEach } from 'vitest';
import { logSecurityEvent } from '../../event-logger';
import { evaluateTrust } from '../../trust/trust-evaluator';
import { evaluatePolicy } from '../../policy/policy-engine';
import { shouldBlockAction } from '../../enforcement/action-gate';
import { resolveIntent } from '../../policy/security-intents';
import { SecurityIntent } from '../../policy/policy-types';
import { getSecurityPosture } from '../../posture/security-posture';
import { buildAlertRecovery } from '../../alert-recovery';
import { SECURITY_EVENT_TYPES } from '../../types';
import { createMockDb, createMockCallbacks, resetIdCounter } from '../test-helpers';

describe('malformed payloads → safe degradation', () => {
  let db: ReturnType<typeof createMockDb>;
  let callbacks: ReturnType<typeof createMockCallbacks>;

  beforeEach(() => {
    resetIdCounter();
    db = createMockDb();
    callbacks = createMockCallbacks();
  });

  it('event logger returns placeholder on DB failure', async () => {
    db.activityLog.create = async () => { throw new Error('DB connection lost'); };
    const event = await logSecurityEvent(db, {
      eventType: SECURITY_EVENT_TYPES.AUTH_LOGIN_FAILED,
      userId: 'user-1',
    }, callbacks);
    expect(event.id).toBe('failed-to-log');
    expect(event.eventType).toBe(SECURITY_EVENT_TYPES.AUTH_LOGIN_FAILED);
  });

  it('event logger throws on unknown event type (explicit rejection)', async () => {
    await expect(
      logSecurityEvent(db, {
        eventType: 'security.fake.event' as never,
      }, callbacks)
    ).rejects.toThrow('Unknown security event type');
  });

  it('trust evaluator returns tier 0 on all undefined inputs', () => {
    const result = evaluateTrust({});
    expect(result.trustTier).toBe(0);
    expect(result.trustScore).toBeLessThan(70);
  });

  it('trust evaluator returns tier 0 on bad signature', () => {
    const result = evaluateTrust({ signatureValid: false });
    expect(result.trustTier).toBe(0);
  });

  it('trust evaluator returns tier 0 when signature required but missing', () => {
    const result = evaluateTrust({
      orgPolicy: { requireSignature: true },
    });
    expect(result.trustTier).toBe(0);
    expect(result.trustScore).toBe(0);
  });

  it('policy engine allows when it receives empty policies', () => {
    const result = evaluatePolicy({
      principal: { principalId: 'x', principalType: 'user' },
      action: 'dangerous',
    }, []);
    expect(result.decision).toBe('allow'); // Default allow when no policies defined
  });

  it('alert recovery returns default for unknown alert type', () => {
    const recovery = buildAlertRecovery({ alertType: 'completely_unknown', riskLevel: 'LOW' });
    expect(recovery.impact).toBe('continue_monitoring');
    expect(recovery.action).toBeTruthy();
    expect(recovery.allowedFollowups.length).toBeGreaterThan(0);
  });
});

describe('DB unavailable → no dangerous side effects', () => {
  it('security posture returns empty alerts on DB failure', async () => {
    const badDb = createMockDb();
    badDb.activityLog.findMany = async () => { throw new Error('DB timeout'); };

    const posture = await getSecurityPosture(badDb);
    expect(posture.activeAlerts).toHaveLength(0);
    expect(posture.trustTier).toBe(0);
    expect(posture.recommendedNextActions.length).toBeGreaterThan(0);
  });

  it('action gate fails open on threshold check failure', async () => {
    const badDb = createMockDb();
    badDb.activityLog.count = async () => { throw new Error('DB unavailable'); };

    const result = await shouldBlockAction(badDb, {
      principal: { principalId: 'u1', principalType: 'user' },
      action: 'read',
    }, { throttleThreshold: 5 });

    expect(result.blocked).toBe(false); // Fails open
  });

  it('quarantine intent fails gracefully on missing event', async () => {
    const db = createMockDb();
    const result = await resolveIntent(
      SecurityIntent.QUARANTINE_EVENT,
      { eventId: 'nonexistent' },
      db
    );
    expect(result.success).toBe(false);
    expect(result.message).toContain('not found');
  });
});

describe('callback throws → operation still completes', () => {
  it('event logger succeeds even when onEventLogged throws', async () => {
    resetIdCounter();
    const db = createMockDb();
    const callbacks = createMockCallbacks();
    callbacks.onEventLogged = async () => { throw new Error('callback panic'); };

    // The logger calls callbacks after DB write — the event should still be logged
    // If the callback throws, we expect either the event to succeed or a safe fallback
    const event = await logSecurityEvent(db, {
      eventType: SECURITY_EVENT_TYPES.AUTH_LOGIN_SUCCESS,
      userId: 'user-1',
    }, callbacks);
    // DB record should exist even if callback threw
    expect(db._records.length).toBeGreaterThanOrEqual(1);
  });
});

describe('structured recovery on every denial', () => {
  it('blacklist block includes recovery', async () => {
    resetIdCounter();
    const db = createMockDb();
    const bl = new (await import('../../enforcement/blacklist')).CompositeBlacklist();
    bl.blockIp('1.2.3.4');

    const result = await shouldBlockAction(db, {
      principal: { principalId: 'u1', principalType: 'user' },
      action: 'read',
      ip: '1.2.3.4',
    }, { blacklist: bl });

    expect(result.blocked).toBe(true);
    expect(result.recovery).toBeDefined();
    expect(result.recovery!.nextAction).toBeTruthy();
    expect(result.recovery!.safeAlternatives.length).toBeGreaterThan(0);
  });

  it('nonce replay block includes recovery', async () => {
    resetIdCounter();
    const db = createMockDb();
    const ns = new (await import('../../replay/nonce-store')).InMemoryNonceStore();
    ns.checkAndSet('used-nonce');

    const result = await shouldBlockAction(db, {
      principal: { principalId: 'u1', principalType: 'user' },
      action: 'read',
      nonce: 'used-nonce',
    }, { nonceStore: ns });

    expect(result.blocked).toBe(true);
    expect(result.recovery).toBeDefined();
    expect(result.recovery!.nextAction).toContain('nonce');
  });

  it('policy deny includes recovery with alternatives', () => {
    const decision = evaluatePolicy(
      { principal: { principalId: 'x', principalType: 'agent' }, action: 'export_data' },
      [{
        id: 'p1', name: 'No exports', priority: 10, decision: 'deny',
        conditions: [{ field: 'action', operator: 'eq', value: 'export_data' }],
      }]
    );

    expect(decision.decision).toBe('deny');
    expect(decision.recommendation).toBeDefined();
    expect(decision.recommendation!.safeAlternatives.length).toBeGreaterThan(0);
  });

  it('escalation includes human review guidance', () => {
    const decision = evaluatePolicy(
      { principal: { principalId: 'x', principalType: 'user' }, action: 'high_risk' },
      [{
        id: 'p1', name: 'Escalate risky', priority: 10, decision: 'escalate',
        conditions: [{ field: 'action', operator: 'eq', value: 'high_risk' }],
      }]
    );

    expect(decision.decision).toBe('escalate');
    expect(decision.requiresHuman).toBe(true);
    expect(decision.recommendation!.nextAction).toContain('human approval');
  });
});
