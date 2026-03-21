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

    // Skip if already completed/failed/skipped
    if (['completed', 'failed', 'skipped'].includes(nodeState.status)) continue;

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
      nodeState.completedAt = new Date();
      nodeState.error = error instanceof Error ? error.message : String(error);
      addLog(state, nodeId, 'fail', `Node failed: ${nodeState.error}`);

      // Check for retry edge
      const retryEdge = (outEdges.get(nodeId) ?? []).find(e => e.type === 'retry');
      if (retryEdge && nodeState.retryCount < (node.maxRetries ?? 0)) {
        nodeState.retryCount++;
        nodeState.status = 'pending';
        addLog(state, nodeId, 'retry', `Retrying (attempt ${nodeState.retryCount})`);
        queue.push(nodeId);
        continue;
      }

      // Check for failure edge
      const failEdge = (outEdges.get(nodeId) ?? []).find(e => e.type === 'on_failure');
      if (failEdge) {
        addLog(state, nodeId, 'branch', `Following failure path to ${failEdge.to}`);
        queue.push(failEdge.to);
        continue;
      }

      // Check for fallback edge
      const fallbackEdge = (outEdges.get(nodeId) ?? []).find(e => e.type === 'fallback');
      if (fallbackEdge) {
        addLog(state, nodeId, 'branch', `Following fallback path to ${fallbackEdge.to}`);
        queue.push(fallbackEdge.to);
        continue;
      }

      // No recovery path — if continueOnError, keep going with default edges
      if (node.action?.continueOnError) {
        nextEdgeTypes = ['default', 'on_success'];
      } else {
        // DAG fails
        state.status = 'failed';
        return;
      }
    }

    // Follow outgoing edges based on result
    const edges = outEdges.get(nodeId) ?? [];
    const nextNodes = edges
      .filter(e => nextEdgeTypes.includes(e.type))
      .sort((a, b) => (a.priority ?? 0) - (b.priority ?? 0))
      .map(e => e.to);

    for (const nextId of nextNodes) {
      // For parallel_join: check if all required branches are done
      const nextNode = nodeMap.get(nextId);
      if (nextNode?.type === 'parallel_join') {
        if (!isJoinReady(nextNode, state, dag)) {
          continue; // Not all branches complete yet
        }
      }
      queue.push(nextId);
    }

    // Check if we hit a wait/approval state
    if (state.status === 'waiting' || state.status === 'paused') {
      return; // Execution pauses — caller must resume with continuation token
    }
  }

  // If no explicit terminal was reached, check if all reachable nodes are done
  if (state.status === 'running') {
    const allDone = [...state.nodeStates.values()].every(
      ns => ['completed', 'failed', 'skipped', 'pending'].includes(ns.status)
    );
    if (allDone) {
      const anyFailed = [...state.nodeStates.values()].some(ns => ns.status === 'failed');
      state.status = anyFailed ? 'failed' : 'completed';
    }
  }
}

// ---- Node execution by type ----

