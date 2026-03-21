// ===========================================
// 9. Hypermedia Contract Tests
// ===========================================
// Agentic-first: every response teaches the agent
// what to do next. Assert _actions, _recovery, constraints.
// ===========================================

import { describe, it, expect, beforeEach } from 'vitest';
import { getSecurityPosture } from '../../posture/security-posture';
import { evaluatePolicy } from '../../policy/policy-engine';
import { shouldBlockAction } from '../../enforcement/action-gate';
import { buildAlertRecovery } from '../../alert-recovery';
import { CompositeBlacklist } from '../../enforcement/blacklist';
import { InMemoryNonceStore } from '../../replay/nonce-store';
import type { SecurityPolicy } from '../../policy/policy-types';
import { createMockDb, resetIdCounter } from '../test-helpers';

describe('posture _actions contract', () => {
  it('every _action has href, method, description', async () => {
    resetIdCounter();
    const posture = await getSecurityPosture(createMockDb());

    expect(Object.keys(posture._actions).length).toBeGreaterThanOrEqual(4);
    for (const [name, action] of Object.entries(posture._actions)) {
      expect(action).toHaveProperty('href');
      expect(action).toHaveProperty('method');
      expect(action).toHaveProperty('description');
      expect(typeof action.href).toBe('string');
      expect(typeof action.method).toBe('string');
      expect(typeof action.description).toBe('string');
      expect(action.href.length).toBeGreaterThan(0);
      expect(action.description.length).toBeGreaterThan(0);
    }
  });

  it('includes evaluate_policy action', async () => {
    resetIdCounter();
    const posture = await getSecurityPosture(createMockDb());
    expect(posture._actions.evaluate_policy.method).toBe('POST');
  });

  it('includes request_review action', async () => {
    resetIdCounter();
    const posture = await getSecurityPosture(createMockDb());
    expect(posture._actions.request_review.method).toBe('POST');
    expect(posture._actions.request_review.href).toContain('{alertId}');
  });

  it('includes quarantine action', async () => {
    resetIdCounter();
    const posture = await getSecurityPosture(createMockDb());
    expect(posture._actions.quarantine.method).toBe('POST');
    expect(posture._actions.quarantine.href).toContain('{eventId}');
  });

  it('includes get_playbook action', async () => {
    resetIdCounter();
    const posture = await getSecurityPosture(createMockDb());
    expect(posture._actions.get_playbook.method).toBe('GET');
  });
});

describe('policy decision includes recommendation contract', () => {
  const denyPolicy: SecurityPolicy[] = [{
    id: 'p1', name: 'Deny exports', priority: 10, decision: 'deny',
    conditions: [{ field: 'action', operator: 'eq', value: 'export' }],
  }];

  const escalatePolicy: SecurityPolicy[] = [{
    id: 'p2', name: 'Escalate payments', priority: 10, decision: 'escalate',
    conditions: [{ field: 'action', operator: 'eq', value: 'pay' }],
  }];

  it('deny includes nextAction and safeAlternatives', () => {
    const decision = evaluatePolicy(
      { principal: { principalId: 'x', principalType: 'user' }, action: 'export' },
      denyPolicy
    );
    expect(decision.recommendation).toBeDefined();
    expect(typeof decision.recommendation!.nextAction).toBe('string');
    expect(Array.isArray(decision.recommendation!.safeAlternatives)).toBe(true);
    expect(decision.recommendation!.safeAlternatives.length).toBeGreaterThan(0);
  });

  it('escalate includes human approval guidance', () => {
    const decision = evaluatePolicy(
      { principal: { principalId: 'x', principalType: 'user' }, action: 'pay' },
      escalatePolicy
    );
    expect(decision.recommendation).toBeDefined();
    expect(decision.recommendation!.nextAction).toContain('human');
  });

  it('allow has no recommendation (nothing to recover from)', () => {
    const decision = evaluatePolicy(
      { principal: { principalId: 'x', principalType: 'user' }, action: 'read' },
      []
    );
    expect(decision.recommendation).toBeUndefined();
  });
});

describe('action gate block includes recovery contract', () => {
  it('blacklist block has nextAction + safeAlternatives', async () => {
    resetIdCounter();
    const bl = new CompositeBlacklist();
    bl.blockIp('bad-ip');

    const result = await shouldBlockAction(createMockDb(), {
      principal: { principalId: 'u1', principalType: 'user' },
      action: 'read',
      ip: 'bad-ip',
    }, { blacklist: bl });

    expect(result.recovery).toBeDefined();
    expect(result.recovery!.nextAction).toBeTruthy();
    expect(result.recovery!.safeAlternatives.length).toBeGreaterThan(0);
  });

  it('nonce replay block has recovery guidance', async () => {
    resetIdCounter();
    const ns = new InMemoryNonceStore();
    ns.checkAndSet('used');

    const result = await shouldBlockAction(createMockDb(), {
      principal: { principalId: 'u1', principalType: 'user' },
      action: 'read',
      nonce: 'used',
    }, { nonceStore: ns });

    expect(result.recovery).toBeDefined();
    expect(result.recovery!.nextAction).toContain('nonce');
  });
});

describe('alert recovery contract', () => {
  const alertTypes = [
    'brute_force', 'account_takeover', 'data_exfiltration',
    'privilege_escalation', 'csrf_attack', 'injection_attack',
    'rate_limit', 'coordinated_attack', 'webhook_spoofing',
    'suspicious_patterns', 'unknown_custom_type',
  ];

  for (const alertType of alertTypes) {
    it(`${alertType} recovery has impact + action + reason + followups`, () => {
      const recovery = buildAlertRecovery({ alertType, riskLevel: 'HIGH' });
      expect(recovery.impact).toMatch(/^(halt_execution|degrade_gracefully|continue_monitoring)$/);
      expect(typeof recovery.action).toBe('string');
      expect(recovery.action.length).toBeGreaterThan(0);
      expect(typeof recovery.reason).toBe('string');
      expect(recovery.reason.length).toBeGreaterThan(0);
      expect(Array.isArray(recovery.allowedFollowups)).toBe(true);
      expect(recovery.allowedFollowups.length).toBeGreaterThan(0);
    });
  }
});
