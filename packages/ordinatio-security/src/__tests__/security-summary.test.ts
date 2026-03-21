// ===========================================
// Security Summary Tests
// ===========================================

import { describe, it, expect } from 'vitest';
import { summarizePosture, summarizeAlert, postureNeedsAttention } from '../posture/security-summary';
import type { SecurityPosture } from '../policy/policy-types';

const makePosture = (overrides: Partial<SecurityPosture> = {}): SecurityPosture => ({
  orgId: 'org-1',
  principalId: 'user-1',
  trustTier: 1,
  riskScore: 20,
  activeAlerts: [],
  policyRestrictions: [],
  blockedActions: [],
  integrityStatus: 'verified',
  recommendedNextActions: ['Continue normal operations'],
  _actions: {},
  ...overrides,
});

describe('summarizePosture', () => {
  it('produces concise summary for clean posture', () => {
    const summary = summarizePosture(makePosture());
    expect(summary).toContain('verified');
    expect(summary).toContain('tier 1');
    expect(summary).toContain('No active security alerts');
  });

  it('shows alert counts by severity', () => {
    const summary = summarizePosture(makePosture({
      activeAlerts: [
        { id: 'a1', alertType: 'test', riskLevel: 'CRITICAL', title: 'Critical thing' },
        { id: 'a2', alertType: 'test', riskLevel: 'HIGH', title: 'High thing' },
        { id: 'a3', alertType: 'test', riskLevel: 'MEDIUM', title: 'Medium thing' },
      ],
    }));
    expect(summary).toContain('CRITICAL: 1');
    expect(summary).toContain('HIGH: 1');
    expect(summary).toContain('3 total');
  });

  it('includes alert recovery in summary', () => {
    const summary = summarizePosture(makePosture({
      activeAlerts: [{
        id: 'a1',
        alertType: 'test',
        riskLevel: 'HIGH',
        title: 'Bad thing',
        recovery: {
          impact: 'halt_execution',
          action: 'Lock the account',
          reason: 'test',
          allowedFollowups: [],
        },
      }],
    }));
    expect(summary).toContain('Lock the account');
  });

  it('shows policy restrictions', () => {
    const summary = summarizePosture(makePosture({
      policyRestrictions: ['No exports allowed'],
    }));
    expect(summary).toContain('No exports allowed');
  });

  it('shows blocked actions', () => {
    const summary = summarizePosture(makePosture({
      blockedActions: ['delete', 'export'],
    }));
    expect(summary).toContain('delete');
    expect(summary).toContain('export');
  });

  it('warns about broken integrity', () => {
    const summary = summarizePosture(makePosture({ integrityStatus: 'broken' }));
    expect(summary).toContain('integrity is broken');
  });

  it('shows tier 0 as untrusted', () => {
    const summary = summarizePosture(makePosture({ trustTier: 0 }));
    expect(summary).toContain('untrusted');
  });

  it('shows tier 2 as high-stakes trusted', () => {
    const summary = summarizePosture(makePosture({ trustTier: 2 }));
    expect(summary).toContain('high-stakes');
  });

  it('limits to top 3 alerts', () => {
    const summary = summarizePosture(makePosture({
      activeAlerts: Array.from({ length: 5 }, (_, i) => ({
        id: `a${i}`,
        alertType: `test-${i}`,
        riskLevel: 'MEDIUM' as const,
        title: `Alert ${i}`,
      })),
    }));
    // Should mention "5 total" but only show details for 3
    expect(summary).toContain('5 total');
  });
});

describe('summarizeAlert', () => {
  it('produces one-line summary', () => {
    const summary = summarizeAlert({
      id: 'a1',
      alertType: 'brute_force',
      riskLevel: 'HIGH',
      status: 'ACTIVE',
      title: 'Brute Force Detected',
      description: 'test',
      triggerEventId: null,
      triggerEventType: 'security.auth.login_failed' as never,
      affectedUserId: null,
      affectedIp: '1.2.3.4',
      eventCount: 5,
      windowMinutes: 15,
      metadata: {},
      acknowledgedBy: null,
      acknowledgedAt: null,
      resolvedBy: null,
      resolvedAt: null,
      resolutionNotes: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    expect(summary).toContain('[HIGH]');
    expect(summary).toContain('Brute Force Detected');
    expect(summary).toContain('1.2.3.4');
    expect(summary).toContain('5 events');
  });

  it('includes recovery action when present', () => {
    const summary = summarizeAlert({
      id: 'a1',
      alertType: 'test',
      riskLevel: 'CRITICAL',
      status: 'ACTIVE',
      title: 'Test Alert',
      description: '',
      triggerEventId: null,
      triggerEventType: 'security.auth.login_failed' as never,
      affectedUserId: null,
      affectedIp: null,
      eventCount: 1,
      windowMinutes: 5,
      metadata: {},
      acknowledgedBy: null,
      acknowledgedAt: null,
      resolvedBy: null,
      resolvedAt: null,
      resolutionNotes: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      recovery: {
        impact: 'halt_execution',
        action: 'Lock everything',
        reason: 'test',
        allowedFollowups: [],
      },
    });
    expect(summary).toContain('Lock everything');
  });
});

describe('postureNeedsAttention', () => {
  it('returns false for clean posture', () => {
    expect(postureNeedsAttention(makePosture({ riskScore: 10 }))).toBe(false);
  });

  it('returns true for high risk score', () => {
    expect(postureNeedsAttention(makePosture({ riskScore: 75 }))).toBe(true);
  });

  it('returns true for CRITICAL alerts', () => {
    expect(postureNeedsAttention(makePosture({
      riskScore: 10,
      activeAlerts: [{ id: 'a', alertType: 'x', riskLevel: 'CRITICAL', title: 'x' }],
    }))).toBe(true);
  });

  it('returns true for broken integrity', () => {
    expect(postureNeedsAttention(makePosture({
      riskScore: 10,
      integrityStatus: 'broken',
    }))).toBe(true);
  });

  it('returns true for blocked actions', () => {
    expect(postureNeedsAttention(makePosture({
      riskScore: 10,
      blockedActions: ['something'],
    }))).toBe(true);
  });
});
