import { describe, it, expect } from 'vitest';
import {
  buildExecutionHypermedia,
  buildAutomationHypermedia,
  buildDeadLetterHypermedia,
} from '../automation/hypermedia';
import type { DagExecutionResult } from '../automation/dag-types';

function makeResult(overrides: Partial<DagExecutionResult> = {}): DagExecutionResult {
  return {
    status: 'completed', nodeResults: [], nodesExecuted: 2, actionsCompleted: 2,
    actionsFailed: 0, nodesSkipped: 0, durationMs: 500, finalContext: {}, log: [],
    ...overrides,
  };
}

describe('Automation Hypermedia', () => {
  describe('buildExecutionHypermedia', () => {
    it('completed: includes view_artifact, view_log, rerun', () => {
      const hm = buildExecutionHypermedia(makeResult(), 'auto-1');
      expect(hm._state).toBe('completed');
      expect(hm._actions.view_artifact).toBeDefined();
      expect(hm._actions.view_log).toBeDefined();
      expect(hm._actions.rerun).toBeDefined();
    });

    it('failed: includes view_failures and retry when recommended', () => {
      const hm = buildExecutionHypermedia(makeResult({
        status: 'failed',
        recovery: { recoverable: true, retryRecommended: true, nextAction: 'retry', humanInterventionRequired: false, reasonCode: 'X' },
      }), 'auto-1');
      expect(hm._state).toBe('failed');
      expect(hm._actions.retry).toBeDefined();
      expect(hm._actions.view_failures).toBeDefined();
    });

    it('failed: includes escalate when human needed', () => {
      const hm = buildExecutionHypermedia(makeResult({
        status: 'failed',
        recovery: { recoverable: true, retryRecommended: false, nextAction: 'request_human', humanInterventionRequired: true, reasonCode: 'X' },
      }), 'auto-1');
      expect(hm._actions.escalate).toBeDefined();
      expect(hm._constraints).toContain('Human intervention required before retry');
    });

    it('waiting: includes resume and cancel', () => {
      const hm = buildExecutionHypermedia(makeResult({
        status: 'waiting',
        continuationToken: { executionId: 'e', pausedAtNodeId: 'wait-1', state: { nodeStates: [], dataContext: {}, waitingNodes: ['wait-1'], activeBranches: [], log: [] } },
      }), 'auto-1');
      expect(hm._state).toBe('waiting');
      expect(hm._actions.resume).toBeDefined();
      expect(hm._actions.cancel).toBeDefined();
      expect(hm._constraints.some(c => c.includes('wait-1'))).toBe(true);
    });

    it('includes recovery plan when present', () => {
      const recovery = { recoverable: true, retryRecommended: true, nextAction: 'retry' as const, humanInterventionRequired: false, reasonCode: 'ERR' };
      const hm = buildExecutionHypermedia(makeResult({ status: 'failed', recovery }), 'auto-1');
      expect(hm._recovery).toEqual(recovery);
    });
  });

  describe('buildAutomationHypermedia', () => {
    it('active: includes pause, test, simulate, plan, history, posture, edit', () => {
      const hm = buildAutomationHypermedia('auto-1', true);
      expect(hm._state).toBe('active');
      expect(hm._actions.pause).toBeDefined();
      expect(hm._actions.test).toBeDefined();
      expect(hm._actions.simulate).toBeDefined();
      expect(hm._actions.plan).toBeDefined();
      expect(hm._actions.view_history).toBeDefined();
      expect(hm._actions.view_posture).toBeDefined();
      expect(hm._actions.edit).toBeDefined();
    });

    it('paused: includes reactivate and delete', () => {
      const hm = buildAutomationHypermedia('auto-1', false);
      expect(hm._state).toBe('paused');
      expect(hm._actions.reactivate).toBeDefined();
      expect(hm._actions.delete).toBeDefined();
      expect(hm._constraints).toContain('Automation is paused — will not trigger');
    });
  });

  describe('buildDeadLetterHypermedia', () => {
    it('includes retry, discard, inspect', () => {
      const hm = buildDeadLetterHypermedia('exec-1', 'Connection timeout');
      expect(hm._state).toBe('dead_letter');
      expect(hm._actions.retry).toBeDefined();
      expect(hm._actions.discard).toBeDefined();
      expect(hm._actions.inspect).toBeDefined();
      expect(hm._recovery?.humanInterventionRequired).toBe(true);
    });
  });
});
