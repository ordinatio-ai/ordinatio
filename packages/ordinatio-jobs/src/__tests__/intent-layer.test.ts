import { describe, it, expect } from 'vitest';
import {
  validateIntent,
  evaluateDefinitionOfDone,
  checkFailureBoundary,
  shouldEscalate,
} from '../automation/intent-layer';
import type { AutomationIntent, DoDCheck, FailureBoundary, EscalationPolicy } from '../automation/intent-layer';

function makeIntent(overrides: Partial<AutomationIntent> = {}): AutomationIntent {
  return {
    intent: 'capture_new_lead',
    definitionOfDone: [
      { description: 'Contact exists', verification: { type: 'field_check', field: 'contactId', comparator: 'IS_NOT_EMPTY', value: '' } },
      { description: 'Contact tagged', verification: { type: 'field_check', field: 'tagged', comparator: 'EQUALS', value: 'true' } },
    ],
    acceptablePaths: ['create contact from email', 'link to existing contact if duplicate'],
    failureBoundary: { maxConsecutiveFailures: 3 },
    humanEscalationPolicy: {
      escalateOn: ['repeated_failure', 'intent_unsatisfied'],
      notifyRole: 'admin',
      escalationTimeoutMs: 300000,
      onTimeout: 'pause',
    },
    ...overrides,
  };
}

