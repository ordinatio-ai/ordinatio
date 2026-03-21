// ===========================================
// 11. Security Summary Contract Tests
// ===========================================
// Summaries are short, correct, do not omit critical
// restrictions, and match the underlying machine state.
// ===========================================

import { describe, it, expect } from 'vitest';
import { summarizePosture, summarizeAlert, postureNeedsAttention } from '../../posture/security-summary';
import { evaluateTrust } from '../../trust/trust-evaluator';
import type { SecurityPosture } from '../../policy/policy-types';
import type { SecurityAlert } from '../../types';

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

describe('summary accuracy — matches machine state', () => {
  it('trusted low-risk action → clean summary', () => {
    const summary = summarizePosture(makePosture({ trustTier: 2, riskScore: 0 }));
    expect(summary).toContain('high-stakes trusted');
    expect(summary).toContain('No active security alerts');
    expect(summary).not.toContain('WARNING');
    expect(summary).not.toContain('CRITICAL');
  });

  it('blocked payment due to policy → mentions restriction', () => {
    const summary = summarizePosture(makePosture({
      policyRestrictions: ['Payment actions blocked pending human approval'],
      blockedActions: ['process_payment'],
    }));
    expect(summary).toContain('Payment actions blocked');
    expect(summary).toContain('process_payment');
  });

  it('replay detected → reflected in alert', () => {
    const summary = summarizePosture(makePosture({
      activeAlerts: [{
        id: 'a1',
        alertType: 'replay_attack',
        riskLevel: 'HIGH',
        title: 'Replay attack detected on approval workflow',
      }],
    }));
    expect(summary).toContain('Replay attack');
    expect(summary).toContain('HIGH');
  });

  it('issuer untrusted → tier 0 shown', () => {
    const summary = summarizePosture(makePosture({ trustTier: 0, riskScore: 40 }));
    expect(summary).toContain('untrusted');
    expect(summary).toContain('tier 0');
  });

  it('alert threshold exceeded → count shown', () => {
    const summary = summarizePosture(makePosture({
      activeAlerts: [
        { id: 'a1', alertType: 'brute_force', riskLevel: 'HIGH', title: 'Brute force' },
        { id: 'a2', alertType: 'csrf', riskLevel: 'CRITICAL', title: 'CSRF attack' },
        { id: 'a3', alertType: 'rate', riskLevel: 'MEDIUM', title: 'Rate limit' },
      ],
    }));
    expect(summary).toContain('3 total');
    expect(summary).toContain('CRITICAL: 1');
    expect(summary).toContain('HIGH: 1');
  });
});

describe('summary does not omit critical restrictions', () => {
  it('broken integrity always mentioned', () => {
    const summary = summarizePosture(makePosture({ integrityStatus: 'broken' }));
    expect(summary).toContain('integrity');
    expect(summary).toContain('broken');
  });

  it('blocked actions always listed', () => {
    const summary = summarizePosture(makePosture({
      blockedActions: ['delete_all', 'export_data', 'reset_passwords'],
    }));
    expect(summary).toContain('delete_all');
    expect(summary).toContain('export_data');
    expect(summary).toContain('reset_passwords');
  });

  it('CRITICAL alerts always surfaced even with many alerts', () => {
    const summary = summarizePosture(makePosture({
      activeAlerts: [
        ...Array.from({ length: 5 }, (_, i) => ({
          id: `low-${i}`, alertType: 'noise', riskLevel: 'LOW' as const, title: `Low alert ${i}`,
        })),
        { id: 'crit-1', alertType: 'critical', riskLevel: 'CRITICAL', title: 'CRITICAL: Data breach detected' },
      ],
    }));
    expect(summary).toContain('CRITICAL: 1');
  });
});

describe('summary is concise', () => {
  it('clean posture summary is < 200 chars', () => {
    const summary = summarizePosture(makePosture({ trustTier: 2, riskScore: 0 }));
    expect(summary.length).toBeLessThan(200);
  });

  it('alert summary is one line per alert (max 3)', () => {
    const summary = summarizePosture(makePosture({
      activeAlerts: Array.from({ length: 10 }, (_, i) => ({
        id: `a-${i}`, alertType: `type-${i}`, riskLevel: 'MEDIUM' as const, title: `Alert ${i}`,
      })),
    }));
    const alertDetailLines = summary.split('\n').filter(l => l.trim().startsWith('- ['));
    expect(alertDetailLines.length).toBeLessThanOrEqual(3);
  });
});

describe('summarizeAlert accuracy', () => {
  const makeAlert = (overrides: Partial<SecurityAlert & { recovery?: unknown }> = {}): SecurityAlert => ({
    id: 'a1',
    alertType: 'brute_force',
    riskLevel: 'HIGH',
    status: 'ACTIVE',
    title: 'Brute Force Attack',
    description: 'test',
    triggerEventId: null,
    triggerEventType: 'security.auth.login_failed' as never,
    affectedUserId: null,
    affectedIp: null,
    eventCount: 1,
    windowMinutes: 15,
    metadata: {},
    acknowledgedBy: null,
    acknowledgedAt: null,
    resolvedBy: null,
    resolvedAt: null,
    resolutionNotes: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  });

  it('includes risk level and title', () => {
    const summary = summarizeAlert(makeAlert());
    expect(summary).toContain('[HIGH]');
    expect(summary).toContain('Brute Force Attack');
  });

  it('includes IP when present', () => {
    const summary = summarizeAlert(makeAlert({ affectedIp: '10.0.0.1' }));
    expect(summary).toContain('10.0.0.1');
  });

  it('includes event count when > 1', () => {
    const summary = summarizeAlert(makeAlert({ eventCount: 15 }));
    expect(summary).toContain('15 events');
  });

  it('omits event count when = 1', () => {
    const summary = summarizeAlert(makeAlert({ eventCount: 1 }));
    expect(summary).not.toContain('1 events');
  });
});

describe('postureNeedsAttention matches expectations', () => {
  it('low risk, no alerts → no attention needed', () => {
    expect(postureNeedsAttention(makePosture({ riskScore: 10 }))).toBe(false);
  });

  it('risk > 50 → needs attention', () => {
    expect(postureNeedsAttention(makePosture({ riskScore: 60 }))).toBe(true);
  });

  it('CRITICAL alert → needs attention regardless of score', () => {
    expect(postureNeedsAttention(makePosture({
      riskScore: 5,
      activeAlerts: [{ id: 'a', alertType: 'x', riskLevel: 'CRITICAL', title: 'x' }],
    }))).toBe(true);
  });

  it('broken integrity → needs attention', () => {
    expect(postureNeedsAttention(makePosture({
      riskScore: 5,
      integrityStatus: 'broken',
    }))).toBe(true);
  });
});
