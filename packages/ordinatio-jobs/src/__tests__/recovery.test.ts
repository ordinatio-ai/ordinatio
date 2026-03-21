import { describe, it, expect } from 'vitest';
import { classifyFailure, defaultRecoveryPlan, isValidRecoveryPlan } from '../recovery';
import { DEFAULT_RETRY_POLICY } from '../job-registry';
import type { JobTypeDefinition, RecoveryPlan } from '../types';

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

describe('Recovery / Failure Classification', () => {
  describe('classifyFailure', () => {
    it('classifies connection errors as retry', () => {
      const plan = classifyFailure(new Error('ECONNREFUSED'), makeDef());
      expect(plan.nextAction).toBe('retry');
      expect(plan.retryRecommended).toBe(true);
    });

    it('classifies timeout errors as retry', () => {
      const plan = classifyFailure(new Error('ETIMEDOUT'), makeDef());
      expect(plan.nextAction).toBe('retry');
    });

    it('classifies 503 as retry', () => {
      const plan = classifyFailure(new Error('503 Service Unavailable'), makeDef());
      expect(plan.retryRecommended).toBe(true);
    });

    it('classifies rate limits as wait', () => {
      const plan = classifyFailure(new Error('429 Too Many Requests'), makeDef());
      expect(plan.nextAction).toBe('wait');
    });

    it('classifies auth errors as request_human', () => {
      const plan = classifyFailure(new Error('401 Unauthorized'), makeDef());
      expect(plan.nextAction).toBe('request_human');
      expect(plan.humanInterventionRequired).toBe(true);
    });

    it('classifies validation errors as modify_payload', () => {
      const plan = classifyFailure(new Error('Validation failed: missing orderId'), makeDef());
      expect(plan.nextAction).toBe('modify_payload');
    });

    it('classifies not-found as modify_payload', () => {
      const plan = classifyFailure(new Error('404 Not Found'), makeDef());
      expect(plan.nextAction).toBe('modify_payload');
    });

    it('classifies conflicts as abort', () => {
      const plan = classifyFailure(new Error('409 Conflict: already exists'), makeDef());
      expect(plan.nextAction).toBe('abort');
    });

    it('classifies unknown errors as abort with human required', () => {
      const plan = classifyFailure(new Error('something completely unexpected'), makeDef());
      expect(plan.nextAction).toBe('abort');
      expect(plan.humanInterventionRequired).toBe(true);
    });

    it('respects safeToRetry=false — overrides retry to request_human', () => {
      const plan = classifyFailure(
        new Error('ECONNREFUSED'),
        makeDef({ safeToRetry: false }),
      );
      expect(plan.nextAction).toBe('request_human');
      expect(plan.retryRecommended).toBe(false);
      expect(plan.humanInterventionRequired).toBe(true);
    });

    it('includes retryDelayMs when retry is recommended', () => {
      const plan = classifyFailure(new Error('ECONNRESET'), makeDef());
      expect(plan.retryDelayMs).toBe(5000); // DEFAULT_RETRY_POLICY delay
    });

    it('omits retryDelayMs when retry is not recommended', () => {
      const plan = classifyFailure(new Error('401 Unauthorized'), makeDef());
      expect(plan.retryDelayMs).toBeUndefined();
    });

    it('extracts error code as reasonCode', () => {
      const plan = classifyFailure(new Error('[HTTPORDER_800] Login failed'), makeDef());
      expect(plan.reasonCode).toBe('HTTPORDER_800');
    });

    it('handles non-Error values', () => {
      const plan = classifyFailure('string error', makeDef());
      expect(plan.reasonCode).toBeTruthy();
    });

    it('handles null/undefined error', () => {
      const plan = classifyFailure(null, makeDef());
      expect(plan.reasonCode).toBeTruthy();
    });

    it('every plan has all required fields', () => {
      const errors = [
        new Error('ECONNREFUSED'),
        new Error('401 Unauthorized'),
        new Error('Validation failed'),
        new Error('409 Conflict'),
        new Error('unknown'),
        null,
      ];

      for (const err of errors) {
        const plan = classifyFailure(err, makeDef());
        expect(typeof plan.recoverable).toBe('boolean');
        expect(typeof plan.retryRecommended).toBe('boolean');
        expect(typeof plan.humanInterventionRequired).toBe('boolean');
        expect(plan.nextAction).toBeTruthy();
        expect(plan.reasonCode).toBeTruthy();
      }
    });
  });

  describe('isValidRecoveryPlan', () => {
    it('accepts a valid plan', () => {
      const plan: RecoveryPlan = {
        recoverable: true,
        retryRecommended: true,
        nextAction: 'retry',
        humanInterventionRequired: false,
        reasonCode: 'ECONNREFUSED',
      };
      expect(isValidRecoveryPlan(plan)).toBe(true);
    });

    it('rejects null', () => expect(isValidRecoveryPlan(null)).toBe(false));
    it('rejects string', () => expect(isValidRecoveryPlan('error')).toBe(false));
    it('rejects empty object', () => expect(isValidRecoveryPlan({})).toBe(false));

    it('rejects missing recoverable', () => {
      expect(isValidRecoveryPlan({
        retryRecommended: true, nextAction: 'retry',
        humanInterventionRequired: false, reasonCode: 'X',
      })).toBe(false);
    });

    it('rejects invalid nextAction', () => {
      expect(isValidRecoveryPlan({
        recoverable: true, retryRecommended: true, nextAction: 'explode',
        humanInterventionRequired: false, reasonCode: 'X',
      })).toBe(false);
    });

    it('rejects empty reasonCode', () => {
      expect(isValidRecoveryPlan({
        recoverable: true, retryRecommended: true, nextAction: 'retry',
        humanInterventionRequired: false, reasonCode: '',
      })).toBe(false);
    });
  });
});
