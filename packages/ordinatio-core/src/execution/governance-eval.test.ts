// IHS
import { describe, it, expect } from 'vitest';
import {
  evaluateCapability,
  requiresApproval,
  findOverride,
  buildPauseContinuation,
} from './governance-eval';
import type { GovernancePolicy, GovernancePolicyOverride } from '../governance/types';
import type { PlannedAction, MachineState, BudgetSnapshot } from './machine-types';

const STARTUP_POLICY: GovernancePolicy = {
  organizationId: 'org-1',
  mode: 'startup',
  approvalThreshold: 'govern',
  overrides: [],
};

const ENTERPRISE_POLICY: GovernancePolicy = {
  organizationId: 'org-1',
  mode: 'enterprise',
  approvalThreshold: 'act',
  overrides: [],
};

const REGULATED_POLICY: GovernancePolicy = {
  organizationId: 'org-1',
  mode: 'regulated',
  approvalThreshold: 'suggest',
  overrides: [],
};

function makeAction(capability: string, riskLevel: PlannedAction['riskLevel']): PlannedAction {
  return { capability, riskLevel, parameters: {}, reasoning: 'test' };
}

function makeMachineState(overrides?: Partial<MachineState>): MachineState {
  return {
    executionId: 'exec-test-123',
    config: {
      trigger: { type: 'event', source: 'test', metadata: {} },
      contextSnapshot: '',
      capabilities: [],
      governancePolicy: STARTUP_POLICY,
    },
    phase: 'governance_check',
    budget: { llmCallsUsed: 1, tokensUsed: 500, actionsExecuted: 0, elapsedMs: 100 },
    actions: [],
    governanceDecisions: [],
    startedAt: new Date(),
    ...overrides,
  };
}

describe('evaluateCapability', () => {
  it('approves observe action under startup policy', () => {
    const decision = evaluateCapability(makeAction('client.list', 'observe'), STARTUP_POLICY);
    expect(decision.verdict).toBe('approved');
    expect(decision.capabilityId).toBe('client.list');
    expect(decision.risk).toBe('observe');
  });

  it('approves suggest action under startup policy', () => {
    const decision = evaluateCapability(makeAction('email.draft', 'suggest'), STARTUP_POLICY);
    expect(decision.verdict).toBe('approved');
  });

  it('approves act action under startup policy', () => {
    const decision = evaluateCapability(makeAction('order.create', 'act'), STARTUP_POLICY);
    expect(decision.verdict).toBe('approved');
  });

  it('requires approval for govern action under startup policy', () => {
    const decision = evaluateCapability(makeAction('policy.update', 'govern'), STARTUP_POLICY);
    expect(decision.verdict).toBe('requires_approval');
  });

  it('requires approval for act action under enterprise policy', () => {
    const decision = evaluateCapability(makeAction('order.create', 'act'), ENTERPRISE_POLICY);
    expect(decision.verdict).toBe('requires_approval');
  });

  it('approves suggest action under enterprise policy', () => {
    const decision = evaluateCapability(makeAction('email.draft', 'suggest'), ENTERPRISE_POLICY);
    expect(decision.verdict).toBe('approved');
  });

  it('requires approval for suggest action under regulated policy', () => {
    const decision = evaluateCapability(makeAction('email.draft', 'suggest'), REGULATED_POLICY);
    expect(decision.verdict).toBe('requires_approval');
  });

  it('applies capability-specific override to raise threshold', () => {
    const overrides: GovernancePolicyOverride[] = [
      { capabilityId: 'order.create', effectiveRisk: 'govern', reason: 'Order creation trusted' },
    ];
    const decision = evaluateCapability(makeAction('order.create', 'act'), ENTERPRISE_POLICY, overrides);
    expect(decision.verdict).toBe('approved');
    expect(decision.reason).toContain('override');
  });

  it('applies wildcard override', () => {
    const overrides: GovernancePolicyOverride[] = [
      { capabilityId: '*', effectiveRisk: 'govern', reason: 'Trust all' },
    ];
    const decision = evaluateCapability(makeAction('anything.do', 'act'), ENTERPRISE_POLICY, overrides);
    expect(decision.verdict).toBe('approved');
  });

  it('prefers exact match over wildcard', () => {
    const overrides: GovernancePolicyOverride[] = [
      { capabilityId: '*', effectiveRisk: 'observe', reason: 'Restrict all' },
      { capabilityId: 'safe.read', effectiveRisk: 'govern', reason: 'Trust safe reads' },
    ];
    // Without exact match, wildcard threshold=observe would block this observe action.
    // With exact match, threshold=govern allows observe action through.
    const decision = evaluateCapability(makeAction('safe.read', 'observe'), ENTERPRISE_POLICY, overrides);
    expect(decision.verdict).toBe('approved');
    expect(decision.reason).toContain('Trust safe reads');
  });

  it('includes correct fields in decision', () => {
    const decision = evaluateCapability(makeAction('client.list', 'observe'), STARTUP_POLICY);
    expect(decision.capabilityId).toBe('client.list');
    expect(decision.risk).toBe('observe');
    expect(decision.threshold).toBe('govern');
    expect(decision.decidedAt).toBeInstanceOf(Date);
  });
});

describe('requiresApproval', () => {
  it('returns false for observe under startup', () => {
    expect(requiresApproval(makeAction('cap', 'observe'), STARTUP_POLICY)).toBe(false);
  });

  it('returns true for govern under startup', () => {
    expect(requiresApproval(makeAction('cap', 'govern'), STARTUP_POLICY)).toBe(true);
  });

  it('returns true for act under enterprise', () => {
    expect(requiresApproval(makeAction('cap', 'act'), ENTERPRISE_POLICY)).toBe(true);
  });

  it('returns false for observe under enterprise', () => {
    expect(requiresApproval(makeAction('cap', 'observe'), ENTERPRISE_POLICY)).toBe(false);
  });
});

describe('findOverride', () => {
  it('returns undefined when no overrides', () => {
    expect(findOverride('cap', [])).toBeUndefined();
  });

  it('finds exact match', () => {
    const overrides: GovernancePolicyOverride[] = [
      { capabilityId: 'order.create', effectiveRisk: 'govern', reason: 'trusted' },
    ];
    expect(findOverride('order.create', overrides)?.effectiveRisk).toBe('govern');
  });

  it('falls back to wildcard', () => {
    const overrides: GovernancePolicyOverride[] = [
      { capabilityId: '*', effectiveRisk: 'act', reason: 'default' },
    ];
    expect(findOverride('anything', overrides)?.effectiveRisk).toBe('act');
  });
});

describe('buildPauseContinuation', () => {
  it('creates a ContinuationToken with action and state', () => {
    const state = makeMachineState();
    const action = makeAction('order.create', 'act');
    const token = buildPauseContinuation(state, action);

    expect(token.id).toMatch(/^cont-exec-test-123-/);
    expect(token.pausedAtCapability).toBe('order.create');
    expect(token.awaitingApproval).toContain('order.create');
    expect(token.awaitingApproval).toContain('act');
    expect(token.expiresAt.getTime()).toBeGreaterThan(Date.now());
    expect(token.parentArtifactId).toBe('exec-test-123');
    expect(token.state).toHaveProperty('executionId');
    expect(token.state).toHaveProperty('pendingAction');
    expect(token.state).toHaveProperty('budgetSnapshot');
  });
});
