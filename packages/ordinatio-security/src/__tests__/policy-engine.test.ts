// ===========================================
// Policy Engine Tests
// ===========================================

import { describe, it, expect } from 'vitest';
import { evaluatePolicy, wouldBeDenied } from '../policy/policy-engine';
import type { SecurityPolicy, PolicyContext } from '../policy/policy-types';

const makeContext = (overrides: Partial<PolicyContext> = {}): PolicyContext => ({
  principal: {
    principalId: 'user-1',
    principalType: 'user',
    trustTier: 1,
  },
  action: 'read_data',
  ...overrides,
});

describe('evaluatePolicy', () => {
  it('allows when no policies match', () => {
    const result = evaluatePolicy(makeContext(), []);
    expect(result.decision).toBe('allow');
    expect(result.requiresHuman).toBe(false);
    expect(result.reasons).toContainEqual(expect.stringContaining('default allow'));
  });

  it('matches policy with eq condition', () => {
    const policies: SecurityPolicy[] = [{
      id: 'p1',
      name: 'Block agents from exports',
      conditions: [
        { field: 'principal.principalType', operator: 'eq', value: 'agent' },
        { field: 'action', operator: 'eq', value: 'export_data' },
      ],
      decision: 'deny',
      priority: 10,
    }];

    const result = evaluatePolicy(
      makeContext({ principal: { principalId: 'coo', principalType: 'agent' }, action: 'export_data' }),
      policies
    );
    expect(result.decision).toBe('deny');
    expect(result.policyName).toBe('Block agents from exports');
  });

  it('allows when conditions do not match', () => {
    const policies: SecurityPolicy[] = [{
      id: 'p1',
      name: 'Block agents',
      conditions: [{ field: 'principal.principalType', operator: 'eq', value: 'agent' }],
      decision: 'deny',
      priority: 10,
    }];

    const result = evaluatePolicy(makeContext(), policies); // user, not agent
    expect(result.decision).toBe('allow');
  });

  it('evaluates policies by priority (highest first)', () => {
    const policies: SecurityPolicy[] = [
      {
        id: 'p-low',
        name: 'Low priority deny',
        conditions: [{ field: 'action', operator: 'eq', value: 'test' }],
        decision: 'deny',
        priority: 1,
      },
      {
        id: 'p-high',
        name: 'High priority allow',
        conditions: [{ field: 'action', operator: 'eq', value: 'test' }],
        decision: 'allow',
        priority: 10,
      },
    ];

    const result = evaluatePolicy(makeContext({ action: 'test' }), policies);
    expect(result.decision).toBe('allow');
    expect(result.policyId).toBe('p-high');
  });

  it('supports neq operator', () => {
    const policies: SecurityPolicy[] = [{
      id: 'p1',
      name: 'Deny non-users',
      conditions: [{ field: 'principal.principalType', operator: 'neq', value: 'user' }],
      decision: 'deny',
      priority: 10,
    }];

    const result = evaluatePolicy(
      makeContext({ principal: { principalId: 'bot', principalType: 'automation' } }),
      policies
    );
    expect(result.decision).toBe('deny');
  });

  it('supports in operator', () => {
    const policies: SecurityPolicy[] = [{
      id: 'p1',
      name: 'Block risky actions',
      conditions: [{ field: 'action', operator: 'in', value: ['delete', 'export', 'purge'] }],
      decision: 'deny',
      priority: 10,
    }];

    const result = evaluatePolicy(makeContext({ action: 'export' }), policies);
    expect(result.decision).toBe('deny');

    const result2 = evaluatePolicy(makeContext({ action: 'read' }), policies);
    expect(result2.decision).toBe('allow');
  });

  it('supports gte/lte operators', () => {
    const policies: SecurityPolicy[] = [{
      id: 'p1',
      name: 'Escalate for untrusted',
      conditions: [{ field: 'principal.trustTier', operator: 'lte', value: 0 }],
      decision: 'escalate',
      priority: 10,
    }];

    const result = evaluatePolicy(
      makeContext({ principal: { principalId: 'x', principalType: 'user', trustTier: 0 } }),
      policies
    );
    expect(result.decision).toBe('escalate');
    expect(result.requiresHuman).toBe(true);
  });

  it('includes recommendation on deny', () => {
    const policies: SecurityPolicy[] = [{
      id: 'p1',
      name: 'Block test',
      conditions: [{ field: 'action', operator: 'eq', value: 'bad' }],
      decision: 'deny',
      priority: 10,
    }];

    const result = evaluatePolicy(makeContext({ action: 'bad' }), policies);
    expect(result.recommendation).toBeDefined();
    expect(result.recommendation?.nextAction).toBeTruthy();
    expect(result.recommendation?.safeAlternatives.length).toBeGreaterThan(0);
  });

  it('includes recommendation on escalate', () => {
    const policies: SecurityPolicy[] = [{
      id: 'p1',
      name: 'Escalate test',
      conditions: [{ field: 'action', operator: 'eq', value: 'risky' }],
      decision: 'escalate',
      priority: 10,
    }];

    const result = evaluatePolicy(makeContext({ action: 'risky' }), policies);
    expect(result.recommendation).toBeDefined();
    expect(result.recommendation?.nextAction).toContain('human approval');
  });

  it('passes through policy constraints', () => {
    const policies: SecurityPolicy[] = [{
      id: 'p1',
      name: 'Allow with limits',
      conditions: [{ field: 'action', operator: 'eq', value: 'read' }],
      decision: 'allow',
      priority: 10,
      constraints: { maxRecords: 100 },
    }];

    const result = evaluatePolicy(makeContext({ action: 'read' }), policies);
    expect(result.constraints).toEqual({ maxRecords: 100 });
  });

  it('handles undefined field paths gracefully', () => {
    const policies: SecurityPolicy[] = [{
      id: 'p1',
      name: 'Check nonexistent',
      conditions: [{ field: 'metadata.foo.bar', operator: 'eq', value: 'x' }],
      decision: 'deny',
      priority: 10,
    }];

    const result = evaluatePolicy(makeContext(), policies);
    expect(result.decision).toBe('allow'); // Condition doesn't match
  });

  it('returns trust tier from principal', () => {
    const result = evaluatePolicy(
      makeContext({ principal: { principalId: 'x', principalType: 'user', trustTier: 2 } }),
      []
    );
    expect(result.trustTier).toBe(2);
  });

  it('defaults trustTier to 0 when not set', () => {
    const result = evaluatePolicy(
      makeContext({ principal: { principalId: 'x', principalType: 'user' } }),
      []
    );
    expect(result.trustTier).toBe(0);
  });

  it('requires ALL conditions to match (AND logic)', () => {
    const policies: SecurityPolicy[] = [{
      id: 'p1',
      name: 'Both conditions',
      conditions: [
        { field: 'action', operator: 'eq', value: 'delete' },
        { field: 'principal.principalType', operator: 'eq', value: 'agent' },
      ],
      decision: 'deny',
      priority: 10,
    }];

    // Only one condition matches
    const result = evaluatePolicy(makeContext({ action: 'delete' }), policies);
    expect(result.decision).toBe('allow');

    // Both conditions match
    const result2 = evaluatePolicy(
      makeContext({ action: 'delete', principal: { principalId: 'x', principalType: 'agent' } }),
      policies
    );
    expect(result2.decision).toBe('deny');
  });
});

describe('wouldBeDenied', () => {
  it('returns true for deny', () => {
    const policies: SecurityPolicy[] = [{
      id: 'p1',
      name: 'Deny all',
      conditions: [{ field: 'action', operator: 'eq', value: 'bad' }],
      decision: 'deny',
      priority: 10,
    }];
    expect(wouldBeDenied(makeContext({ action: 'bad' }), policies)).toBe(true);
  });

  it('returns false for allow', () => {
    expect(wouldBeDenied(makeContext(), [])).toBe(false);
  });

  it('returns false for escalate', () => {
    const policies: SecurityPolicy[] = [{
      id: 'p1',
      name: 'Escalate',
      conditions: [{ field: 'action', operator: 'eq', value: 'risky' }],
      decision: 'escalate',
      priority: 10,
    }];
    expect(wouldBeDenied(makeContext({ action: 'risky' }), policies)).toBe(false);
  });
});
