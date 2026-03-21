// ===========================================
// 10. Recovery Path Tests
// ===========================================
// Every denial or escalation tells the agent what to do next.
// Test that recovery is machine-readable and actionable.
// ===========================================

import { describe, it, expect, beforeEach } from 'vitest';
import { shouldBlockAction } from '../../enforcement/action-gate';
import { evaluatePolicy } from '../../policy/policy-engine';
import { evaluateTrust } from '../../trust/trust-evaluator';
import { buildAlertRecovery } from '../../alert-recovery';
import { InMemoryNonceStore } from '../../replay/nonce-store';
import { CompositeBlacklist } from '../../enforcement/blacklist';
import type { SecurityPolicy } from '../../policy/policy-types';
import { createMockDb, resetIdCounter } from '../test-helpers';

describe('recovery for replay attack', () => {
  it('tells agent to generate new nonce', async () => {
    resetIdCounter();
    const ns = new InMemoryNonceStore();
    ns.checkAndSet('replayed');

    const result = await shouldBlockAction(createMockDb(), {
      principal: { principalId: 'u1', principalType: 'user' },
      action: 'submit',
      nonce: 'replayed',
    }, { nonceStore: ns });

    expect(result.blocked).toBe(true);
    expect(result.recovery!.nextAction).toMatch(/nonce/i);
    expect(result.recovery!.safeAlternatives).toContainEqual(expect.stringMatching(/nonce/i));
  });
});

describe('recovery for invalid trust', () => {
  it('returns tier 0 with explanatory reasons', () => {
    const trust = evaluateTrust({
      signatureValid: false,
      dmarcStatus: 'fail',
      nonceValid: false,
    });

    expect(trust.trustTier).toBe(0);
    expect(trust.reasons.length).toBeGreaterThanOrEqual(3);
    // Reasons explain what went wrong
    expect(trust.reasons.some(r => r.includes('Signature'))).toBe(true);
    expect(trust.reasons.some(r => r.includes('DMARC'))).toBe(true);
    expect(trust.reasons.some(r => r.includes('replay'))).toBe(true);
  });
});

describe('recovery for blocked action', () => {
  it('policy deny recovery includes contact admin option', () => {
    const policies: SecurityPolicy[] = [{
      id: 'p1', name: 'Block sensitive', priority: 10, decision: 'deny',
      conditions: [{ field: 'action', operator: 'eq', value: 'sensitive_op' }],
    }];

    const decision = evaluatePolicy(
      { principal: { principalId: 'u1', principalType: 'user' }, action: 'sensitive_op' },
      policies
    );

    expect(decision.recommendation!.safeAlternatives).toContainEqual(
      expect.stringMatching(/administrator|admin/)
    );
  });

  it('blacklist recovery mentions expiry or admin review', async () => {
    resetIdCounter();
    const bl = new CompositeBlacklist();
    bl.blockIp('1.2.3.4');

    const result = await shouldBlockAction(createMockDb(), {
      principal: { principalId: 'u1', principalType: 'user' },
      action: 'read',
      ip: '1.2.3.4',
    }, { blacklist: bl });

    expect(result.recovery!.nextAction).toMatch(/expiry|administrator/i);
  });
});

describe('recovery for expired request', () => {
  it('nonce with past expiry returns expired reason', () => {
    const ns = new InMemoryNonceStore();
    const result = ns.checkAndSet('stale', undefined, new Date(Date.now() - 10_000));
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('expired');
  });
});

describe('recovery for missing approval', () => {
  it('escalation recovery requires human review', () => {
    const policies: SecurityPolicy[] = [{
      id: 'p1', name: 'Require approval', priority: 10, decision: 'escalate',
      conditions: [{ field: 'action', operator: 'eq', value: 'high_risk' }],
    }];

    const decision = evaluatePolicy(
      { principal: { principalId: 'u1', principalType: 'user' }, action: 'high_risk' },
      policies
    );

    expect(decision.requiresHuman).toBe(true);
    expect(decision.recommendation!.nextAction).toContain('human');
  });
});

describe('recovery for integrity failure', () => {
  it('account_takeover recovery includes lock + verify', () => {
    const recovery = buildAlertRecovery({ alertType: 'account_takeover', riskLevel: 'CRITICAL' });
    expect(recovery.impact).toBe('halt_execution');
    expect(recovery.allowedFollowups).toContainEqual(expect.stringMatching(/lock/i));
    expect(recovery.allowedFollowups).toContainEqual(expect.stringMatching(/verify/i));
  });
});

describe('recovery objects are complete', () => {
  it('every recovery has a machine-readable reason', () => {
    const types = ['brute_force', 'account_takeover', 'data_exfiltration',
      'privilege_escalation', 'csrf_attack', 'unknown'];

    for (const type of types) {
      const recovery = buildAlertRecovery({ alertType: type, riskLevel: 'HIGH' });
      expect(typeof recovery.reason).toBe('string');
      expect(recovery.reason.length).toBeGreaterThan(10); // Meaningful, not empty
    }
  });

  it('every recovery has at least 2 allowed followups', () => {
    const types = ['brute_force', 'account_takeover', 'data_exfiltration',
      'privilege_escalation', 'csrf_attack'];

    for (const type of types) {
      const recovery = buildAlertRecovery({ alertType: type, riskLevel: 'HIGH' });
      expect(recovery.allowedFollowups.length).toBeGreaterThanOrEqual(2);
    }
  });

  it('CRITICAL risk always escalates impact to halt_execution', () => {
    const types = ['suspicious_patterns', 'rate_limit', 'injection_attack'];

    for (const type of types) {
      const recovery = buildAlertRecovery({ alertType: type, riskLevel: 'CRITICAL' });
      expect(recovery.impact).toBe('halt_execution');
    }
  });
});