describe('Intent Layer', () => {

  // ---- Validation ----

  describe('validateIntent', () => {
    it('accepts a complete intent', () => {
      const result = validateIntent(makeIntent());
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('rejects empty intent description', () => {
      const result = validateIntent(makeIntent({ intent: '' }));
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('empty'))).toBe(true);
    });

    it('rejects empty definition of done', () => {
      const result = validateIntent(makeIntent({ definitionOfDone: [] }));
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('no checks'))).toBe(true);
    });

    it('rejects DoD check with no description', () => {
      const result = validateIntent(makeIntent({
        definitionOfDone: [{ description: '', verification: { type: 'field_check', field: 'x', comparator: 'EQUALS', value: '1' } }],
      }));
      expect(result.valid).toBe(false);
    });

    it('rejects empty acceptable paths', () => {
      const result = validateIntent(makeIntent({ acceptablePaths: [] }));
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('guardrails'))).toBe(true);
    });

    it('rejects missing failure boundary', () => {
      const result = validateIntent(makeIntent({ failureBoundary: undefined as any }));
      expect(result.valid).toBe(false);
    });

    it('rejects zero maxConsecutiveFailures', () => {
      const result = validateIntent(makeIntent({ failureBoundary: { maxConsecutiveFailures: 0 } }));
      expect(result.valid).toBe(false);
    });

    it('rejects missing escalation policy', () => {
      const result = validateIntent(makeIntent({ humanEscalationPolicy: undefined as any }));
      expect(result.valid).toBe(false);
    });

    it('rejects escalation policy with no triggers', () => {
      const result = validateIntent(makeIntent({
        humanEscalationPolicy: { escalateOn: [], onTimeout: 'pause' },
      }));
      expect(result.valid).toBe(false);
    });
  });

  // ---- Definition of Done Evaluation ----

  describe('evaluateDefinitionOfDone', () => {
    it('all checks pass → satisfied', () => {
      const checks: DoDCheck[] = [
        { description: 'Contact exists', verification: { type: 'field_check', field: 'contactId', comparator: 'IS_NOT_EMPTY', value: '' } },
        { description: 'Status correct', verification: { type: 'field_check', field: 'status', comparator: 'EQUALS', value: 'active' } },
      ];

      const result = evaluateDefinitionOfDone(checks, { contactId: 'c-123', status: 'active' });
      expect(result.satisfied).toBe(true);
      expect(result.satisfiedCount).toBe(2);
      expect(result.totalChecks).toBe(2);
    });

    it('one check fails → not satisfied', () => {
      const checks: DoDCheck[] = [
        { description: 'Contact exists', verification: { type: 'field_check', field: 'contactId', comparator: 'IS_NOT_EMPTY', value: '' } },
        { description: 'Tagged', verification: { type: 'field_check', field: 'tagged', comparator: 'EQUALS', value: 'true' } },
      ];

      const result = evaluateDefinitionOfDone(checks, { contactId: 'c-123', tagged: 'false' });
      expect(result.satisfied).toBe(false);
      expect(result.satisfiedCount).toBe(1);
      expect(result.checks[1].passed).toBe(false);
      expect(result.checks[1].reason).toContain('tagged');
    });

    it('supports record_exists via checker callback', () => {
      const checks: DoDCheck[] = [
        { description: 'Contact in DB', verification: { type: 'record_exists', table: 'contacts', where: { email: 'a@b.com' } } },
      ];

      const result = evaluateDefinitionOfDone(checks, {}, {
        recordExists: (table, where) => table === 'contacts' && where.email === 'a@b.com',
      });
      expect(result.satisfied).toBe(true);
    });

    it('record_exists fails without checker', () => {
      const checks: DoDCheck[] = [
        { description: 'Contact in DB', verification: { type: 'record_exists', table: 'contacts', where: { email: 'a@b.com' } } },
      ];

      const result = evaluateDefinitionOfDone(checks, {});
      expect(result.satisfied).toBe(false);
      expect(result.checks[0].reason).toContain('No record_exists checker');
    });

    it('supports count_check via checker callback', () => {
      const checks: DoDCheck[] = [
        { description: 'Has tags', verification: { type: 'count_check', table: 'tags', where: { contactId: 'c-1' }, comparator: 'gte', value: 1 } },
      ];

      const result = evaluateDefinitionOfDone(checks, {}, {
        countCheck: () => 3,
      });
      expect(result.satisfied).toBe(true);
    });

    it('supports custom check via checker callback', () => {
      const checks: DoDCheck[] = [
        { description: 'Custom verify', verification: { type: 'custom', checkId: 'my_check', params: { x: 1 } } },
      ];

      const result = evaluateDefinitionOfDone(checks, {}, {
        custom: (checkId, params) => checkId === 'my_check' && (params as any)?.x === 1,
      });
      expect(result.satisfied).toBe(true);
    });

    it('supports nested field access', () => {
      const checks: DoDCheck[] = [
        { description: 'Order placed', verification: { type: 'field_check', field: 'order.status', comparator: 'EQUALS', value: 'PLACED' } },
      ];

      const result = evaluateDefinitionOfDone(checks, { order: { status: 'PLACED' } });
      expect(result.satisfied).toBe(true);
    });

    it('empty checks → satisfied (vacuously true)', () => {
      const result = evaluateDefinitionOfDone([], {});
      expect(result.satisfied).toBe(true);
      expect(result.totalChecks).toBe(0);
    });
  });

  // ---- Failure Boundary ----

  describe('checkFailureBoundary', () => {
    const boundary: FailureBoundary = {
      maxConsecutiveFailures: 3,
      maxFailuresPerWindow: { count: 5, windowMs: 3600000 },
      fatalPatterns: ['PERMANENT_ERROR', 'DATA_CORRUPTED'],
    };

    it('not breached when under limits', () => {
      const result = checkFailureBoundary(boundary, 1);
      expect(result.breached).toBe(false);
    });

    it('breached on consecutive failures', () => {
      const result = checkFailureBoundary(boundary, 3);
      expect(result.breached).toBe(true);
      expect(result.reason).toContain('consecutive');
    });

    it('breached on windowed failures', () => {
      const result = checkFailureBoundary(boundary, 0, { count: 5, windowMs: 3600000 });
      expect(result.breached).toBe(true);
      expect(result.reason).toContain('window');
    });

    it('fatal pattern triggers immediate breach', () => {
      const result = checkFailureBoundary(boundary, 0, undefined, 'PERMANENT_ERROR occurred');
      expect(result.breached).toBe(true);
      expect(result.isFatal).toBe(true);
    });

    it('non-matching error does not trigger fatal', () => {
      const result = checkFailureBoundary(boundary, 0, undefined, 'Connection timeout');
      expect(result.breached).toBe(false);
    });

    it('works with no optional fields', () => {
      const simple: FailureBoundary = { maxConsecutiveFailures: 5 };
      expect(checkFailureBoundary(simple, 4).breached).toBe(false);
      expect(checkFailureBoundary(simple, 5).breached).toBe(true);
    });
  });

  // ---- Escalation ----

  describe('shouldEscalate', () => {
    const policy: EscalationPolicy = {
      escalateOn: ['high_risk_action', 'repeated_failure', 'intent_unsatisfied'],
      onTimeout: 'pause',
    };

    it('escalates on high risk action', () => {
      expect(shouldEscalate(policy, { hasHighRiskAction: true })).toBe(true);
    });

    it('escalates on repeated failure (2+)', () => {
      expect(shouldEscalate(policy, { consecutiveFailures: 2 })).toBe(true);
    });

    it('does not escalate on single failure', () => {
      expect(shouldEscalate(policy, { consecutiveFailures: 1 })).toBe(false);
    });

    it('escalates when intent unsatisfied', () => {
      expect(shouldEscalate(policy, { intentSatisfied: false })).toBe(true);
    });

    it('does not escalate when intent satisfied', () => {
      expect(shouldEscalate(policy, { intentSatisfied: true })).toBe(false);
    });

    it('does not escalate when no conditions met', () => {
      expect(shouldEscalate(policy, {})).toBe(false);
    });

    it('escalates on approval timeout if in policy', () => {
      const withApproval: EscalationPolicy = { escalateOn: ['approval_timeout'], onTimeout: 'abort' };
      expect(shouldEscalate(withApproval, { approvalTimedOut: true })).toBe(true);
    });

    it('escalates on unknown state if in policy', () => {
      const withUnknown: EscalationPolicy = { escalateOn: ['unknown_state'], onTimeout: 'pause' };
      expect(shouldEscalate(withUnknown, { isUnknownState: true })).toBe(true);
    });

    it('escalates on trust insufficient if in policy', () => {
      const withTrust: EscalationPolicy = { escalateOn: ['trust_insufficient'], onTimeout: 'pause' };
      expect(shouldEscalate(withTrust, { trustInsufficient: true })).toBe(true);
    });
  });
});
