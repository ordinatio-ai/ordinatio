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

  // ---- Structural checks ----

  // Must have at least one node
  if (dag.nodes.length === 0) {
    errors.push({ code: 'DAG_EMPTY', message: 'DAG has no nodes' });
    return buildResult(errors, warnings, dag);
  }

  // Entry node must exist
  if (!nodeMap.has(dag.entryNodeId)) {
    errors.push({ code: 'DAG_ENTRY_MISSING', message: `Entry node "${dag.entryNodeId}" does not exist` });
  }

  // No duplicate node IDs
  if (nodeIds.size !== dag.nodes.length) {
    errors.push({ code: 'DAG_DUPLICATE_NODE', message: 'Duplicate node IDs detected' });
  }

  // No duplicate edge IDs
  const edgeIds = new Set<string>();
  for (const edge of dag.edges) {
    if (edgeIds.has(edge.id)) {
      errors.push({ code: 'DAG_DUPLICATE_EDGE', message: `Duplicate edge ID: "${edge.id}"`, edgeId: edge.id });
    }
    edgeIds.add(edge.id);
  }

  // ---- Edge validity ----

  for (const edge of dag.edges) {
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

  // ---- Cycle detection (BFS topological sort) ----

  const cycle = detectCycle(dag);
  if (cycle) {
    errors.push({ code: 'DAG_CYCLE', message: `Cycle detected: ${cycle.join(' → ')}` });
  }

  // ---- Reachability ----

  const reachable = getReachableNodes(dag);
  for (const node of dag.nodes) {
    if (!reachable.has(node.id) && node.id !== dag.entryNodeId) {
      warnings.push({ code: 'DAG_ORPHAN', message: `Node "${node.id}" is not reachable from entry`, nodeId: node.id });
    }
  }

  // ---- Terminal node checks ----

  const terminals = dag.nodes.filter(n => n.type === 'terminal');
  if (terminals.length === 0) {
    warnings.push({ code: 'DAG_NO_TERMINAL', message: 'DAG has no terminal nodes — execution may not have a clear end' });
  }

  // ---- Condition node checks ----

  for (const node of dag.nodes.filter(n => n.type === 'condition')) {
    const outEdges = dag.edges.filter(e => e.from === node.id);
    const hasTrue = outEdges.some(e => e.type === 'on_condition_true');
    const hasFalse = outEdges.some(e => e.type === 'on_condition_false');
    if (!hasTrue) {
      errors.push({ code: 'DAG_CONDITION_NO_TRUE', message: `Condition node "${node.id}" has no true branch`, nodeId: node.id });
    }
    if (!hasFalse) {
      warnings.push({ code: 'DAG_CONDITION_NO_FALSE', message: `Condition node "${node.id}" has no false branch — false conditions will dead-end`, nodeId: node.id });
    }
  }

  // ---- Wait node checks ----

  for (const node of dag.nodes.filter(n => n.type === 'wait')) {
    if (!node.wait?.timeoutMs) {
      errors.push({ code: 'DAG_WAIT_NO_TIMEOUT', message: `Wait node "${node.id}" has no timeout — could wait forever`, nodeId: node.id });
    }
    const outEdges = dag.edges.filter(e => e.from === node.id);
    const hasTimeout = outEdges.some(e => e.type === 'on_timeout');
    if (!hasTimeout && node.wait?.timeoutMs) {
      warnings.push({ code: 'DAG_WAIT_NO_TIMEOUT_PATH', message: `Wait node "${node.id}" has timeout but no on_timeout edge`, nodeId: node.id });
    }
  }

  // ---- Approval node checks ----

  for (const node of dag.nodes.filter(n => n.type === 'approval')) {
    const outEdges = dag.edges.filter(e => e.from === node.id);
    const hasApproval = outEdges.some(e => e.type === 'on_approval');
    const hasDenial = outEdges.some(e => e.type === 'on_denial');
    if (!hasApproval) {
      errors.push({ code: 'DAG_APPROVAL_NO_PATH', message: `Approval node "${node.id}" has no approval path`, nodeId: node.id });
    }
    if (!hasDenial) {
      warnings.push({ code: 'DAG_APPROVAL_NO_DENY', message: `Approval node "${node.id}" has no denial path`, nodeId: node.id });
    }
  }

  // ---- Parallel fork/join checks ----

  for (const node of dag.nodes.filter(n => n.type === 'parallel_fork')) {
    const outEdges = dag.edges.filter(e => e.from === node.id);
    if (outEdges.length < 2) {
      warnings.push({ code: 'DAG_FORK_SINGLE', message: `Parallel fork "${node.id}" has fewer than 2 branches`, nodeId: node.id });
    }
  }

  for (const node of dag.nodes.filter(n => n.type === 'parallel_join')) {
    if (!node.join?.strategy) {
      errors.push({ code: 'DAG_JOIN_NO_STRATEGY', message: `Parallel join "${node.id}" has no convergence strategy`, nodeId: node.id });
    }
    if (node.join?.strategy === 'n_of_m' && !node.join?.n) {
      errors.push({ code: 'DAG_JOIN_N_MISSING', message: `Parallel join "${node.id}" uses n_of_m but n is not set`, nodeId: node.id });
    }
  }

  // ---- Action node checks ----

  for (const node of dag.nodes.filter(n => n.type === 'action')) {
    if (!node.action?.actionType) {
      errors.push({ code: 'DAG_ACTION_NO_TYPE', message: `Action node "${node.id}" has no actionType`, nodeId: node.id });
    }
  }

  return buildResult(errors, warnings, dag);
}

