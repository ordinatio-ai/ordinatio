// ===========================================
// 7. Security Posture Snapshot Tests (Golden Tests)
// ===========================================
// Given a known context, assert the returned posture
// is exactly what we expect. Determinism + regression safety.
// ===========================================

import { describe, it, expect, beforeEach } from 'vitest';
import { getSecurityPosture } from '../../posture/security-posture';
import { SECURITY_EVENT_TYPES } from '../../types';
import { createMockDb, resetIdCounter } from '../test-helpers';

describe('posture golden tests', () => {
  let db: ReturnType<typeof createMockDb>;

  beforeEach(() => {
    resetIdCounter();
    db = createMockDb();
  });

  it('clean state — tier 2 principal, no alerts', async () => {
    const posture = await getSecurityPosture(db, {
      principal: { principalId: 'admin', principalType: 'user', orgId: 'org-1', trustTier: 2 },
    });

    expect(posture).toMatchObject({
      orgId: 'org-1',
      principalId: 'admin',
      trustTier: 2,
      riskScore: 0, // Tier 2 base = 0, no alerts
      activeAlerts: [],
      policyRestrictions: [],
      blockedActions: [],
      integrityStatus: 'unverified',
    });
    expect(posture.recommendedNextActions).toContainEqual(expect.stringContaining('nominal'));
    expect(posture._actions.evaluate_policy).toBeDefined();
    expect(posture._actions.request_review).toBeDefined();
    expect(posture._actions.quarantine).toBeDefined();
    expect(posture._actions.get_playbook).toBeDefined();
  });

  it('one CRITICAL alert — risk score and restrictions', async () => {
    await db.activityLog.create({
      data: {
        action: 'alert.data_exfiltration',
        description: 'Data exfiltration detected',
        severity: 'CRITICAL',
        requiresResolution: true,
        system: true,
        userId: null,
        metadata: {
          isSecurityAlert: true,
          alertType: 'data_exfiltration',
          riskLevel: 'CRITICAL',
          status: 'ACTIVE',
          description: 'Bulk export from unknown IP',
          triggerEventType: SECURITY_EVENT_TYPES.SENSITIVE_DATA_EXPORTED,
          eventCount: 5,
          windowMinutes: 60,
        },
      },
    });

    const posture = await getSecurityPosture(db, {
      principal: { principalId: 'u1', principalType: 'user', trustTier: 1 },
    });

    expect(posture.activeAlerts).toHaveLength(1);
    expect(posture.activeAlerts[0].riskLevel).toBe('CRITICAL');
    expect(posture.activeAlerts[0].recovery).toBeDefined();
    expect(posture.activeAlerts[0].recovery!.impact).toBe('halt_execution');
    expect(posture.riskScore).toBeGreaterThanOrEqual(35); // 10 (tier 1) + 25 (CRITICAL)
    expect(posture.policyRestrictions.length).toBeGreaterThan(0);
    expect(posture.recommendedNextActions.some(r => r.includes('CRITICAL'))).toBe(true);
  });

  it('tier 0 principal — trust warning in recommendations', async () => {
    const posture = await getSecurityPosture(db, {
      principal: { principalId: 'unknown', principalType: 'agent', trustTier: 0 },
    });

    expect(posture.trustTier).toBe(0);
    expect(posture.riskScore).toBeGreaterThanOrEqual(20); // Base risk for tier 0
    expect(posture.recommendedNextActions.some(r => r.includes('trust'))).toBe(true);
  });

  it('mixed alerts — risk score aggregation', async () => {
    // HIGH alert
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

    // MEDIUM alert
    await db.activityLog.create({
      data: {
        action: 'alert.suspicious',
        description: 'Suspicious pattern',
        severity: 'WARNING',
        requiresResolution: true,
        system: true,
        userId: null,
        metadata: {
          isSecurityAlert: true,
          alertType: 'suspicious_patterns',
          riskLevel: 'MEDIUM',
          status: 'ACTIVE',
          description: 'test',
          triggerEventType: SECURITY_EVENT_TYPES.AUTH_SUSPICIOUS_ACTIVITY,
          eventCount: 3,
          windowMinutes: 10,
        },
      },
    });

    const posture = await getSecurityPosture(db, {
      principal: { principalId: 'u1', principalType: 'user', trustTier: 1 },
    });

    expect(posture.activeAlerts).toHaveLength(2);
    // Risk: 10 (tier 1) + 15 (HIGH) + 5 (MEDIUM) = 30
    expect(posture.riskScore).toBe(30);
  });

  it('external blocked actions are passed through', async () => {
    const posture = await getSecurityPosture(db, {
      blockedActions: ['export_data', 'delete_records'],
      policyRestrictions: ['Payment freeze until review'],
    });

    expect(posture.blockedActions).toEqual(['export_data', 'delete_records']);
    expect(posture.policyRestrictions).toContain('Payment freeze until review');
  });

  it('_actions have correct shape', async () => {
    const posture = await getSecurityPosture(db);

    for (const [, action] of Object.entries(posture._actions)) {
      expect(action.href).toBeTruthy();
      expect(action.method).toMatch(/^(GET|POST|PUT|DELETE|PATCH)$/);
      expect(action.description).toBeTruthy();
    }
  });
});
