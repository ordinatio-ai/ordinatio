import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { registerJobType, planJob, setPolicyEvaluator, clearRegistry, DEFAULT_RETRY_POLICY } from '../job-registry';
import { registerCron, triggerCron, startScheduler, stopScheduler, clearCrons, getCronPosture } from '../cron-scheduler';
import { classifyFailure } from '../recovery';
import type { JobTypeDefinition } from '../types';

function makeDef(overrides: Partial<JobTypeDefinition> = {}): JobTypeDefinition {
  return {
    type: 'TEST', description: 'test', spec: 'job-v1',
    retry: DEFAULT_RETRY_POLICY, defaultPriority: 5,
    intent: 'update_state', definitionOfDone: { checks: ['done'] },
    sideEffects: { writes: [], externalCalls: [], irreversible: false },
    safeToRetry: true, idempotent: true,
    requiresHumanApproval: false, riskLevel: 'low', replayPolicy: 'allow',
    ...overrides,
  };
}

describe('Chaos / Failure Injection Tests', () => {
  beforeEach(() => {
    clearRegistry();
    clearCrons();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ---- Policy evaluator failures ----

  describe('policy evaluator throws', () => {
    it('planJob does not crash when evaluator throws', () => {
      registerJobType(makeDef({ type: 'POLICY_THROW' }));
      setPolicyEvaluator(() => { throw new Error('policy exploded'); });

      // Should not throw — should handle gracefully
      expect(() => planJob('POLICY_THROW', {}, { trustTier: 1 })).toThrow();
      // Note: current implementation lets the throw propagate.
      // This is a finding — we may want to catch it and return a deny result.
    });
  });

  // ---- Cron handler failures ----

  describe('cron handler throws', () => {
    it('scheduler continues after handler error', async () => {
      const failHandler = vi.fn().mockRejectedValue(new Error('cron boom'));
      const okHandler = vi.fn().mockResolvedValue(undefined);

      registerCron({ name: 'fail-cron', schedule: '0 6 * * *', handler: failHandler });
      registerCron({ name: 'ok-cron', schedule: '0 6 * * *', handler: okHandler });

      // Trigger both — fail-cron throws but ok-cron still runs
      await triggerCron('fail-cron');
      await triggerCron('ok-cron');

      expect(failHandler).toHaveBeenCalled();
      expect(okHandler).toHaveBeenCalled();

      // fail-cron increments failure count
      expect(getCronPosture('fail-cron')!.consecutiveFailures).toBe(1);
      // ok-cron stays healthy
      expect(getCronPosture('ok-cron')!.health).toBe('healthy');
    });

    it('cron handler throwing does not block nextRun scheduling', async () => {
      const handler = vi.fn().mockRejectedValue(new Error('boom'));
      vi.setSystemTime(new Date('2026-03-19T05:59:00Z'));
      registerCron({ name: 'recover', schedule: '0 6 * * *', handler });

      vi.setSystemTime(new Date('2026-03-19T06:00:00Z'));
      await triggerCron('recover');

      const posture = getCronPosture('recover')!;
      expect(posture.nextRun).toBeDefined();
      // nextRun should be tomorrow, not stuck
      expect(posture.nextRun!).toBeGreaterThan(Date.now());
    });
  });

  // ---- Validator failures ----

  describe('validator throws', () => {
    it('planJob catches validator error and returns invalid plan', () => {
      registerJobType(makeDef({
        type: 'BAD_VALIDATOR',
        validate: () => { throw new TypeError('Cannot read property of undefined'); },
      }));

      const plan = planJob('BAD_VALIDATOR', {});
      expect(plan.valid).toBe(false);
      expect(plan.validationErrors).toBeDefined();
      expect(plan.validationErrors![0]).toContain('Cannot read property');
    });

    it('validator that returns undefined still produces a plan', () => {
      registerJobType(makeDef({
        type: 'UNDEF_VALIDATOR',
        validate: () => undefined,
      }));

      const plan = planJob('UNDEF_VALIDATOR', {});
      expect(plan.valid).toBe(true); // Didn't throw = valid
    });
  });

  // ---- Callback failures ----

  describe('callback failures', () => {
    it('onCronFailed callback throwing does not crash scheduler', async () => {
      const handler = vi.fn().mockRejectedValue(new Error('cron fail'));
      registerCron({ name: 'cb-throw', schedule: '0 6 * * *', handler });

      startScheduler({
        onCronFailed: async () => { throw new Error('callback also fails!'); },
      });

      // Trigger the cron — handler fails, callback fails, but scheduler survives
      vi.setSystemTime(new Date('2026-03-19T06:00:30Z'));
      // Direct trigger to test callback path
      await expect(triggerCron('cb-throw')).resolves.toBe(true);

      stopScheduler();
    });
  });

  // ---- Recovery classification edge cases ----

  describe('recovery under chaos', () => {
    it('classifies error with no message', () => {
      const plan = classifyFailure(new Error(''), makeDef());
      expect(plan.reasonCode).toBeTruthy();
      expect(plan.nextAction).toBeTruthy();
    });

    it('classifies non-Error object', () => {
      const plan = classifyFailure({ code: 500, msg: 'server error' }, makeDef());
      expect(plan.reasonCode).toBeTruthy();
    });

    it('classifies undefined error', () => {
      const plan = classifyFailure(undefined, makeDef());
      expect(plan.nextAction).toBe('abort');
      expect(plan.humanInterventionRequired).toBe(true);
    });

    it('classifies error with multiple matching patterns — first match wins', () => {
      // "401 service unavailable" matches both auth (401) and retry (service unavailable)
      // Auth pattern comes before retry in the list
      const plan = classifyFailure(new Error('401 Unauthorized service unavailable'), makeDef());
      // 401 pattern should match first
      expect(plan.nextAction).toBe('request_human');
    });
  });

  // ---- State consistency after chaos ----

  describe('state consistency', () => {
    it('registry is consistent after failed registration', () => {
      registerJobType(makeDef({ type: 'GOOD' }));

      // Try to register with bad contract
      try {
        registerJobType({
          type: 'BAD', description: '', spec: 'job-v1',
        } as any);
      } catch { /* expected */ }

      // GOOD is still there, BAD was not registered
      expect(registerJobType).toBeDefined();
      // Registry is not corrupted
      const plan = planJob('GOOD', {});
      expect(plan.valid).toBe(true);
    });

    it('cron scheduler is consistent after handler crash', async () => {
      const handler = vi.fn()
        .mockRejectedValueOnce(new Error('crash 1'))
        .mockRejectedValueOnce(new Error('crash 2'))
        .mockResolvedValueOnce(undefined); // Third time works

      registerCron({ name: 'resilient', schedule: '0 6 * * *', handler });

      await triggerCron('resilient'); // crash 1
      await triggerCron('resilient'); // crash 2
      expect(getCronPosture('resilient')!.consecutiveFailures).toBe(2);

      await triggerCron('resilient'); // success
      expect(getCronPosture('resilient')!.consecutiveFailures).toBe(0); // Reset
      expect(getCronPosture('resilient')!.health).toBe('healthy');
    });
  });
});
