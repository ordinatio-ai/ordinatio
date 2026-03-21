import { describe, it, expect, vi } from 'vitest';
import { executeDag } from '../automation/dag-executor';
import { dagBuilder, legacyToDAG } from '../automation/dag-builder';
import type { DagActionHandler, AutomationDag } from '../automation/dag-types';

/** Simple handler that succeeds with the actionType as output. */
const successHandler: DagActionHandler = async (actionType, config) => ({
  success: true,
  output: { actionType, ...config },
});

/** Handler that fails with a message. */
const failHandler: DagActionHandler = async (actionType) => ({
  success: false,
  error: `${actionType} failed`,
});

/** Handler that tracks calls for assertion. */
function trackingHandler(): { handler: DagActionHandler; calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    handler: async (actionType, config) => {
      calls.push(actionType);
      return { success: true, output: { actionType } };
    },
  };
}

describe('DAG Executor', () => {

  // ---- Linear execution ----

  describe('linear DAGs', () => {
    it('executes a single action node', async () => {
      const dag = dagBuilder('a')
        .action('a', 'CREATE_CONTACT', { email: 'test@test.com' })
        .terminal('done', 'success')
        .build();

      const result = await executeDag(dag, successHandler, {});
      expect(result.status).toBe('completed');
      expect(result.actionsCompleted).toBe(2); // action + terminal
      expect(result.actionsFailed).toBe(0);
    });

    it('executes actions in order', async () => {
      const { handler, calls } = trackingHandler();
      const dag = dagBuilder('a')
        .action('a', 'STEP_1')
        .action('b', 'STEP_2')
        .action('c', 'STEP_3')
        .terminal('done', 'success')
        .build();

      await executeDag(dag, handler, {});
      expect(calls).toEqual(['STEP_1', 'STEP_2', 'STEP_3']);
    });

    it('passes data context through actions', async () => {
      const handler: DagActionHandler = async (actionType, config, ctx) => {
        if (actionType === 'FIRST') {
          return { success: true, output: { clientId: '123' } };
        }
        // Second action should see first's output
        return { success: true, output: { sawClientId: (ctx.data._lastOutput as any)?.clientId } };
      };

      const dag = dagBuilder('a')
        .action('a', 'FIRST')
        .action('b', 'SECOND')
        .terminal('done', 'success')
        .build();

      const result = await executeDag(dag, handler, { trigger: 'test' });
      expect(result.finalContext._lastOutput).toEqual({ sawClientId: '123' });
    });

    it('executes legacy converted DAG', async () => {
      const { handler, calls } = trackingHandler();
      const dag = legacyToDAG([
        { actionType: 'CREATE_CONTACT', sortOrder: 0, config: {}, continueOnError: false },
        { actionType: 'ADD_TAG', sortOrder: 1, config: {}, continueOnError: false },
      ]);

      const result = await executeDag(dag, handler, {});
      expect(result.status).toBe('completed');
      expect(calls).toEqual(['CREATE_CONTACT', 'ADD_TAG']);
    });
  });

  // ---- Failure handling ----

  describe('failure handling', () => {
    it('stops on action failure when continueOnError is false', async () => {
      const { handler, calls } = trackingHandler();
      const mixedHandler: DagActionHandler = async (actionType, config, ctx) => {
        if (actionType === 'FAIL_ME') return { success: false, error: 'boom' };
        return handler(actionType, config, ctx);
      };

      const dag = dagBuilder('a')
        .action('a', 'OK_FIRST')
        .action('b', 'FAIL_ME')
        .action('c', 'NEVER_REACHED')
        .terminal('done', 'success')
        .build();

      const result = await executeDag(dag, mixedHandler, {});
      expect(result.status).toBe('failed');
      expect(calls).toEqual(['OK_FIRST']);
    });

    it('continues on action failure when continueOnError is true', async () => {
      const { handler, calls } = trackingHandler();
      const mixedHandler: DagActionHandler = async (actionType, config, ctx) => {
        if (actionType === 'FAIL_ME') return { success: false, error: 'boom' };
        return handler(actionType, config, ctx);
      };

      const dag = dagBuilder('a')
        .action('a', 'OK_FIRST')
        .action('b', 'FAIL_ME', {}, { continueOnError: true })
        .action('c', 'STILL_RUNS')
        .terminal('done', 'success')
        .build();

      const result = await executeDag(dag, mixedHandler, {});
      expect(result.status).toBe('completed');
      expect(calls).toEqual(['OK_FIRST', 'STILL_RUNS']);
    });

    it('follows on_failure edge when action fails', async () => {
      const { handler, calls } = trackingHandler();
      const mixedHandler: DagActionHandler = async (actionType, config, ctx) => {
        if (actionType === 'RISKY') return { success: false, error: 'failed' };
        return handler(actionType, config, ctx);
      };

      const dag: AutomationDag = {
        entryNodeId: 'risky',
        nodes: [
          { id: 'risky', type: 'action', label: 'Risky', action: { actionType: 'RISKY', config: {}, continueOnError: false } },
          { id: 'fallback', type: 'action', label: 'Fallback', action: { actionType: 'SAFE_ALTERNATIVE', config: {}, continueOnError: false } },
          { id: 'done', type: 'terminal', label: 'Done', terminal: { outcome: 'success' } },
        ],
        edges: [
          { id: 'e1', from: 'risky', to: 'done', type: 'default' },
          { id: 'e2', from: 'risky', to: 'fallback', type: 'on_failure' },
          { id: 'e3', from: 'fallback', to: 'done', type: 'default' },
        ],
      };

      const result = await executeDag(dag, mixedHandler, {});
      expect(calls).toContain('SAFE_ALTERNATIVE');
      expect(result.status).toBe('completed');
    });

    it('retries node when retry edge exists and maxRetries > 0', async () => {
      let attempts = 0;
      const retryHandler: DagActionHandler = async () => {
        attempts++;
        if (attempts < 3) return { success: false, error: `attempt ${attempts}` };
        return { success: true, output: { attempts } };
      };

      const dag: AutomationDag = {
        entryNodeId: 'retry-me',
        nodes: [
          { id: 'retry-me', type: 'action', label: 'Retry', action: { actionType: 'FLAKY', config: {}, continueOnError: false }, maxRetries: 3 },
          { id: 'done', type: 'terminal', label: 'Done', terminal: { outcome: 'success' } },
        ],
        edges: [
          { id: 'e1', from: 'retry-me', to: 'done', type: 'default' },
          { id: 'e2', from: 'retry-me', to: 'retry-me', type: 'retry' },
        ],
      };

      const result = await executeDag(dag, retryHandler, {});
      expect(result.status).toBe('completed');
      expect(attempts).toBe(3);
    });
  });

  // ---- Condition branching ----

  describe('condition branching', () => {
    it('follows true branch when condition passes', async () => {
      const { handler, calls } = trackingHandler();

      const dag: AutomationDag = {
        entryNodeId: 'check',
        nodes: [
          { id: 'check', type: 'condition', label: 'Is VIP?', condition: { field: 'clientType', comparator: 'EQUALS', value: 'VIP' } },
          { id: 'vip-path', type: 'action', label: 'VIP', action: { actionType: 'VIP_TREATMENT', config: {}, continueOnError: false } },
          { id: 'normal-path', type: 'action', label: 'Normal', action: { actionType: 'STANDARD_TREATMENT', config: {}, continueOnError: false } },
          { id: 'done', type: 'terminal', label: 'Done', terminal: { outcome: 'success' } },
        ],
        edges: [
          { id: 'e1', from: 'check', to: 'vip-path', type: 'on_condition_true' },
          { id: 'e2', from: 'check', to: 'normal-path', type: 'on_condition_false' },
          { id: 'e3', from: 'vip-path', to: 'done', type: 'default' },
          { id: 'e4', from: 'normal-path', to: 'done', type: 'default' },
        ],
      };

      const result = await executeDag(dag, handler, { clientType: 'VIP' });
      expect(calls).toContain('VIP_TREATMENT');
      expect(calls).not.toContain('STANDARD_TREATMENT');
    });

    it('follows false branch when condition fails', async () => {
      const { handler, calls } = trackingHandler();

      const dag: AutomationDag = {
        entryNodeId: 'check',
        nodes: [
          { id: 'check', type: 'condition', label: 'Is VIP?', condition: { field: 'clientType', comparator: 'EQUALS', value: 'VIP' } },
          { id: 'vip', type: 'action', label: 'VIP', action: { actionType: 'VIP_TREATMENT', config: {}, continueOnError: false } },
          { id: 'normal', type: 'action', label: 'Normal', action: { actionType: 'STANDARD_TREATMENT', config: {}, continueOnError: false } },
          { id: 'done', type: 'terminal', label: 'Done', terminal: { outcome: 'success' } },
        ],
        edges: [
          { id: 'e1', from: 'check', to: 'vip', type: 'on_condition_true' },
          { id: 'e2', from: 'check', to: 'normal', type: 'on_condition_false' },
          { id: 'e3', from: 'vip', to: 'done', type: 'default' },
          { id: 'e4', from: 'normal', to: 'done', type: 'default' },
        ],
      };

      const result = await executeDag(dag, handler, { clientType: 'REGULAR' });
      expect(calls).toContain('STANDARD_TREATMENT');
      expect(calls).not.toContain('VIP_TREATMENT');
    });

    it('supports nested dot-notation field access', async () => {
      const { handler, calls } = trackingHandler();
      const dag: AutomationDag = {
        entryNodeId: 'check',
        nodes: [
          { id: 'check', type: 'condition', label: 'Check', condition: { field: 'order.status', comparator: 'EQUALS', value: 'PLACED' } },
          { id: 'yes', type: 'action', label: 'Yes', action: { actionType: 'MATCHED', config: {}, continueOnError: false } },
          { id: 'done', type: 'terminal', label: 'Done', terminal: { outcome: 'success' } },
        ],
        edges: [
          { id: 'e1', from: 'check', to: 'yes', type: 'on_condition_true' },
          { id: 'e2', from: 'yes', to: 'done', type: 'default' },
        ],
      };

      await executeDag(dag, handler, { order: { status: 'PLACED' } });
      expect(calls).toContain('MATCHED');
    });
  });

  // ---- Wait/Approval (pause) ----

  describe('wait and approval nodes', () => {
    it('pauses execution at wait node and returns continuation token', async () => {
      const dag: AutomationDag = {
        entryNodeId: 'action1',
        nodes: [
          { id: 'action1', type: 'action', label: 'First', action: { actionType: 'STEP_1', config: {}, continueOnError: false } },
          { id: 'wait', type: 'wait', label: 'Wait for approval', wait: { timeoutMs: 60000 } },
          { id: 'action2', type: 'action', label: 'After wait', action: { actionType: 'STEP_2', config: {}, continueOnError: false } },
          { id: 'done', type: 'terminal', label: 'Done', terminal: { outcome: 'success' } },
        ],
        edges: [
          { id: 'e1', from: 'action1', to: 'wait', type: 'default' },
          { id: 'e2', from: 'wait', to: 'action2', type: 'default' },
          { id: 'e3', from: 'action2', to: 'done', type: 'default' },
        ],
      };

      const result = await executeDag(dag, successHandler, {});
      expect(result.status).toBe('waiting');
      expect(result.continuationToken).toBeDefined();
      expect(result.continuationToken!.pausedAtNodeId).toBe('wait');
    });

    it('pauses at approval node', async () => {
      const dag: AutomationDag = {
        entryNodeId: 'approve',
        nodes: [
          { id: 'approve', type: 'approval', label: 'Need approval', approval: { approverRole: 'admin' } },
          { id: 'done', type: 'terminal', label: 'Done', terminal: { outcome: 'success' } },
        ],
        edges: [
          { id: 'e1', from: 'approve', to: 'done', type: 'on_approval' },
        ],
      };

      const result = await executeDag(dag, successHandler, {});
      expect(result.status).toBe('waiting');
    });
  });

  // ---- Transform nodes ----

  describe('transform nodes', () => {
    it('maps data between actions', async () => {
      let receivedData: Record<string, unknown> = {};
      const handler: DagActionHandler = async (actionType, config, ctx) => {
        if (actionType === 'FIRST') return { success: true, output: { email: 'a@b.com', fullName: 'John Doe' } };
        receivedData = ctx.data;
        return { success: true };
      };

      const dag: AutomationDag = {
        entryNodeId: 'first',
        nodes: [
          { id: 'first', type: 'action', label: 'Get data', action: { actionType: 'FIRST', config: {}, continueOnError: false } },
          { id: 'xform', type: 'transform', label: 'Map', transform: { mappings: [{ from: 'first.email', to: 'contactEmail' }] } },
          { id: 'second', type: 'action', label: 'Use data', action: { actionType: 'SECOND', config: {}, continueOnError: false } },
          { id: 'done', type: 'terminal', label: 'Done', terminal: { outcome: 'success' } },
        ],
        edges: [
          { id: 'e1', from: 'first', to: 'xform', type: 'default' },
          { id: 'e2', from: 'xform', to: 'second', type: 'default' },
          { id: 'e3', from: 'second', to: 'done', type: 'default' },
        ],
      };

      await executeDag(dag, handler, {});
      expect(receivedData.xform).toBeDefined();
    });
  });

  // ---- Terminal nodes ----

  describe('terminal nodes', () => {
    it('marks execution as completed on success terminal', async () => {
      const dag = dagBuilder('a')
        .action('a', 'DO_THING')
        .terminal('done', 'success', 'All good')
        .build();

      const result = await executeDag(dag, successHandler, {});
      expect(result.status).toBe('completed');
    });

    it('marks execution as failed on failure terminal', async () => {
      const dag = dagBuilder('end')
        .terminal('end', 'failure', 'Intentional failure path')
        .build();

      const result = await executeDag(dag, successHandler, {});
      expect(result.status).toBe('failed');
    });
  });

  // ---- Execution log ----

  describe('execution log', () => {
    it('records log entries for each node', async () => {
      const dag = dagBuilder('a')
        .action('a', 'STEP_1')
        .action('b', 'STEP_2')
        .terminal('done', 'success')
        .build();

      const result = await executeDag(dag, successHandler, {});
      expect(result.log.length).toBeGreaterThan(0);
      expect(result.log.some(e => e.nodeId === 'a' && e.phase === 'enter')).toBe(true);
      expect(result.log.some(e => e.nodeId === 'a' && e.phase === 'complete')).toBe(true);
    });
  });

  // ---- Parallel execution ----

  describe('parallel fork/join', () => {
    it('executes parallel branches and joins', async () => {
      const { handler, calls } = trackingHandler();

      const dag: AutomationDag = {
        entryNodeId: 'fork',
        nodes: [
          { id: 'fork', type: 'parallel_fork', label: 'Fork' },
          { id: 'branch-a', type: 'action', label: 'A', action: { actionType: 'PARALLEL_A', config: {}, continueOnError: false } },
          { id: 'branch-b', type: 'action', label: 'B', action: { actionType: 'PARALLEL_B', config: {}, continueOnError: false } },
          { id: 'join', type: 'parallel_join', label: 'Join', join: { strategy: 'all' } },
          { id: 'after', type: 'action', label: 'After', action: { actionType: 'AFTER_JOIN', config: {}, continueOnError: false } },
          { id: 'done', type: 'terminal', label: 'Done', terminal: { outcome: 'success' } },
        ],
        edges: [
          { id: 'e1', from: 'fork', to: 'branch-a', type: 'default' },
          { id: 'e2', from: 'fork', to: 'branch-b', type: 'default' },
          { id: 'e3', from: 'branch-a', to: 'join', type: 'default' },
          { id: 'e4', from: 'branch-b', to: 'join', type: 'default' },
          { id: 'e5', from: 'join', to: 'after', type: 'default' },
          { id: 'e6', from: 'after', to: 'done', type: 'default' },
        ],
      };

      const result = await executeDag(dag, handler, {});
      expect(result.status).toBe('completed');
      expect(calls).toContain('PARALLEL_A');
      expect(calls).toContain('PARALLEL_B');
      expect(calls).toContain('AFTER_JOIN');
    });
  });

  // ---- Complex scenarios ----

  describe('complex real-world scenarios', () => {
    it('lead capture: check sender → branch → create or link → tag → task', async () => {
      const { handler, calls } = trackingHandler();

      const dag: AutomationDag = {
        entryNodeId: 'check-sender',
        nodes: [
          { id: 'check-sender', type: 'condition', label: 'Existing client?', condition: { field: 'isExistingClient', comparator: 'EQUALS', value: 'true' } },
          { id: 'link-email', type: 'action', label: 'Link', action: { actionType: 'LINK_EMAIL_TO_CLIENT', config: {}, continueOnError: false } },
          { id: 'create-contact', type: 'action', label: 'Create', action: { actionType: 'CREATE_CONTACT', config: {}, continueOnError: false } },
          { id: 'add-tag', type: 'action', label: 'Tag', action: { actionType: 'ADD_TAG_TO_CONTACT', config: {}, continueOnError: false } },
          { id: 'create-task', type: 'action', label: 'Task', action: { actionType: 'CREATE_TASK', config: {}, continueOnError: false } },
          { id: 'done', type: 'terminal', label: 'Done', terminal: { outcome: 'success' } },
        ],
        edges: [
          { id: 'e1', from: 'check-sender', to: 'link-email', type: 'on_condition_true' },
          { id: 'e2', from: 'check-sender', to: 'create-contact', type: 'on_condition_false' },
          { id: 'e3', from: 'link-email', to: 'add-tag', type: 'default' },
          { id: 'e4', from: 'create-contact', to: 'add-tag', type: 'default' },
          { id: 'e5', from: 'add-tag', to: 'create-task', type: 'default' },
          { id: 'e6', from: 'create-task', to: 'done', type: 'default' },
        ],
      };

      // New lead (not existing client)
      const result = await executeDag(dag, handler, { isExistingClient: 'false' });
      expect(result.status).toBe('completed');
      expect(calls).toContain('CREATE_CONTACT');
      expect(calls).not.toContain('LINK_EMAIL_TO_CLIENT');
      expect(calls).toContain('ADD_TAG_TO_CONTACT');
      expect(calls).toContain('CREATE_TASK');
    });
  });
});