// ---- Internal helpers ----

function buildResult(errors: DagValidationError[], warnings: DagValidationWarning[], dag: AutomationDag): DagValidation {
  return {
    valid: errors.length === 0,
    errors,
    warnings,
    stats: {
      nodeCount: dag.nodes.length,
      edgeCount: dag.edges.length,
      actionNodeCount: dag.nodes.filter(n => n.type === 'action').length,
      terminalNodeCount: dag.nodes.filter(n => n.type === 'terminal').length,
      maxDepth: computeMaxDepth(dag),
      hasParallel: dag.nodes.some(n => n.type === 'parallel_fork'),
      hasWaitStates: dag.nodes.some(n => n.type === 'wait'),
      hasApprovals: dag.nodes.some(n => n.type === 'approval'),
    },
  };
}

/**
 * Detect cycles using DFS with coloring.
 * Returns the cycle path if found, null if acyclic.
 */
function detectCycle(dag: AutomationDag): string[] | null {
  const adjacency = new Map<string, string[]>();
  for (const node of dag.nodes) {
    adjacency.set(node.id, []);
  }
  for (const edge of dag.edges) {
    adjacency.get(edge.from)?.push(edge.to);
  }

  const WHITE = 0, GRAY = 1, BLACK = 2;
  const color = new Map<string, number>();
  const parent = new Map<string, string | null>();
  for (const node of dag.nodes) {
    color.set(node.id, WHITE);
    parent.set(node.id, null);
  }

  for (const node of dag.nodes) {
    if (color.get(node.id) === WHITE) {
      const cycle = dfsVisit(node.id, adjacency, color, parent);
      if (cycle) return cycle;
    }
  }
  return null;
}

function dfsVisit(
  u: string,
  adj: Map<string, string[]>,
  color: Map<string, number>,
  parent: Map<string, string | null>,
): string[] | null {
  const GRAY = 1, BLACK = 2;
  color.set(u, GRAY);

  for (const v of adj.get(u) ?? []) {
    if (color.get(v) === GRAY) {
      // Back edge found — reconstruct cycle
      const cycle = [v, u];
      let curr = parent.get(u);
      while (curr && curr !== v) {
        cycle.push(curr);
        curr = parent.get(curr) ?? null;
      }
      cycle.push(v);
      return cycle.reverse();
    }
    if (color.get(v) === 0) { // WHITE
      parent.set(v, u);
      const cycle = dfsVisit(v, adj, color, parent);
      if (cycle) return cycle;
    }
  }

  color.set(u, BLACK);
  return null;
}

/**
 * Get all nodes reachable from the entry node.
 */
function getReachableNodes(dag: AutomationDag): Set<string> {
  const reachable = new Set<string>();
  const adjacency = new Map<string, string[]>();
  for (const node of dag.nodes) {
    adjacency.set(node.id, []);
  }
  for (const edge of dag.edges) {
    adjacency.get(edge.from)?.push(edge.to);
  }

  const queue = [dag.entryNodeId];
  reachable.add(dag.entryNodeId);
  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const neighbor of adjacency.get(current) ?? []) {
      if (!reachable.has(neighbor)) {
        reachable.add(neighbor);
        queue.push(neighbor);
      }
    }
  }
  return reachable;
}

/**
 * Compute the maximum depth (longest path from entry to any terminal).
 */
function computeMaxDepth(dag: AutomationDag): number {
  const adjacency = new Map<string, string[]>();
  for (const node of dag.nodes) {
    adjacency.set(node.id, []);
  }
  for (const edge of dag.edges) {
    adjacency.get(edge.from)?.push(edge.to);
  }

  const depths = new Map<string, number>();
  function getDepth(nodeId: string, visited: Set<string>): number {
    if (depths.has(nodeId)) return depths.get(nodeId)!;
    if (visited.has(nodeId)) return 0; // cycle protection
    visited.add(nodeId);

    const neighbors = adjacency.get(nodeId) ?? [];
    if (neighbors.length === 0) {
      depths.set(nodeId, 0);
      return 0;
    }

    let max = 0;
    for (const neighbor of neighbors) {
      max = Math.max(max, 1 + getDepth(neighbor, visited));
    }
    depths.set(nodeId, max);
    return max;
  }

  return getDepth(dag.entryNodeId, new Set());
}
