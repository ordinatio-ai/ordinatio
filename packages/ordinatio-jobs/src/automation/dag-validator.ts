// ===========================================
// ORDINATIO JOBS v2.0 — DAG Validator
// ===========================================
// Validates DAG structure before execution.
// Detects cycles, orphans, missing edges,
// and invalid node configurations.
// ===========================================

import type { AutomationDag, DagNode, DagEdge } from './dag-types';

/** Result of DAG validation. */
export interface DagValidation {
  valid: boolean;
  errors: DagValidationError[];
  warnings: DagValidationWarning[];
  stats: {
    nodeCount: number;
    edgeCount: number;
    actionNodeCount: number;
    terminalNodeCount: number;
    maxDepth: number;
    hasParallel: boolean;
    hasWaitStates: boolean;
    hasApprovals: boolean;
  };
}

export interface DagValidationError {
  code: string;
  message: string;
  nodeId?: string;
  edgeId?: string;
}

export interface DagValidationWarning {
  code: string;
  message: string;
  nodeId?: string;
}

/**
 * Validate a DAG definition.
 * Returns errors (blocks execution) and warnings (advisory).
 */
export function validateDag(dag: AutomationDag): DagValidation {
  const errors: DagValidationError[] = [];
  const warnings: DagValidationWarning[] = [];

  const nodeMap = new Map(dag.nodes.map(n => [n.id, n]));
  const nodeIds = new Set(dag.nodes.map(n => n.id));

  if (dag.nodes.length === 0) {
    return buildResult([{ code: 'DAG_EMPTY', message: 'DAG has no nodes' }], warnings, dag);
  }

  if (!nodeMap.has(dag.entryNodeId)) {
    errors.push({ code: 'DAG_ENTRY_MISSING', message: `Entry node "${dag.entryNodeId}" does not exist` });
  }

  if (nodeIds.size !== dag.nodes.length) {
    errors.push({ code: 'DAG_DUPLICATE_NODE', message: 'Duplicate node IDs detected' });
  }

  const edgeIds = new Set<string>();
  for (const edge of dag.edges) {
    if (edgeIds.has(edge.id)) {
      errors.push({ code: 'DAG_DUPLICATE_EDGE', message: `Duplicate edge ID: "${edge.id}"`, edgeId: edge.id });
      continue;
    }
    edgeIds.add(edge.id);

    if (!nodeIds.has(edge.from)) {
      errors.push({ code: 'DAG_EDGE_SOURCE_MISSING', message: `Edge "${edge.id}" references unknown source node "${edge.from}"`, edgeId: edge.id });
    }
    if (!nodeIds.has(edge.to)) {
      errors.push({ code: 'DAG_EDGE_TARGET_MISSING', message: `Edge "${edge.id}" references unknown target node "${edge.to}"`, edgeId: edge.id });
    }
    if (edge.from === edge.to) {
      errors.push({ code: 'DAG_SELF_LOOP', message: `Edge "${edge.id}" is a self-loop on node "${edge.from}"`, edgeId: edge.id });
    }
  }

  const cycle = detectCycle(dag);
  if (cycle) {
    errors.push({ code: 'DAG_CYCLE', message: `Cycle detected: ${cycle.join(' → ')}` });
  }

  return buildResult(errors, warnings, dag);
}
