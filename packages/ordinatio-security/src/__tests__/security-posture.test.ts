// ===========================================
// Security Posture Tests
// ===========================================

import { describe, it, expect, beforeEach } from 'vitest';
import { getSecurityPosture } from '../posture/security-posture';
import { createMockDb, createMockCallbacks, resetIdCounter } from './test-helpers';
import { SECURITY_EVENT_TYPES } from '../types';

describe('getSecurityPosture', () => {
  let db: ReturnType<typeof createMockDb>;
  let callbacks: ReturnType<typeof createMockCallbacks>;

  beforeEach(() => {
    resetIdCounter();
    db = createMockDb();
    callbacks = createMockCallbacks();
  });

  it('returns posture with no alerts', async () => {
    const posture = await getSecurityPosture(db, undefined, callbacks);
    expect(posture.activeAlerts).toHaveLength(0);
    expect(posture.trustTier).toBe(0);
  });

  it('includes principal info when provided', async () => {
    const posture = await getSecurityPosture(db, {
      principal: { principalId: 'user-1', principalType: 'user', orgId: 'org-1', trustTier: 1 },
    }, callbacks);
    expect(posture.principalId).toBe('user-1');
    expect(posture.orgId).toBe('org-1');
    expect(posture.trustTier).toBe(1);
  });

  it('includes active alerts with recovery', async () => {
    // Create an alert
    await db.activityLog.create({
      data: {
        action: 'alert.brute_force',
        description: 'Brute force detected',
        severity: 'ERROR',
        requiresResolution: true,
        system: true,
        userId: null,
        metadata: {
          isSecurityAlert: true,
          alertType: 'brute_force',
          riskLevel: 'HIGH',
          status: 'ACTIVE',
          description: 'test',
          triggerEventType: SECURITY_EVENT_TYPES.AUTH_LOGIN_FAILED,
          eventCount: 5,
          windowMinutes: 15,
        },
      },
    });

    const posture = await getSecurityPosture(db, undefined, callbacks);
    expect(posture.activeAlerts).toHaveLength(1);
    expect(posture.activeAlerts[0].recovery).toBeDefined();
    expect(posture.activeAlerts[0].recovery?.impact).toBe('degrade_gracefully');
  });

  it('computes risk score from alerts', async () => {
    // Create a CRITICAL alert
    await db.activityLog.create({
      data: {
        action: 'alert.takeover',
        description: 'Account takeover',
        severity: 'CRITICAL',
        requiresResolution: true,
        system: true,
        userId: null,
        metadata: {
          isSecurityAlert: true,
          alertType: 'account_takeover',
          riskLevel: 'CRITICAL',
          status: 'ACTIVE',
          description: 'test',
          triggerEventType: SECURITY_EVENT_TYPES.AUTH_LOGIN_SUCCESS,
          eventCount: 1,
          windowMinutes: 60,
        },
      },
    });

    const posture = await getSecurityPosture(db, undefined, callbacks);
    expect(posture.riskScore).toBeGreaterThan(0);
  });

  it('adds CRITICAL alert to policy restrictions', async () => {
    await db.activityLog.create({
      data: {
        action: 'alert.critical',
        description: 'Critical alert',
        severity: 'CRITICAL',
        requiresResolution: true,
        system: true,
        userId: null,
        metadata: {
          isSecurityAlert: true,
          alertType: 'data_exfiltration',
          riskLevel: 'CRITICAL',
          status: 'ACTIVE',
          description: 'test',
          triggerEventType: SECURITY_EVENT_TYPES.SENSITIVE_DATA_EXPORTED,
          eventCount: 5,
          windowMinutes: 60,
        },
      },
    });

    const posture = await getSecurityPosture(db, undefined, callbacks);
    expect(posture.policyRestrictions.length).toBeGreaterThan(0);
  });

  it('includes _actions for discoverability', async () => {
    const posture = await getSecurityPosture(db, undefined, callbacks);
    expect(posture._actions).toBeDefined();
    expect(posture._actions.evaluate_policy).toBeDefined();
    expect(posture._actions.request_review).toBeDefined();
    expect(posture._actions.quarantine).toBeDefined();
    expect(posture._actions.get_playbook).toBeDefined();
  });

  it('includes recommendations', async () => {
    const posture = await getSecurityPosture(db, {
      principal: { principalId: 'x', principalType: 'user', trustTier: 0 },
    }, callbacks);
    expect(posture.recommendedNextActions.length).toBeGreaterThan(0);
    expect(posture.recommendedNextActions.some(r => r.includes('trust'))).toBe(true);
  });

  it('merges external blocked actions', async () => {
    const posture = await getSecurityPosture(db, {
      blockedActions: ['export_data', 'delete_records'],
    }, callbacks);
    expect(posture.blockedActions).toContain('export_data');
    expect(posture.blockedActions).toContain('delete_records');
  });

  it('risk score increases with lower trust tier', async () => {
    const tier0 = await getSecurityPosture(db, {
      principal: { principalId: 'x', principalType: 'user', trustTier: 0 },
    });
    const tier2 = await getSecurityPosture(db, {
      principal: { principalId: 'x', principalType: 'user', trustTier: 2 },
    });
    expect(tier0.riskScore).toBeGreaterThan(tier2.riskScore);
  });

  it('handles DB failure gracefully', async () => {
    // Override findMany to throw
    const badDb = createMockDb();
    badDb.activityLog.findMany = async () => { throw new Error('DB down'); };

    const posture = await getSecurityPosture(badDb, undefined, callbacks);
    expect(posture.activeAlerts).toHaveLength(0); // Graceful degradation
  });

  it('defaults orgId from principal', async () => {
    const posture = await getSecurityPosture(db, {
      principal: { principalId: 'x', principalType: 'user', orgId: 'org-42' },
    });
    expect(posture.orgId).toBe('org-42');
  });

  it('prefers explicit orgId over principal', async () => {
    const posture = await getSecurityPosture(db, {
      orgId: 'explicit-org',
      principal: { principalId: 'x', principalType: 'user', orgId: 'principal-org' },
    });
    expect(posture.orgId).toBe('explicit-org');
  });

  it('risk score caps at 100', async () => {
    // Create many critical alerts
    for (let i = 0; i < 10; i++) {
      await db.activityLog.create({
        data: {
          action: `alert.critical-${i}`,
          description: 'Critical',
          severity: 'CRITICAL',
          requiresResolution: true,
          system: true,
          userId: null,
          metadata: {
            isSecurityAlert: true,
            alertType: `critical_${i}`,
            riskLevel: 'CRITICAL',
            status: 'ACTIVE',
            description: 'test',
            triggerEventType: SECURITY_EVENT_TYPES.ANOMALY_DETECTED,
            eventCount: 1,
            windowMinutes: 60,
          },
        },
      });
    }

    const posture = await getSecurityPosture(db);
    expect(posture.riskScore).toBeLessThanOrEqual(100);
  });

  it('nominal recommendations when no issues', async () => {
    const posture = await getSecurityPosture(db, {
      principal: { principalId: 'x', principalType: 'user', trustTier: 2 },
    });
    expect(posture.recommendedNextActions).toContainEqual(
      expect.stringContaining('nominal')
    );
  });
});
