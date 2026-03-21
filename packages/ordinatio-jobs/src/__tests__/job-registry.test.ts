// ===========================================
// ORDINATIO JOBS v1.1 — Job Registry Tests
// ===========================================

import { describe, it, expect, beforeEach } from 'vitest';
import {
  registerJobType,
  getJobType,
  getRegisteredTypes,
  isRegisteredType,
  getRetryPolicy,
  validateJobData,
  deregisterJobType,
  clearRegistry,
  getRegistry,
  planJob,
  setPolicyEvaluator,
  DEFAULT_RETRY_POLICY,
} from '../job-registry';
import type { JobTypeDefinition } from '../types';

/** Helper: build a valid v1.1 job definition. */
function makeJobDef(overrides: Partial<JobTypeDefinition> = {}): JobTypeDefinition {
  return {
    type: 'TEST_JOB',
    description: 'A test job',
    spec: 'job-v1',
    retry: DEFAULT_RETRY_POLICY,
    defaultPriority: 5,
    intent: 'update_state',
    definitionOfDone: { checks: ['record exists in DB'] },
    sideEffects: { writes: ['orders'], externalCalls: [], irreversible: false },
    safeToRetry: true,
    idempotent: true,
    requiresHumanApproval: false,
    riskLevel: 'low',
    replayPolicy: 'allow',
    ...overrides,
  };
}

