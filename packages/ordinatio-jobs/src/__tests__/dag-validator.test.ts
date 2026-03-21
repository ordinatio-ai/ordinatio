import { describe, it, expect } from 'vitest';
import { validateDag } from '../automation/dag-validator';
import { dagBuilder, legacyToDAG } from '../automation/dag-builder';
import type { AutomationDag } from '../automation/dag-types';

describe('DAG Validator', () => {
  // ---- Structural ----

  describe('structural validation', () => {
    it('accepts a valid linear DAG', () => {
      const dag = dagBuilder('a')
        .action('a', 'CREATE_CONTACT', { email: 'test@test.com' })
        .terminal('done', 'success')
        .build();
      const result = validateDag(dag);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('rejects empty DAG', () => {
      const dag: AutomationDag = { entryNodeId: 'x', nodes: [], edges: [] };
      expect(validateDag(dag).valid).toBe(false);
      expect(validateDag(dag).errors[0].code).toBe('DAG_EMPTY');
    });

    it('rejects missing entry node', () => {
      const dag: AutomationDag = {
        entryNodeId: 'missing',
        nodes: [{ id: 'a', type: 'terminal', label: 'End', terminal: { outcome: 'success' } }],
        edges: [],
      };
      expect(validateDag(dag).errors.some(e => e.code === 'DAG_ENTRY_MISSING')).toBe(true);
    });

    it('rejects duplicate node IDs', () => {
      const dag: AutomationDag = {
        entryNodeId: 'a',
        nodes: [
          { id: 'a', type: 'action', label: 'A', action: { actionType: 'X', config: {}, continueOnError: false } },
          { id: 'a', type: 'action', label: 'A2', action: { actionType: 'Y', config: {}, continueOnError: false } },
        ],
        edges: [],
      };
      expect(validateDag(dag).errors.some(e => e.code === 'DAG_DUPLICATE_NODE')).toBe(true);
    });

    it('rejects self-loops', () => {
      const dag: AutomationDag = {
        entryNodeId: 'a',
        nodes: [{ id: 'a', type: 'action', label: 'A', action: { actionType: 'X', config: {}, continueOnError: false } }],
        edges: [{ id: 'e1', from: 'a', to: 'a', type: 'default' }],
      };
      expect(validateDag(dag).errors.some(e => e.code === 'DAG_SELF_LOOP')).toBe(true);
    });

    it('rejects edges to nonexistent nodes', () => {
      const dag: AutomationDag = {
        entryNodeId: 'a',
        nodes: [{ id: 'a', type: 'action', label: 'A', action: { actionType: 'X', config: {}, continueOnError: false } }],
        edges: [{ id: 'e1', from: 'a', to: 'ghost', type: 'default' }],
      };
      expect(validateDag(dag).errors.some(e => e.code === 'DAG_EDGE_TARGET_MISSING')).toBe(true);
    });
  });

  // ---- Cycle detection ----

  describe('cycle detection', () => {
    it('detects A → B → A cycle', () => {
      const dag: AutomationDag = {
        entryNodeId: 'a',
        nodes: [
          { id: 'a', type: 'action', label: 'A', action: { actionType: 'X', config: {}, continueOnError: false } },
          { id: 'b', type: 'action', label: 'B', action: { actionType: 'Y', config: {}, continueOnError: false } },
        ],
        edges: [
          { id: 'e1', from: 'a', to: 'b', type: 'default' },
          { id: 'e2', from: 'b', to: 'a', type: 'default' },
        ],
      };
      expect(validateDag(dag).errors.some(e => e.code === 'DAG_CYCLE')).toBe(true);
    });

    it('accepts acyclic diamond graph', () => {
      const dag: AutomationDag = {
        entryNodeId: 'start',
        nodes: [
          { id: 'start', type: 'parallel_fork', label: 'Fork' },
          { id: 'a', type: 'action', label: 'A', action: { actionType: 'X', config: {}, continueOnError: false } },
          { id: 'b', type: 'action', label: 'B', action: { actionType: 'Y', config: {}, continueOnError: false } },
          { id: 'join', type: 'parallel_join', label: 'Join', join: { strategy: 'all' } },
          { id: 'end', type: 'terminal', label: 'Done', terminal: { outcome: 'success' } },
        ],
        edges: [
          { id: 'e1', from: 'start', to: 'a', type: 'default' },
          { id: 'e2', from: 'start', to: 'b', type: 'default' },
          { id: 'e3', from: 'a', to: 'join', type: 'default' },
          { id: 'e4', from: 'b', to: 'join', type: 'default' },
          { id: 'e5', from: 'join', to: 'end', type: 'default' },
        ],
      };
      expect(validateDag(dag).valid).toBe(true);
    });
  });

  // ---- Reachability ----

  describe('reachability', () => {
    it('warns about orphan nodes', () => {
      const dag: AutomationDag = {
        entryNodeId: 'a',
        nodes: [
          { id: 'a', type: 'action', label: 'A', action: { actionType: 'X', config: {}, continueOnError: false } },
          { id: 'orphan', type: 'action', label: 'Orphan', action: { actionType: 'Y', config: {}, continueOnError: false } },
        ],
        edges: [],
      };
      const result = validateDag(dag);
      expect(result.warnings.some(w => w.code === 'DAG_ORPHAN')).toBe(true);
    });
  });

  // ---- Condition nodes ----

  describe('condition nodes', () => {
    it('errors when condition has no true branch', () => {
      const dag: AutomationDag = {
        entryNodeId: 'cond',
        nodes: [
          { id: 'cond', type: 'condition', label: 'Check', condition: { field: 'x', comparator: 'EQUALS', value: '1' } },
          { id: 'end', type: 'terminal', label: 'End', terminal: { outcome: 'success' } },
        ],
        edges: [{ id: 'e1', from: 'cond', to: 'end', type: 'on_condition_false' }],
      };
      expect(validateDag(dag).errors.some(e => e.code === 'DAG_CONDITION_NO_TRUE')).toBe(true);
    });

    it('accepts condition with both branches', () => {
      const dag: AutomationDag = {
        entryNodeId: 'cond',
        nodes: [
          { id: 'cond', type: 'condition', label: 'Check', condition: { field: 'x', comparator: 'EQUALS', value: '1' } },
          { id: 'yes', type: 'terminal', label: 'Yes', terminal: { outcome: 'success' } },
          { id: 'no', type: 'terminal', label: 'No', terminal: { outcome: 'failure' } },
        ],
        edges: [
          { id: 'e1', from: 'cond', to: 'yes', type: 'on_condition_true' },
          { id: 'e2', from: 'cond', to: 'no', type: 'on_condition_false' },
        ],
      };
      expect(validateDag(dag).valid).toBe(true);
    });
  });

  // ---- Wait/Approval nodes ----

  describe('wait and approval nodes', () => {
    it('errors when wait node has no timeout', () => {
      const dag: AutomationDag = {
        entryNodeId: 'w',
        nodes: [{ id: 'w', type: 'wait', label: 'Wait', wait: { timeoutMs: 0 } }],
        edges: [],
      };
      expect(validateDag(dag).errors.some(e => e.code === 'DAG_WAIT_NO_TIMEOUT')).toBe(true);
    });

    it('errors when approval has no approval path', () => {
      const dag: AutomationDag = {
        entryNodeId: 'a',
        nodes: [
          { id: 'a', type: 'approval', label: 'Approve', approval: { approverRole: 'admin' } },
          { id: 'end', type: 'terminal', label: 'End', terminal: { outcome: 'success' } },
        ],
        edges: [{ id: 'e1', from: 'a', to: 'end', type: 'on_denial' }],
      };
      expect(validateDag(dag).errors.some(e => e.code === 'DAG_APPROVAL_NO_PATH')).toBe(true);
    });
  });

  // ---- Join nodes ----

  describe('parallel join nodes', () => {
    it('errors when join has no strategy', () => {
      const dag: AutomationDag = {
        entryNodeId: 'j',
        nodes: [{ id: 'j', type: 'parallel_join', label: 'Join' }],
        edges: [],
      };
      expect(validateDag(dag).errors.some(e => e.code === 'DAG_JOIN_NO_STRATEGY')).toBe(true);
    });

    it('errors when n_of_m has no n', () => {
      const dag: AutomationDag = {
        entryNodeId: 'j',
        nodes: [{ id: 'j', type: 'parallel_join', label: 'Join', join: { strategy: 'n_of_m' } }],
        edges: [],
      };
      expect(validateDag(dag).errors.some(e => e.code === 'DAG_JOIN_N_MISSING')).toBe(true);
    });
  });

  // ---- Action nodes ----

  describe('action nodes', () => {
    it('errors when action has no actionType', () => {
      const dag: AutomationDag = {
        entryNodeId: 'a',
        nodes: [{ id: 'a', type: 'action', label: 'A', action: { actionType: '', config: {}, continueOnError: false } }],
        edges: [],
      };
      expect(validateDag(dag).errors.some(e => e.code === 'DAG_ACTION_NO_TYPE')).toBe(true);
    });
  });

  // ---- Stats ----

  describe('stats', () => {
    it('computes correct stats for complex DAG', () => {
      const dag = dagBuilder('fork')
        .fork('fork')
        .build();
      // Manually add nodes for a richer graph
      dag.nodes.push(
        { id: 'a', type: 'action', label: 'A', action: { actionType: 'X', config: {}, continueOnError: false } },
        { id: 'b', type: 'action', label: 'B', action: { actionType: 'Y', config: {}, continueOnError: false } },
        { id: 'join', type: 'parallel_join', label: 'Join', join: { strategy: 'all' } },
        { id: 'end', type: 'terminal', label: 'End', terminal: { outcome: 'success' } },
      );
      dag.edges.push(
        { id: 'e1', from: 'fork', to: 'a', type: 'default' },
        { id: 'e2', from: 'fork', to: 'b', type: 'default' },
        { id: 'e3', from: 'a', to: 'join', type: 'default' },
        { id: 'e4', from: 'b', to: 'join', type: 'default' },
        { id: 'e5', from: 'join', to: 'end', type: 'default' },
      );

      const result = validateDag(dag);
      expect(result.stats.nodeCount).toBe(5);
      expect(result.stats.actionNodeCount).toBe(2);
      expect(result.stats.terminalNodeCount).toBe(1);
      expect(result.stats.hasParallel).toBe(true);
    });
  });

  // ---- Legacy conversion ----

  describe('legacyToDAG', () => {
    it('converts empty action list to single terminal', () => {
      const dag = legacyToDAG([]);
      expect(dag.nodes).toHaveLength(1);
      expect(dag.nodes[0].type).toBe('terminal');
    });

    it('converts sequential actions to linear DAG', () => {
      const dag = legacyToDAG([
        { actionType: 'CREATE_CONTACT', sortOrder: 0, config: { email: 'a@b.com' }, continueOnError: false },
        { actionType: 'ADD_TAG', sortOrder: 1, config: { tag: 'Lead' }, continueOnError: false },
        { actionType: 'CREATE_TASK', sortOrder: 2, config: { title: 'Follow up' }, continueOnError: true },
      ]);

      expect(dag.nodes.length).toBe(4); // 3 actions + 1 terminal
      expect(dag.edges.length).toBe(3); // action→action→action→terminal
      expect(validateDag(dag).valid).toBe(true);
    });

    it('preserves continueOnError flag', () => {
      const dag = legacyToDAG([
        { actionType: 'X', sortOrder: 0, config: {}, continueOnError: true },
      ]);
      const actionNode = dag.nodes.find(n => n.type === 'action');
      expect(actionNode?.action?.continueOnError).toBe(true);
    });
  });
});
