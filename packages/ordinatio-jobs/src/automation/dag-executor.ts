// ===========================================
// ORDINATIO JOBS v2.0 — DAG Executor
// ===========================================
// Pure execution engine for automation DAGs.
// Takes a graph + action handlers + data,
// returns a result. No database. No side
// effects in the engine itself.
// ===========================================

import type {
  AutomationDag,
  DagNode,
  DagEdge,
  DagEdgeType,
  DagNodeState,
  DagNodeStatus,
  DagExecutionState,
  DagExecutionResult,
  DagLogEntry,
  DagActionHandler,
  DagActionContext,
  DagContinuationToken,
} from './dag-types';
import type { RecoveryPlan } from '../types';
import { classifyFailure } from '../recovery';

/**
 * Execute a DAG from the entry node.
 *
 * Pure function — takes the DAG definition, an action handler,
 * and initial data context. Returns the execution result.
 * No database, no Redis, no side effects in the engine.
 */
export async function executeDag(
  dag: AutomationDag,
  actionHandler: DagActionHandler,
  initialContext: Record<string, unknown>,
  options?: {
    executionId?: string;
    /** Resume from a continuation token (for wait/approval). */
    continuationToken?: DagContinuationToken;
  },
): Promise<DagExecutionResult> {
  const startTime = Date.now();
  const executionId = options?.executionId ?? `dag-${Date.now()}`;

  // Initialize or restore state
  const state: DagExecutionState = options?.continuationToken
    ? restoreState(options.continuationToken, initialContext)
    : initializeState(dag, executionId, initialContext);

  // Build adjacency for fast lookups
  const outEdges = buildOutEdges(dag);
  const nodeMap = new Map(dag.nodes.map(n => [n.id, n]));

  // Find the starting node(s)
  const startNodes = options?.continuationToken
    ? getResumableNodes(state)
    : [dag.entryNodeId];

  // Execute
  await executeNodes(startNodes, dag, nodeMap, outEdges, state, actionHandler);

  return buildResult(state, startTime);
}

// ---- Core execution loop ----

async function executeNodes(
  nodeIds: string[],
  dag: AutomationDag,
  nodeMap: Map<string, DagNode>,
  outEdges: Map<string, DagEdge[]>,
  state: DagExecutionState,
  actionHandler: DagActionHandler,
): Promise<void> {
  const queue = [...nodeIds];

  while (queue.length > 0) {
    const nodeId = queue.shift()!;
    const node = nodeMap.get(nodeId);
    if (!node) {
      continue;
    }

    const nodeState = state.nodeStates.get(nodeId);
    if (!nodeState) {
      continue;
    }

    // Skip if already completed/failed/skipped
    if (['completed', 'failed', 'skipped'].includes(nodeState.status)) {
      continue;
    }

    // Mark as running
    nodeState.status = 'running';
    nodeState.startedAt = new Date();
    addLog(state, nodeId, 'enter', `Executing ${node.type} node: ${node.label}`);

    // Execute based on node type
    let nextEdgeTypes: DagEdgeType[];
    try {
      nextEdgeTypes = await executeNode(node, state, actionHandler);
    } catch (error) {
      // Unexpected error — mark failed
      nodeState.status = 'failed';
      nodeState.error = error;
      addLog(state, nodeId, 'error', `Execution error in ${node.type} node: ${node.label}`);
      queue.unshift(...handleFailure(node, state, dag, outEdges.get(nodeId) || []));
      continue;
    }

    // Determine the next nodes to execute
    for (const edgeType of nextEdgeTypes) {
      const edges = outEdges.get(nodeId) || [];
      for (const edge of edges) {
        if (edge.type === edgeType) {
          const targetNodeState = state.nodeStates.get(edge.target);
          if (targetNodeState && targetNodeState.status === 'waiting') {
            queue.push(edge.target);
          }
        }
      }
    }

    // Mark node as completed
    nodeState.status = 'completed';
    nodeState.completedAt = new Date();
    addLog(state, nodeId, 'exit', `Completed ${node.type} node: ${node.label}`);
  }
}