async function executeNode(
  node: DagNode,
  state: DagExecutionState,
  actionHandler: DagActionHandler,
): Promise<DagEdgeType[]> {
  const nodeState = state.nodeStates.get(node.id)!;

  switch (node.type) {
    case 'action': {
      const result = await actionHandler(
        node.action!.actionType,
        node.action!.config,
        {
          data: { ...state.dataContext },
          nodeId: node.id,
          executionId: state.executionId,
        },
      );

      if (result.success) {
        nodeState.status = 'completed';
        nodeState.completedAt = new Date();
        nodeState.result = result.output;
        if (result.output) {
          state.dataContext[node.id] = result.output;
          state.dataContext['_lastOutput'] = result.output;
        }
        addLog(state, node.id, 'complete', `Action ${node.action!.actionType} completed`);
        return ['default', 'on_success'];
      } else {
        nodeState.status = 'failed';
        nodeState.completedAt = new Date();
        nodeState.error = result.error;
        nodeState.recovery = result.recovery;
        addLog(state, node.id, 'fail', `Action ${node.action!.actionType} failed: ${result.error}`);
        throw new Error(result.error ?? 'Action failed');
      }
    }

    case 'condition': {
      const fieldValue = getNestedValue(state.dataContext, node.condition!.field);
      const conditionMet = evaluateSimpleCondition(
        fieldValue,
        node.condition!.comparator,
        node.condition!.value,
      );
      nodeState.status = 'completed';
      nodeState.completedAt = new Date();
      nodeState.result = { conditionMet };
      addLog(state, node.id, 'branch', `Condition ${node.condition!.field} ${node.condition!.comparator} ${node.condition!.value} → ${conditionMet}`);
      return conditionMet ? ['on_condition_true'] : ['on_condition_false'];
    }

    case 'parallel_fork': {
      nodeState.status = 'completed';
      nodeState.completedAt = new Date();
      addLog(state, node.id, 'branch', 'Forking into parallel branches');
      return ['default', 'on_success'];
    }

    case 'parallel_join': {
      nodeState.status = 'completed';
      nodeState.completedAt = new Date();
      addLog(state, node.id, 'complete', 'All branches converged');
      return ['default', 'on_success'];
    }

    case 'wait': {
      nodeState.status = 'waiting';
      state.waitingNodes.add(node.id);
      state.status = 'waiting';
      addLog(state, node.id, 'wait', `Waiting for ${node.wait?.awaitEvent ?? 'condition'} (timeout: ${node.wait?.timeoutMs}ms)`);
      return []; // Execution pauses
    }

    case 'approval': {
      nodeState.status = 'waiting';
      state.waitingNodes.add(node.id);
      state.status = 'waiting';
      addLog(state, node.id, 'approve', `Awaiting approval from ${node.approval?.approverRole ?? node.approval?.approverId ?? 'any'}`);
      return []; // Execution pauses
    }

    case 'transform': {
      const output: Record<string, unknown> = {};
      for (const mapping of node.transform?.mappings ?? []) {
        output[mapping.to] = getNestedValue(state.dataContext, mapping.from);
      }
      nodeState.status = 'completed';
      nodeState.completedAt = new Date();
      nodeState.result = output;
      state.dataContext[node.id] = output;
      addLog(state, node.id, 'complete', `Transformed ${node.transform?.mappings?.length ?? 0} fields`);
      return ['default', 'on_success'];
    }

    case 'terminal': {
      nodeState.status = 'completed';
      nodeState.completedAt = new Date();
      const outcome = node.terminal?.outcome ?? 'success';
      state.status = outcome === 'success' ? 'completed' : 'failed';
      addLog(state, node.id, 'complete', `Terminal: ${outcome}${node.terminal?.message ? ` — ${node.terminal.message}` : ''}`);
      return [];
    }

    default:
      throw new Error(`Unknown node type: ${node.type}`);
  }
}

// ---- Helpers ----

function initializeState(dag: AutomationDag, executionId: string, context: Record<string, unknown>): DagExecutionState {
  const nodeStates = new Map<string, DagNodeState>();
  for (const node of dag.nodes) {
    nodeStates.set(node.id, {
      nodeId: node.id,
      status: 'pending',
      retryCount: 0,
    });
  }

  return {
    executionId,
    nodeStates,
    dataContext: { ...context },
    waitingNodes: new Set(),
    activeBranches: new Map(),
    status: 'running',
    startedAt: new Date(),
    log: [],
  };
}

function restoreState(token: DagContinuationToken, additionalContext: Record<string, unknown>): DagExecutionState {
  return {
    executionId: token.executionId,
    nodeStates: new Map(token.state.nodeStates),
    dataContext: { ...token.state.dataContext, ...additionalContext },
    waitingNodes: new Set(token.state.waitingNodes),
    activeBranches: new Map(token.state.activeBranches.map(([k, v]) => [k, new Set(v)])),
    status: 'running',
    startedAt: new Date(),
    log: [...token.state.log],
  };
}

function getResumableNodes(state: DagExecutionState): string[] {
  return [...state.waitingNodes];
}

function buildOutEdges(dag: AutomationDag): Map<string, DagEdge[]> {
  const map = new Map<string, DagEdge[]>();
  for (const node of dag.nodes) {
    map.set(node.id, []);
  }
  for (const edge of dag.edges) {
    map.get(edge.from)?.push(edge);
  }
  return map;
}

