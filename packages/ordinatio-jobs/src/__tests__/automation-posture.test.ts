import { describe, it, expect } from 'vitest';
import {
  computeAutomationPosture,
  summarizeAutomationPosture,
  automationNeedsAttention,
} from '../automation/automation-posture';
import type { PostureInput } from '../automation/automation-posture';

function makeInput(overrides: Partial<PostureInput> = {}): PostureInput {
  return {
    automationId: 'auto-1',
    automationName: 'Lead Capture',
    isActive: true,
    consecutiveFailures: 0,
    executions24h: { total: 10, completed: 9, failed: 1, skipped: 0, totalDurationMs: 5000 },
    deadLetterCount: 0,
    circuitOpen: false,
    rateLimited: false,
    intentSatisfied: true,
    ...overrides,
  };
}

describe('Automation Posture', () => {

  describe('health assessment', () => {
    it('healthy when no issues', () => {
      const posture = computeAutomationPosture(makeInput());
      expect(posture.health).toBe('healthy');
    });

    it('paused when not active', () => {
      const posture = computeAutomationPosture(makeInput({ isActive: false }));
      expect(posture.health).toBe('paused');
    });

    it('circuit_open when circuit breaker is open', () => {
      const posture = computeAutomationPosture(makeInput({ circuitOpen: true }));
      expect(posture.health).toBe('circuit_open');
    });

    it('rate_limited when rate limited', () => {
      const posture = computeAutomationPosture(makeInput({ rateLimited: true }));
      expect(posture.health).toBe('rate_limited');
    });

    it('backlogged when queue depth > 50', () => {
      const posture = computeAutomationPosture(makeInput({ queueDepth: 75 }));
      expect(posture.health).toBe('backlogged');
    });

    it('failing at 5+ consecutive failures', () => {
      const posture = computeAutomationPosture(makeInput({ consecutiveFailures: 5 }));
      expect(posture.health).toBe('failing');
    });

    it('degraded at 2-4 consecutive failures', () => {
      const posture = computeAutomationPosture(makeInput({ consecutiveFailures: 2 }));
      expect(posture.health).toBe('degraded');
    });

    it('degraded when dead letter count > 0', () => {
      const posture = computeAutomationPosture(makeInput({ deadLetterCount: 3 }));
      expect(posture.health).toBe('degraded');
    });
  });

  describe('recommendations', () => {
    it('recommends investigating failures when failing', () => {
      const posture = computeAutomationPosture(makeInput({ consecutiveFailures: 5 }));
      expect(posture.recommendedAction).toContain('Investigate');
    });

    it('recommends reviewing dead letter when degraded with DLQ', () => {
      const posture = computeAutomationPosture(makeInput({ deadLetterCount: 5 }));
      expect(posture.recommendedAction).toContain('dead letter');
    });

    it('recommends scaling when backlogged', () => {
      const posture = computeAutomationPosture(makeInput({ queueDepth: 100 }));
      expect(posture.recommendedAction).toContain('scaling');
    });

    it('no recommendation when healthy', () => {
      const posture = computeAutomationPosture(makeInput());
      expect(posture.recommendedAction).toBeUndefined();
    });
  });

  describe('plain language summary', () => {
    it('includes automation name and health', () => {
      const posture = computeAutomationPosture(makeInput());
      expect(posture.plainLanguageSummary).toContain('Lead Capture');
      expect(posture.plainLanguageSummary).toContain('healthy');
    });

    it('includes 24h stats', () => {
      const posture = computeAutomationPosture(makeInput());
      expect(posture.plainLanguageSummary).toContain('9 completed');
      expect(posture.plainLanguageSummary).toContain('1 failed');
    });

    it('mentions consecutive failures', () => {
      const posture = computeAutomationPosture(makeInput({ consecutiveFailures: 3 }));
      expect(posture.plainLanguageSummary).toContain('3 consecutive failures');
    });

    it('mentions dead letter queue', () => {
      const posture = computeAutomationPosture(makeInput({ deadLetterCount: 7 }));
      expect(posture.plainLanguageSummary).toContain('7 in dead letter');
    });

    it('warns about unsatisfied intent', () => {
      const posture = computeAutomationPosture(makeInput({ intentSatisfied: false }));
      expect(posture.plainLanguageSummary).toContain('Intent has not been satisfied');
    });

    it('handles zero executions', () => {
      const posture = computeAutomationPosture(makeInput({
        executions24h: { total: 0, completed: 0, failed: 0, skipped: 0, totalDurationMs: 0 },
      }));
      expect(posture.plainLanguageSummary).toContain('No executions');
    });
  });

  describe('stats', () => {
    it('computes average duration', () => {
      const posture = computeAutomationPosture(makeInput({
        executions24h: { total: 4, completed: 4, failed: 0, skipped: 0, totalDurationMs: 2000 },
      }));
      expect(posture.stats24h.avgDurationMs).toBe(500);
    });

    it('handles zero total gracefully', () => {
      const posture = computeAutomationPosture(makeInput({
        executions24h: { total: 0, completed: 0, failed: 0, skipped: 0, totalDurationMs: 0 },
      }));
      expect(posture.stats24h.avgDurationMs).toBe(0);
    });
  });

  describe('hypermedia', () => {
    it('includes pause action when active', () => {
      const posture = computeAutomationPosture(makeInput());
      expect(posture._actions.pause).toBeDefined();
    });

    it('includes reactivate action when paused', () => {
      const posture = computeAutomationPosture(makeInput({ isActive: false }));
      expect(posture._actions.reactivate).toBeDefined();
    });

    it('includes retry_dead_letter when DLQ > 0', () => {
      const posture = computeAutomationPosture(makeInput({ deadLetterCount: 3 }));
      expect(posture._actions.retry_dead_letter).toBeDefined();
    });

    it('includes inspect_failures when failing', () => {
      const posture = computeAutomationPosture(makeInput({ consecutiveFailures: 5 }));
      expect(posture._actions.inspect_failures).toBeDefined();
    });

    it('always includes test and simulate', () => {
      const posture = computeAutomationPosture(makeInput());
      expect(posture._actions.test).toBeDefined();
      expect(posture._actions.simulate).toBeDefined();
    });
  });

  describe('constraints', () => {
    it('lists active constraints', () => {
      const posture = computeAutomationPosture(makeInput({
        isActive: false,
        circuitOpen: true,
        consecutiveFailures: 10,
      }));
      expect(posture._constraints.length).toBeGreaterThan(0);
      expect(posture._constraints.some(c => c.includes('paused'))).toBe(true);
    });

    it('empty constraints when healthy', () => {
      const posture = computeAutomationPosture(makeInput());
      expect(posture._constraints).toEqual([]);
    });
  });

  describe('recovery', () => {
    it('includes recovery plan when failing', () => {
      const posture = computeAutomationPosture(makeInput({ consecutiveFailures: 5 }));
      expect(posture._recovery).toBeDefined();
      expect(posture._recovery!.humanInterventionRequired).toBe(true);
    });

    it('no recovery plan when healthy', () => {
      const posture = computeAutomationPosture(makeInput());
      expect(posture._recovery).toBeUndefined();
    });
  });

  describe('utility functions', () => {
    it('summarizeAutomationPosture returns the summary string', () => {
      const posture = computeAutomationPosture(makeInput());
      expect(summarizeAutomationPosture(posture)).toBe(posture.plainLanguageSummary);
    });

    it('automationNeedsAttention returns true when not healthy', () => {
      expect(automationNeedsAttention(computeAutomationPosture(makeInput()))).toBe(false);
      expect(automationNeedsAttention(computeAutomationPosture(makeInput({ consecutiveFailures: 5 })))).toBe(true);
    });
  });
});
