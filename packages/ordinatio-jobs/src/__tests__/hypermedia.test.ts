import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { registerJobType, planJob, clearRegistry, DEFAULT_RETRY_POLICY } from '../job-registry';
import { registerCron, getCronPosture, clearCrons, setCronEnabled } from '../cron-scheduler';
import type { JobTypeDefinition, QueuePosture } from '../types';
import { summarizePosture } from '../health';

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

describe('Hypermedia Contract', () => {
  beforeEach(() => {
    clearRegistry();
    clearCrons();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ---- JobPlan ----

  describe('JobPlan _actions', () => {
    it('includes execute action for valid plan', () => {
      registerJobType(makeDef({ type: 'VALID' }));
      const plan = planJob('VALID', {});
      expect(plan._actions?.execute).toBeDefined();
      expect(plan._actions?.execute.intent).toContain('Execute');
    });

    it('includes fix_payload for invalid plan', () => {
      registerJobType(makeDef({
        type: 'BAD_DATA',
        validate: () => { throw new Error('bad'); },
      }));
      const plan = planJob('BAD_DATA', {});
      expect(plan._actions?.fix_payload).toBeDefined();
      expect(plan._actions?.fix_payload.requiredInputs).toBeDefined();
    });

    it('includes request_approval for approval-required jobs', () => {
      registerJobType(makeDef({ type: 'NEEDS_APPROVAL', requiresHumanApproval: true }));
      const plan = planJob('NEEDS_APPROVAL', {});
      expect(plan._actions?.request_approval).toBeDefined();
    });

    it('does NOT include request_approval for auto-approved jobs', () => {
      registerJobType(makeDef({ type: 'AUTO', requiresHumanApproval: false }));
      const plan = planJob('AUTO', {});
      expect(plan._actions?.request_approval).toBeUndefined();
    });

    it('unknown job type has no execute action', () => {
      const plan = planJob('UNKNOWN', {});
      expect(plan._actions?.execute).toBeUndefined();
    });

    it('every action has an intent field', () => {
      registerJobType(makeDef({ type: 'CHECK_INTENTS', requiresHumanApproval: true }));
      const plan = planJob('CHECK_INTENTS', {});
      if (plan._actions) {
        for (const [name, action] of Object.entries(plan._actions)) {
          expect(action.intent, `Action "${name}" missing intent`).toBeTruthy();
        }
      }
    });
  });

  // ---- CronPosture ----

  describe('CronPosture _actions', () => {
    it('includes trigger action when not running', () => {
      registerCron({ name: 'test', schedule: '0 6 * * *', handler: vi.fn().mockResolvedValue(undefined) });
      const posture = getCronPosture('test')!;
      expect(posture._actions?.trigger).toBeDefined();
    });

    it('includes disable action when enabled', () => {
      registerCron({ name: 'enabled', schedule: '0 6 * * *', handler: vi.fn().mockResolvedValue(undefined) });
      const posture = getCronPosture('enabled')!;
      expect(posture._actions?.disable).toBeDefined();
    });

    it('includes enable action when disabled', () => {
      registerCron({ name: 'disabled', schedule: '0 6 * * *', handler: vi.fn().mockResolvedValue(undefined), enabled: false });
      const posture = getCronPosture('disabled')!;
      expect(posture._actions?.enable).toBeDefined();
      expect(posture._actions?.disable).toBeUndefined();
    });

    it('every action has an intent field', () => {
      registerCron({ name: 'intents', schedule: '0 6 * * *', handler: vi.fn().mockResolvedValue(undefined) });
      const posture = getCronPosture('intents')!;
      if (posture._actions) {
        for (const [name, action] of Object.entries(posture._actions)) {
          expect(action.intent, `Action "${name}" missing intent`).toBeTruthy();
        }
      }
    });
  });

  // ---- QueuePosture (via summary — posture object shape) ----

  describe('QueuePosture structure', () => {
    it('summary contains queue name and load level', () => {
      const posture: QueuePosture = {
        queueName: 'placement', connected: true, loadLevel: 'high',
        counts: { waiting: 50, active: 10, completed: 100, failed: 2, delayed: 0, paused: 0, deadLetter: 0, quarantined: 0 },
        stuckJobs: 0, oldestWaitingMs: 5000, consecutiveFailures: 0, needsAttention: true,
      };
      const summary = summarizePosture(posture);
      expect(summary).toContain('placement');
      expect(summary).toContain('[high]');
    });
  });
});