describe('Job Registry v1.1', () => {
  beforeEach(() => {
    clearRegistry();
  });

  // ---- Registration ----

  describe('registerJobType', () => {
    it('registers a job with full agentic contract', () => {
      registerJobType(makeJobDef({ type: 'PLACE_ORDER', intent: 'place_order', riskLevel: 'high' }));
      expect(isRegisteredType('PLACE_ORDER')).toBe(true);

      const def = getJobType('PLACE_ORDER')!;
      expect(def.intent).toBe('place_order');
      expect(def.riskLevel).toBe('high');
      expect(def.spec).toBe('job-v1');
    });

    it('throws JOBS_130 on duplicate registration', () => {
      registerJobType(makeJobDef());
      expect(() => registerJobType(makeJobDef())).toThrow('JOBS_130');
    });

    it('throws JOBS_132 when intent is missing', () => {
      expect(() => registerJobType({
        type: 'BAD', description: 'bad', spec: 'job-v1',
        retry: DEFAULT_RETRY_POLICY, defaultPriority: 5,
        definitionOfDone: { checks: ['x'] },
        sideEffects: { writes: [], externalCalls: [], irreversible: false },
        safeToRetry: true, idempotent: true, requiresHumanApproval: false,
        riskLevel: 'low', replayPolicy: 'deny',
      } as unknown as JobTypeDefinition)).toThrow('JOBS_132');
    });

    it('throws JOBS_132 when definitionOfDone is empty', () => {
      expect(() => registerJobType(makeJobDef({
        type: 'EMPTY_DOD',
        definitionOfDone: { checks: [] },
      }))).toThrow('JOBS_132');
    });

    it('throws JOBS_132 when spec is missing', () => {
      const def = makeJobDef({ type: 'NO_SPEC' });
      (def as Record<string, unknown>).spec = undefined;
      expect(() => registerJobType(def)).toThrow('JOBS_132');
    });

    it('throws JOBS_132 when safety fields are missing', () => {
      const def = makeJobDef({ type: 'UNSAFE' });
      (def as Record<string, unknown>).safeToRetry = undefined;
      expect(() => registerJobType(def)).toThrow('JOBS_132');
    });

    it('registers multiple types', () => {
      registerJobType(makeJobDef({ type: 'A' }));
      registerJobType(makeJobDef({ type: 'B' }));
      expect(getRegisteredTypes()).toEqual(['A', 'B']);
    });
  });

  // ---- Retrieval ----

  describe('getJobType', () => {
    it('returns full definition with all agentic fields', () => {
      registerJobType(makeJobDef({
        type: 'SEND_EMAIL',
        intent: 'send_message',
        sideEffects: { writes: [], externalCalls: ['gmail'], irreversible: true },
        riskLevel: 'medium',
        requiresHumanApproval: true,
      }));

      const def = getJobType('SEND_EMAIL')!;
      expect(def.intent).toBe('send_message');
      expect(def.sideEffects.externalCalls).toEqual(['gmail']);
      expect(def.sideEffects.irreversible).toBe(true);
      expect(def.requiresHumanApproval).toBe(true);
    });

    it('returns undefined for unregistered type', () => {
      expect(getJobType('NONEXISTENT')).toBeUndefined();
    });
  });

  // ---- Retry Policy ----

  describe('getRetryPolicy', () => {
    it('returns the registered policy', () => {
      registerJobType(makeJobDef({
        type: 'CUSTOM',
        retry: { maxAttempts: 7, backoff: { type: 'fixed', delay: 10000 } },
      }));
      const policy = getRetryPolicy('CUSTOM');
      expect(policy.maxAttempts).toBe(7);
      expect(policy.backoff.type).toBe('fixed');
    });

    it('falls back to default for unregistered types', () => {
      expect(getRetryPolicy('UNKNOWN')).toEqual(DEFAULT_RETRY_POLICY);
    });
  });

  // ---- Validation ----

  describe('validateJobData', () => {
    it('passes through data when no validator is set', () => {
      registerJobType(makeJobDef({ type: 'NOVALIDATE' }));
      expect(validateJobData('NOVALIDATE', { foo: 'bar' })).toEqual({ foo: 'bar' });
    });

    it('validates data with a custom validator', () => {
      registerJobType(makeJobDef({
        type: 'VALIDATED',
        validate: (d: unknown) => {
          const data = d as { orderId?: string };
          if (!data.orderId) throw new Error('orderId required');
          return data;
        },
      }));
      expect(validateJobData('VALIDATED', { orderId: 'abc' })).toEqual({ orderId: 'abc' });
    });

    it('throws JOBS_131 when validation fails', () => {
      registerJobType(makeJobDef({
        type: 'STRICT',
        validate: () => { throw new Error('bad data'); },
      }));
      expect(() => validateJobData('STRICT', {})).toThrow('JOBS_131');
    });
  });

  // ---- Job Plan (Preflight) ----

  describe('planJob', () => {
    it('returns a complete plan for a valid job', () => {
      registerJobType(makeJobDef({
        type: 'PLACE_ORDER',
        intent: 'place_order',
        riskLevel: 'high',
        requiresHumanApproval: true,
        sideEffects: { writes: ['orders', 'placements'], externalCalls: ['gocreate'], irreversible: true },
        definitionOfDone: { checks: ['vendorOrderId is set', 'status = PLACED'] },
      }));

      const plan = planJob('PLACE_ORDER', { orderId: 'abc' });

      expect(plan.valid).toBe(true);
      expect(plan.intent).toBe('place_order');
      expect(plan.riskLevel).toBe('high');
      expect(plan.requiresApproval).toBe(true);
      expect(plan.sideEffects.externalCalls).toContain('gocreate');
      expect(plan.sideEffects.irreversible).toBe(true);
      expect(plan.definitionOfDone.checks).toHaveLength(2);
      expect(plan._actions).toBeDefined();
      expect(plan._actions!.execute).toBeDefined();
      expect(plan._actions!.request_approval).toBeDefined();
    });

    it('returns invalid plan for unknown type', () => {
      const plan = planJob('UNKNOWN', {});
      expect(plan.valid).toBe(false);
      expect(plan.riskLevel).toBe('critical');
      expect(plan.validationErrors).toBeDefined();
    });

    it('catches validation errors', () => {
      registerJobType(makeJobDef({
        type: 'STRICT_PLAN',
        validate: () => { throw new Error('missing orderId'); },
      }));

      const plan = planJob('STRICT_PLAN', {});
      expect(plan.valid).toBe(false);
      expect(plan.validationErrors).toContain('missing orderId');
      expect(plan._actions!.fix_payload).toBeDefined();
    });

    it('includes dependency information', () => {
      registerJobType(makeJobDef({
        type: 'WITH_DEPS',
        dependsOn: ['SYNC_PROFILES', 'CREATE_CUSTOMER'],
      }));

      const plan = planJob('WITH_DEPS', {});
      expect(plan.dependsOn).toEqual(['SYNC_PROFILES', 'CREATE_CUSTOMER']);
    });

    it('runs policy evaluation when evaluator is set', () => {
      registerJobType(makeJobDef({
        type: 'POLICY_TEST',
        riskLevel: 'critical',
      }));

      setPolicyEvaluator((job, ctx) => ({
        decision: ctx.trustTier && ctx.trustTier >= 2 ? 'allow' : 'deny',
        reason: 'Critical jobs require trust tier 2+',
        trustTier: ctx.trustTier,
      }));

      const deniedPlan = planJob('POLICY_TEST', {}, { trustTier: 1 });
      expect(deniedPlan.policyResult?.decision).toBe('deny');

      const allowedPlan = planJob('POLICY_TEST', {}, { trustTier: 2 });
      expect(allowedPlan.policyResult?.decision).toBe('allow');
    });
  });

  // ---- Deregistration ----

  describe('deregisterJobType', () => {
    it('removes a registered type', () => {
      registerJobType(makeJobDef({ type: 'TEMP' }));
      expect(deregisterJobType('TEMP')).toBe(true);
      expect(isRegisteredType('TEMP')).toBe(false);
    });

    it('returns false for nonexistent type', () => {
      expect(deregisterJobType('NOPE')).toBe(false);
    });
  });

  describe('clearRegistry', () => {
    it('removes all types and resets policy evaluator', () => {
      registerJobType(makeJobDef({ type: 'A' }));
      registerJobType(makeJobDef({ type: 'B' }));
      setPolicyEvaluator(() => ({ decision: 'allow' }));

      clearRegistry();

      expect(getRegisteredTypes()).toEqual([]);
      // Plan should not run policy (evaluator cleared)
      registerJobType(makeJobDef({ type: 'C' }));
      const plan = planJob('C', {}, { trustTier: 0 });
      expect(plan.policyResult).toBeUndefined();
    });
  });

  describe('getRegistry', () => {
    it('returns a readonly map', () => {
      registerJobType(makeJobDef({ type: 'READ' }));
      const reg = getRegistry();
      expect(reg.size).toBe(1);
      expect(reg.get('READ')?.intent).toBe('update_state');
    });
  });
});
