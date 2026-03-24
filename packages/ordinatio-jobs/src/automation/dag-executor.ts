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
    if (!node) continue;

    const nodeState = state.nodeStates.get(nodeId);
    if (!nodeState) continue;

    if (isNodeCompleted(nodeState)) continue;

    initiateNodeExecution(nodeState, nodeId, state, node);

    try {
      const nextEdgeTypes = await executeNode(node, state, actionHandler);
      processNodeExecutionOutcome(nextEdgeTypes, node, state, outEdges, nodeMap, queue);
    } catch (error) {
      handleExecutionError(nodeState, error, state, nodeId);
    }
  }
}

function isNodeCompleted(nodeState: DagNodeState): boolean {
  return ['completed', 'failed', 'skipped'].includes(nodeState.status);
}

function initiateNodeExecution(nodeState: DagNodeState, nodeId: string, state: DagExecutionState, node: DagNode) {
  nodeState.status = 'running';
  nodeState.startedAt = new Date();
  addLog(state, nodeId, 'enter', `Executing ${node.type} node: ${node.label}`);
}

function processNodeExecutionOutcome(
  nextEdgeTypes: DagEdgeType[],
  node: DagNode,
  state: DagExecutionState,
  outEdges: Map<string, DagEdge[]>,
  nodeMap: Map<string, DagNode>,
  queue: string[]
) {
  addEdgeNodesToQueue(nextEdgeTypes, node, state, outEdges, nodeMap, queue);
}

function handleExecutionError(nodeState: DagNodeState, error: unknown, state: DagExecutionState, nodeId: string) {
  nodeState.status = 'failed';
  nodeState.endedAt = new Date();
  addLog(state, nodeId, 'exit', `Node failed: ${error}`);
}

function addEdgeNodesToQueue(
  nextEdgeTypes: DagEdgeType[],
  node: DagNode,
  state: DagExecutionState,
  outEdges: Map<string, DagEdge[]>,
  nodeMap: Map<string, DagNode>,
  queue: string[]
) {
  for (const edge of outEdges.get(node.id) || []) {
    if (nextEdgeTypes.includes(edge.type) && !state.nodeStates.get(edge.to)?.status) {
      queue.push(edge.to);
    }
  }
}