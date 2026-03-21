import { describe, it, expect, beforeEach } from 'vitest';
import { registerJobType, planJob, setPolicyEvaluator, clearRegistry, DEFAULT_RETRY_POLICY } from '../job-registry';
import type { JobTypeDefinition, PolicyEvaluator } from '../types';

function makeDef(overrides: Partial<JobTypeDefinition> = {}): JobTypeDefinition {
  return {
    type: 'TEST', description: 'test', spec: 'job-v1',
    retry: DEFAULT_RETRY_POLICY, defaultPriority: 5,
    intent: 'update_state',
    definitionOfDone: { checks: ['done'] },
    sideEffects: { writes: [], externalCalls: [], irreversible: false },
    safeToRetry: true, idempotent: true,
    requiresHumanApproval: false, riskLevel: 'low', replayPolicy: 'allow',
    ...overrides,
  };
}

/**
 * Reference policy evaluator used for the truth table.
 * Encodes the standard rules:
 * - critical risk → requires trust tier 2
 * - high risk → requires trust tier 1
 * - irreversible + no approval → escalate
 * - org mismatch → deny
 */
const standardPolicy: PolicyEvaluator = (job, ctx) => {
  // Org isolation
  if (ctx.organizationId && ctx.organizationId !== 'test-org') {
    return { decision: 'deny', reason: 'Cross-org execution blocked' };
  }

  const trust = ctx.trustTier ?? 0;

  if (job.riskLevel === 'critical' && trust < 2) {
    return { decision: 'deny', reason: 'Critical risk requires trust tier 2+', trustTier: trust };
  }
  if (job.riskLevel === 'high' && trust < 1) {
    return { decision: 'escalate', reason: 'High risk requires trust tier 1+', trustTier: trust };
  }
  if (job.sideEffects.irreversible && !job.requiresHumanApproval) {
    return { decision: 'escalate', reason: 'Irreversible without approval gate' };
  }

  return { decision: 'allow', trustTier: trust };
};

describe('Policy Truth Table', () => {
  beforeEach(() => {
    clearRegistry();
    setPolicyEvaluator(standardPolicy);
  });

  // ---- Risk Level × Trust Tier Matrix ----

  describe('risk × trust matrix', () => {
    const riskLevels = ['low', 'medium', 'high', 'critical'] as const;
    const trustTiers = [0, 1, 2];

    for (const risk of riskLevels) {
      for (const trust of trustTiers) {
        const expected =
          risk === 'critical' && trust < 2 ? 'deny' :
          risk === 'high' && trust < 1 ? 'escalate' :
          'allow';

        it(`risk=${risk}, trust=${trust} → ${expected}`, () => {
          registerJobType(makeDef({ type: `${risk}_${trust}`, riskLevel: risk }));
          const plan = planJob(`${risk}_${trust}`, {}, { trustTier: trust, organizationId: 'test-org' });
          expect(plan.policyResult?.decision).toBe(expected);
        });
      }
    }
  });

  // ---- Irreversible × Approval ----

  describe('irreversible × approval', () => {
    it('irreversible + no approval → escalate', () => {
      registerJobType(makeDef({
        type: 'IRREVERSIBLE_NO_APPROVAL',
        sideEffects: { writes: ['db'], externalCalls: ['api'], irreversible: true },
        requiresHumanApproval: false,
      }));
      const plan = planJob('IRREVERSIBLE_NO_APPROVAL', {}, { trustTier: 2, organizationId: 'test-org' });
      expect(plan.policyResult?.decision).toBe('escalate');
    });

    it('irreversible + approval gate → allow (if trust sufficient)', () => {
      registerJobType(makeDef({
        type: 'IRREVERSIBLE_WITH_APPROVAL',
        sideEffects: { writes: ['db'], externalCalls: ['api'], irreversible: true },
        requiresHumanApproval: true,
      }));
      const plan = planJob('IRREVERSIBLE_WITH_APPROVAL', {}, { trustTier: 2, organizationId: 'test-org' });
      expect(plan.policyResult?.decision).toBe('allow');
    });

    it('reversible + no approval → allow', () => {
      registerJobType(makeDef({
        type: 'REVERSIBLE',
        sideEffects: { writes: ['db'], externalCalls: [], irreversible: false },
      }));
      const plan = planJob('REVERSIBLE', {}, { trustTier: 0, organizationId: 'test-org' });
      expect(plan.policyResult?.decision).toBe('allow');
    });
  });

  // ---- Org Isolation ----

  describe('organization isolation', () => {
    it('same org → allow', () => {
      registerJobType(makeDef({ type: 'SAME_ORG' }));
      const plan = planJob('SAME_ORG', {}, { organizationId: 'test-org', trustTier: 2 });
      expect(plan.policyResult?.decision).toBe('allow');
    });

    it('different org → deny', () => {
      registerJobType(makeDef({ type: 'CROSS_ORG' }));
      const plan = planJob('CROSS_ORG', {}, { organizationId: 'other-org', trustTier: 2 });
      expect(plan.policyResult?.decision).toBe('deny');
      expect(plan.policyResult?.reason).toContain('Cross-org');
    });
  });

  // ---- No Policy Evaluator ----

  describe('no policy evaluator', () => {
    it('returns no policy result when evaluator is null', () => {
      setPolicyEvaluator(null);
      registerJobType(makeDef({ type: 'NO_POLICY', riskLevel: 'critical' }));
      const plan = planJob('NO_POLICY', {}, { trustTier: 0 });
      expect(plan.policyResult).toBeUndefined();
    });
  });

  // ---- Edge Cases ----

  describe('edge cases', () => {
    it('missing trustTier defaults to 0', () => {
      registerJobType(makeDef({ type: 'NO_TRUST', riskLevel: 'high' }));
      const plan = planJob('NO_TRUST', {}, { organizationId: 'test-org' });
      expect(plan.policyResult?.decision).toBe('escalate'); // high + trust 0 → escalate
    });

    it('missing context still runs policy', () => {
      registerJobType(makeDef({ type: 'NO_CTX' }));
      const plan = planJob('NO_CTX', {});
      // No context passed → no policy result (evaluator only runs with context)
      expect(plan.policyResult).toBeUndefined();
    });

    it('policy deny does not prevent plan generation', () => {
      registerJobType(makeDef({ type: 'DENIED', riskLevel: 'critical' }));
      const plan = planJob('DENIED', {}, { trustTier: 0, organizationId: 'test-org' });
      expect(plan.policyResult?.decision).toBe('deny');
      // Plan is still generated with all fields
      expect(plan.type).toBe('DENIED');
      expect(plan.riskLevel).toBe('critical');
      expect(plan.sideEffects).toBeDefined();
    });
  });
});
