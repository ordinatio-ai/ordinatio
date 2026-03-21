// ===========================================
// ORDINATIO JOBS v2.0 — DAG Type System
// ===========================================
// Directed acyclic graph for automation
// execution. Replaces sequential action chains
// with branches, parallels, waits, approvals,
// fallbacks, and merge points.
// ===========================================

import type { RecoveryPlan } from '../types';

// ---- Node Types ----

/**
 * Every node in the execution DAG is one of these types.
 */
export type DagNodeType =
  | 'action'           // Execute an automation action
  | 'condition'        // Branch based on evaluation (if/else)
  | 'parallel_fork'    // Split into parallel branches
  | 'parallel_join'    // Wait for branches to converge
  | 'wait'             // Pause until event or condition met
  | 'approval'         // Human approval checkpoint
  | 'transform'        // Map/filter data between actions
  | 'terminal';        // Explicit end node (success or failure)

/**
 * A node in the execution DAG.
 */
export interface DagNode {
  /** Unique node identifier within this DAG. */
  id: string;
  /** What kind of node this is. */
  type: DagNodeType;
  /** Human-readable label (for display and agent understanding). */
  label: string;

  /** For 'action' nodes: the automation action to execute. */
  action?: DagActionConfig;

  /** For 'condition' nodes: the branching logic. */
  condition?: DagConditionConfig;

  /** For 'parallel_join' nodes: convergence strategy. */
  join?: DagJoinConfig;

  /** For 'wait' nodes: what we're waiting for. */
  wait?: DagWaitConfig;

  /** For 'approval' nodes: who needs to approve. */
  approval?: DagApprovalConfig;

  /** For 'transform' nodes: data mapping. */
  transform?: DagTransformConfig;

  /** For 'terminal' nodes: success or failure outcome. */
  terminal?: DagTerminalConfig;

  /** Recovery plan if THIS node fails (overrides automation-level). */
  recovery?: RecoveryPlan;

  /** Risk level for this specific node (overrides automation-level). */
  riskLevel?: 'low' | 'medium' | 'high' | 'critical';

  /** Timeout for this node in milliseconds (0 = no timeout). */
  timeoutMs?: number;

  /** Maximum retries for this node (0 = no retry). */
  maxRetries?: number;
}

/** Configuration for an action node. */
export interface DagActionConfig {
  /** The automation action type (e.g., 'CREATE_CONTACT', 'SEND_EMAIL'). */
  actionType: string;
  /** Action configuration (template variables resolved at runtime). */
  config: Record<string, unknown>;
  /** Whether to continue the DAG if this action fails. */
  continueOnError: boolean;
}

/** Configuration for a condition node. */
export interface DagConditionConfig {
  /** Field to evaluate (dot-notation path into the data context). */
  field: string;
  /** Comparison operator. */
  comparator: string;
  /** Value to compare against. */
  value: string;
  /** Value type for coercion. */
  valueType?: string;
}

/** Configuration for a parallel join node. */
export interface DagJoinConfig {
  /** How many branches must complete before proceeding. */
  strategy: 'all' | 'any' | 'n_of_m';
  /** For 'n_of_m': how many branches are required. */
  n?: number;
}

/** Configuration for a wait node. */
export interface DagWaitConfig {
  /** Wait for an external event type. */
  awaitEvent?: string;
  /** Wait for a condition to become true. */
  awaitCondition?: {
    field: string;
    comparator: string;
    value: string;
  };
  /** Maximum wait time before timeout path is taken. */
  timeoutMs: number;
}

/** Configuration for an approval node. */
export interface DagApprovalConfig {
  /** Role that can approve. */
  approverRole?: string;
  /** Specific user who can approve. */
  approverId?: string;
  /** Auto-approve after this timeout (0 = never auto-approve). */
  autoApproveAfterMs?: number;
  /** Description of what is being approved. */
  description?: string;
}

/** Configuration for a transform node. */
export interface DagTransformConfig {
  /** Data mappings: source path → destination path. */
  mappings: Array<{ from: string; to: string }>;
}

/** Configuration for a terminal node. */
export interface DagTerminalConfig {
  /** Whether this terminal represents success or failure. */
  outcome: 'success' | 'failure';
  /** Optional message describing the outcome. */
  message?: string;
}

// ---- Edge Types ----

/**
 * Determines when an edge is followed.
 */
export type DagEdgeType =
  | 'default'              // Normal flow (taken when node succeeds)
  | 'on_success'           // Explicit success path
  | 'on_failure'           // Taken when the source node fails
  | 'on_timeout'           // Wait/approval node timeout path
  | 'on_condition_true'    // Condition node: true branch
  | 'on_condition_false'   // Condition node: false branch
  | 'on_approval'          // Approval node: approved path
  | 'on_denial'            // Approval node: denied path
  | 'retry'                // Retry the source node (with backoff)
  | 'fallback';            // Alternative path when primary fails

/**
 * An edge connecting two nodes in the DAG.
 */