function isJoinReady(joinNode: DagNode, state: DagExecutionState, dag: AutomationDag): boolean {
  // Find all edges that point TO this join node
  const incomingEdges = dag.edges.filter(e => e.to === joinNode.id);
  const sourceNodes = incomingEdges.map(e => e.from);

  const completedCount = sourceNodes.filter(id => {
    const ns = state.nodeStates.get(id);
    return ns && (ns.status === 'completed' || ns.status === 'failed' || ns.status === 'skipped');
  }).length;

  switch (joinNode.join?.strategy) {
    case 'all':
      return completedCount >= sourceNodes.length;
    case 'any':
      return completedCount >= 1;
    case 'n_of_m':
      return completedCount >= (joinNode.join?.n ?? 1);
    default:
      return completedCount >= sourceNodes.length;
  }
}

function addLog(state: DagExecutionState, nodeId: string, phase: DagLogEntry['phase'], message: string, data?: Record<string, unknown>): void {
  state.log.push({ timestamp: new Date(), nodeId, phase, message, data });
}

function buildResult(state: DagExecutionState, startTime: number): DagExecutionResult {
  const nodeResults = [...state.nodeStates.values()];

  // Build continuation token if waiting
  let continuationToken: DagContinuationToken | undefined;
  if (state.status === 'waiting') {
    continuationToken = {
      executionId: state.executionId,
      pausedAtNodeId: [...state.waitingNodes][0] ?? '',
      state: {
        nodeStates: [...state.nodeStates.entries()],
        dataContext: state.dataContext,
        waitingNodes: [...state.waitingNodes],
        activeBranches: [...state.activeBranches.entries()].map(([k, v]) => [k, [...v]]),
        log: state.log,
      },
    };
  }

  return {
    status: state.status === 'running' ? 'completed' : state.status,
    nodeResults,
    nodesExecuted: nodeResults.filter(n => n.status !== 'pending' && n.status !== 'skipped').length,
    actionsCompleted: nodeResults.filter(n => n.status === 'completed').length,
    actionsFailed: nodeResults.filter(n => n.status === 'failed').length,
    nodesSkipped: nodeResults.filter(n => n.status === 'skipped').length,
    durationMs: Date.now() - startTime,
    finalContext: state.dataContext,
    log: state.log,
    continuationToken,
    recovery: state.status === 'failed'
      ? nodeResults.find(n => n.status === 'failed')?.recovery
      : undefined,
  };
}

/**
 * Get a nested value from an object using dot notation.
 * e.g., getNestedValue({ a: { b: 3 } }, 'a.b') → 3
 */
function getNestedValue(obj: Record<string, unknown>, path: string): unknown {
  const parts = path.split('.');
  let current: unknown = obj;
  for (const part of parts) {
    if (current === null || current === undefined) return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

/**
 * Simple condition evaluation for condition nodes.
 * Supports basic comparators without the full condition-evaluator.
 */
function evaluateSimpleCondition(value: unknown, comparator: string, target: string): boolean {
  const strValue = String(value ?? '');
  const strTarget = target;

  switch (comparator) {
    case 'EQUALS': return strValue === strTarget;
    case 'NOT_EQUALS': return strValue !== strTarget;
    case 'CONTAINS': return strValue.includes(strTarget);
    case 'NOT_CONTAINS': return !strValue.includes(strTarget);
    case 'STARTS_WITH': return strValue.startsWith(strTarget);
    case 'ENDS_WITH': return strValue.endsWith(strTarget);
    case 'IS_EMPTY': return !value || strValue === '';
    case 'IS_NOT_EMPTY': return !!value && strValue !== '';
    case 'GREATER_THAN': return Number(value) > Number(target);
    case 'LESS_THAN': return Number(value) < Number(target);
    case 'IN_LIST': return strTarget.split(',').map(s => s.trim()).includes(strValue);
    case 'NOT_IN_LIST': return !strTarget.split(',').map(s => s.trim()).includes(strValue);
    default: return false;
  }
}
