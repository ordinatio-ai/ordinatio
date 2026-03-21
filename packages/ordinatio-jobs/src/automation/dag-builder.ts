// ===========================================
// ORDINATIO JOBS v2.0 — DAG Builder
// ===========================================
// Fluent API for constructing DAGs + backward
// compatibility converter for legacy sequential
// action chains.
// ===========================================

import type { AutomationDag, DagNode, DagEdge, DagEdgeType } from './dag-types';

/**
 * Fluent builder for constructing automation DAGs.
 *
 * Usage:
 *   const dag = dagBuilder('start')
 *     .action('create-contact', 'CREATE_CONTACT', { email: '{{from}}' })
 *     .action('add-tag', 'ADD_TAG_TO_CONTACT', { tagName: 'Lead' })
 *     .terminal('done', 'success')
 *     .build();
 */
export function dagBuilder(entryNodeId: string): DagBuilderApi {
  const nodes: DagNode[] = [];
  const edges: DagEdge[] = [];
  let edgeCounter = 0;
  let lastNodeId: string | null = null;

  function nextEdgeId(): string {
    return `e-${++edgeCounter}`;
  }

  function autoConnect(nodeId: string, edgeType: DagEdgeType = 'default'): void {
    if (lastNodeId) {
      edges.push({ id: nextEdgeId(), from: lastNodeId, to: nodeId, type: edgeType });
    }
  }

  const api: DagBuilderApi = {
    action(id, actionType, config, options) {
      nodes.push({
        id,
        type: 'action',
        label: options?.label ?? actionType,
        action: {
          actionType,
          config: config ?? {},
          continueOnError: options?.continueOnError ?? false,
        },
        maxRetries: options?.maxRetries,
        riskLevel: options?.riskLevel,
      });
      autoConnect(id);
      lastNodeId = id;
      return api;
    },

    condition(id, field, comparator, value, options) {
      nodes.push({
        id,
        type: 'condition',
        label: options?.label ?? `${field} ${comparator} ${value}`,
        condition: { field, comparator, value },
      });
      autoConnect(id);
      lastNodeId = id;
      return api;
    },

    fork(id, label) {
      nodes.push({ id, type: 'parallel_fork', label: label ?? 'Fork' });
      autoConnect(id);
      lastNodeId = id;
      return api;
    },

    join(id, strategy, options) {
      nodes.push({
        id,
        type: 'parallel_join',
        label: options?.label ?? `Join (${strategy})`,
        join: { strategy, n: options?.n },
      });
      // Don't auto-connect — branches connect manually
      lastNodeId = id;
      return api;
    },

    wait(id, timeoutMs, options) {
      nodes.push({
        id,
        type: 'wait',
        label: options?.label ?? `Wait (${timeoutMs}ms)`,
        wait: {
          timeoutMs,
          awaitEvent: options?.awaitEvent,
          awaitCondition: options?.awaitCondition,
        },
      });
      autoConnect(id);
      lastNodeId = id;
      return api;
    },

    approval(id, options) {
      nodes.push({
        id,
        type: 'approval',
        label: options?.label ?? 'Approval required',
        approval: {
          approverRole: options?.approverRole,
          approverId: options?.approverId,
          autoApproveAfterMs: options?.autoApproveAfterMs,
          description: options?.description,
        },
      });
      autoConnect(id);
      lastNodeId = id;
      return api;
    },

    transform(id, mappings, label) {
      nodes.push({
        id,
        type: 'transform',
        label: label ?? 'Transform',
        transform: { mappings },
      });
      autoConnect(id);
      lastNodeId = id;
      return api;
    },

    terminal(id, outcome, message) {
      nodes.push({
        id,
        type: 'terminal',
        label: message ?? (outcome === 'success' ? 'Success' : 'Failure'),
        terminal: { outcome, message },
      });
      autoConnect(id);
      lastNodeId = id;
      return api;
    },

    edge(from, to, type, label) {
      edges.push({ id: nextEdgeId(), from, to, type: type ?? 'default', label });
      return api;
    },

    build(): AutomationDag {
      return { entryNodeId, nodes, edges };
    },
  };

  return api;
}

export interface DagBuilderApi {
  action(id: string, actionType: string, config?: Record<string, unknown>, options?: {
    label?: string; continueOnError?: boolean; maxRetries?: number; riskLevel?: 'low' | 'medium' | 'high' | 'critical';
  }): DagBuilderApi;

  condition(id: string, field: string, comparator: string, value: string, options?: {
    label?: string;
  }): DagBuilderApi;

  fork(id: string, label?: string): DagBuilderApi;

  join(id: string, strategy: 'all' | 'any' | 'n_of_m', options?: {
    label?: string; n?: number;
  }): DagBuilderApi;

  wait(id: string, timeoutMs: number, options?: {
    label?: string; awaitEvent?: string; awaitCondition?: { field: string; comparator: string; value: string };
  }): DagBuilderApi;

  approval(id: string, options?: {
    label?: string; approverRole?: string; approverId?: string; autoApproveAfterMs?: number; description?: string;
  }): DagBuilderApi;

  transform(id: string, mappings: Array<{ from: string; to: string }>, label?: string): DagBuilderApi;

  terminal(id: string, outcome: 'success' | 'failure', message?: string): DagBuilderApi;

  /** Add a manual edge (for branches, parallels, fallbacks). */
  edge(from: string, to: string, type?: DagEdgeType, label?: string): DagBuilderApi;

  /** Build the final DAG. */
  build(): AutomationDag;
}

/**
 * Convert a legacy sequential action chain to a linear DAG.
 * This provides backward compatibility — old automations run
 * through the DAG executor without migration.
 */
export function legacyToDAG(actions: LegacyAction[]): AutomationDag {
  if (actions.length === 0) {
    return {
      entryNodeId: 'terminal-empty',
      nodes: [{ id: 'terminal-empty', type: 'terminal', label: 'Empty', terminal: { outcome: 'success', message: 'No actions' } }],
      edges: [],
    };
  }

  const sorted = [...actions].sort((a, b) => a.sortOrder - b.sortOrder);
  const builder = dagBuilder(nodeIdFromAction(sorted[0]));

  for (const action of sorted) {
    builder.action(
      nodeIdFromAction(action),
      action.actionType,
      action.config,
      { continueOnError: action.continueOnError, label: action.actionType },
    );
  }

  builder.terminal('terminal-success', 'success', 'All actions completed');

  return builder.build();
}

function nodeIdFromAction(action: LegacyAction): string {
  return `action-${action.sortOrder}`;
}

/** Shape of old sequential actions (from automation-types). */
export interface LegacyAction {
  actionType: string;
  sortOrder: number;
  config: Record<string, unknown>;
  useOutputFrom?: number | null;
  continueOnError: boolean;
}