export interface DagEdge {
  /** Unique edge identifier. */
  id: string;
  /** Source node ID. */
  from: string;
  /** Target node ID. */
  to: string;
  /** When this edge is followed. */
  type: DagEdgeType;
  /** Human-readable label for the branch (e.g., "existing client", "new lead"). */
  label?: string;
  /** Priority for deterministic ordering when multiple edges of same type leave a node. */
  priority?: number;
}

// ---- DAG Definition ----

/**
 * The complete DAG definition for an automation.
 * A linear action chain is just a DAG with no branches.
 */
export interface AutomationDag {
  /** Entry node ID (where execution starts). */
  entryNodeId: string;
  /** All nodes in the graph. */
  nodes: DagNode[];
  /** All edges connecting nodes. */
  edges: DagEdge[];
}

// ---- Execution State ----

/**
 * Status of a single node during execution.
 */
export type DagNodeStatus =
  | 'pending'
  | 'running'
  | 'completed'
  | 'failed'
  | 'skipped'
  | 'waiting'
  | 'approved'
  | 'denied';

/**
 * Runtime state of a single node.
 */
export interface DagNodeState {
  nodeId: string;
  status: DagNodeStatus;
  startedAt?: Date;
  completedAt?: Date;
  /** Output data from this node (for action/transform nodes). */
  result?: unknown;
  /** Error message if failed. */
  error?: string;
  /** Recovery plan if failed. */
  recovery?: RecoveryPlan;
  /** How many times this node has been retried. */
  retryCount: number;
}

/**
 * Overall status of a DAG execution.
 */
export type DagExecutionStatus =
  | 'running'
  | 'waiting'
  | 'completed'
  | 'failed'
  | 'paused';

/**
 * Full runtime state of a DAG execution.
 */
export interface DagExecutionState {
  /** Execution identifier. */
  executionId: string;
  /** Current status of each node. */
  nodeStates: Map<string, DagNodeState>;
  /** Accumulated data context (trigger data + action outputs). */
  dataContext: Record<string, unknown>;
  /** Nodes currently in wait state. */
  waitingNodes: Set<string>;
  /** Parallel branches in progress: joinNodeId → active branch node IDs. */
  activeBranches: Map<string, Set<string>>;
  /** Overall execution status. */
  status: DagExecutionStatus;
  /** When execution started. */
  startedAt: Date;
  /** Execution log entries. */
  log: DagLogEntry[];
}

/** A log entry during DAG execution. */
export interface DagLogEntry {
  timestamp: Date;
  nodeId: string;
  phase: 'enter' | 'execute' | 'branch' | 'wait' | 'approve' | 'complete' | 'fail' | 'skip' | 'retry';
  message: string;
  data?: Record<string, unknown>;
}

// ---- Execution Result ----

/**
 * The final result of a DAG execution.
 */
export interface DagExecutionResult {
  /** Overall outcome. */
  status: 'completed' | 'failed' | 'waiting' | 'paused';
  /** Per-node results. */
  nodeResults: DagNodeState[];
  /** How many nodes were executed. */
  nodesExecuted: number;
  /** How many actions completed successfully. */
  actionsCompleted: number;
  /** How many actions failed. */
  actionsFailed: number;
  /** How many nodes were skipped. */
  nodesSkipped: number;
  /** Total execution time in milliseconds. */
  durationMs: number;
  /** Accumulated data context at end of execution. */
  finalContext: Record<string, unknown>;
  /** Execution log. */
  log: DagLogEntry[];
  /** If waiting: continuation token for resume. */
  continuationToken?: DagContinuationToken;
  /** If failed: recovery plan. */
  recovery?: RecoveryPlan;
}

/**
 * Token for resuming a paused/waiting DAG execution.
 */
export interface DagContinuationToken {
  executionId: string;
  /** Node that caused the pause. */
  pausedAtNodeId: string;
  /** Serialized execution state. */
  state: {
    nodeStates: Array<[string, DagNodeState]>;
    dataContext: Record<string, unknown>;
    waitingNodes: string[];
    activeBranches: Array<[string, string[]]>;
    log: DagLogEntry[];
  };
}

// ---- Action Handler Interface ----

/**
 * Function that executes a single action node.
 * The DAG executor calls this for every 'action' node.
 */
export type DagActionHandler = (
  actionType: string,
  config: Record<string, unknown>,
  context: DagActionContext,
) => Promise<DagActionResult>;

/**
 * Context passed to an action handler.
 */
export interface DagActionContext {
  /** Current data context (trigger data + previous outputs). */
  data: Record<string, unknown>;
  /** ID of the node being executed. */
  nodeId: string;
  /** Execution ID. */
  executionId: string;
}

/**
 * Result from an action handler.
 */
export interface DagActionResult {
  success: boolean;
  /** Output data (stored in context for downstream nodes). */
  output?: Record<string, unknown>;
  /** Error message if failed. */
  error?: string;
  /** Recovery plan if failed. */
  recovery?: RecoveryPlan;
}
