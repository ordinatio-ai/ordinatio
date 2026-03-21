// ===========================================
// ORDINATIO JOBS v2.1 — Refinements
// ===========================================
// Six philosophical upgrades that push the
// engine from "executes well" to "explains,
// proves, and constrains deterministically."
// ===========================================

import type { DagExecutionResult, DagLogEntry, DagNodeState } from './dag-types';
import type { DoDResult, DoDCheck } from './intent-layer';
import type { RecoveryPlan } from '../types';

// ====================================================
// 1. SPLIT INTENT: Execution vs Business
// ====================================================

/**
 * What the engine is doing mechanically.
 * Cross-industry standard — same across all apps.
 */
export type ExecutionIntent =
  | 'sync_data'
  | 'send_message'
  | 'place_order'
  | 'generate_report'
  | 'update_state'
  | 'external_api_call'
  | 'provision_resource'
  | 'cleanup'
  | 'compute'
  | 'notify';

/**
 * What the organization is trying to achieve.
 * Domain-specific — unique per business.
 *
 * Two automations may share the same executionIntent (send_message)
 * but have completely different businessIntents (capture_new_lead vs notify_shipping).
 * Agents reason better when these are separated.
 */
export interface DualIntent {
  /** Mechanical purpose — what the engine does. */
  executionIntent: ExecutionIntent;
  /** Business purpose — what the organization achieves. */
  businessIntent: string;
}

// ====================================================
// 2. PROOF ARTIFACTS
// ====================================================

/**
 * Formal receipt proving what happened.
 * Memory artifact = compact reasoning summary (for agents).
 * Proof artifact = auditable evidence (for compliance).
 *
 * Matters for: audits, regulated industries, debugging, enterprise trust.
 */
export interface ProofArtifact {
  artifactType: 'execution_proof';
  executionId: string;
  automationId: string;
  timestamp: Date;

  /** What was supposed to happen (from intent + DoD). */
  expected: {
    executionIntent: ExecutionIntent;
    businessIntent: string;
    definitionOfDone: string[];
  };

  /** What actually happened (from execution result). */
  actual: {
    nodesExecuted: string[];
    actionsCompleted: string[];
    actionsFailed: string[];
    sideEffectsOccurred: string[];
    finalStatus: string;
    durationMs: number;
  };

  /** Evidence that proves it. */
  evidence: ProofEvidence[];

  /** Whether definition-of-done was satisfied. */
  dodSatisfied: boolean;
  dodResults?: DoDResult;

  /** Cryptographic integrity (optional). */
  contentHash?: string;
}

/** A single piece of evidence in a proof artifact. */
export interface ProofEvidence {
  /** What this evidence shows. */
  claim: string;
  /** The data that proves it. */
  data: Record<string, unknown>;
  /** When it was captured. */
  capturedAt: Date;
  /** Source system. */
  source: string;
}

/**
 * Build a proof artifact from an execution result.
 */
export function buildProofArtifact(input: {
  executionId: string;
  automationId: string;
  dualIntent: DualIntent;
  dodChecks: DoDCheck[];
  dodResult: DoDResult;
  dagResult: DagExecutionResult;
  sideEffects: string[];
}): ProofArtifact {
  const { dagResult, dualIntent, dodChecks, dodResult } = input;

  const evidence: ProofEvidence[] = [];

  // Evidence from completed actions
  for (const node of dagResult.nodeResults) {
    if (node.status === 'completed' && node.result) {
      evidence.push({
        claim: `Node ${node.nodeId} completed successfully`,
        data: { result: node.result },
        capturedAt: node.completedAt ?? new Date(),
        source: 'dag_executor',
      });
    }
  }

  // Evidence from DoD checks
  for (const check of dodResult.checks) {
    evidence.push({
      claim: check.description,
      data: { passed: check.passed, reason: check.reason },
      capturedAt: new Date(),
      source: 'dod_evaluator',
    });
  }

  return {
    artifactType: 'execution_proof',
    executionId: input.executionId,
    automationId: input.automationId,
    timestamp: new Date(),
    expected: {
      executionIntent: dualIntent.executionIntent,
      businessIntent: dualIntent.businessIntent,
      definitionOfDone: dodChecks.map(c => c.description),
    },
    actual: {
      nodesExecuted: dagResult.nodeResults.filter(n => n.status !== 'pending' && n.status !== 'skipped').map(n => n.nodeId),
      actionsCompleted: dagResult.nodeResults.filter(n => n.status === 'completed').map(n => n.nodeId),
      actionsFailed: dagResult.nodeResults.filter(n => n.status === 'failed').map(n => n.nodeId),
      sideEffectsOccurred: input.sideEffects,
      finalStatus: dagResult.status,
      durationMs: dagResult.durationMs,
    },
    evidence,
    dodSatisfied: dodResult.satisfied,
    dodResults: dodResult,
  };
}

// ====================================================
// 3. SAFETY CLASSES
// ====================================================

/**
 * Concrete safety classification for every action.
 * More durable than risk levels for policy reasoning.
 * Policy and security modules match on these, not action names.
 */
export type SafetyClass =
  | 'read_only'                   // No mutations at all
  | 'reversible_write'            // Creates/updates that can be undone
  | 'irreversible_write'          // Deletes, status changes that can't be undone
  | 'external_side_effect'        // Calls external APIs (webhooks, third parties)
  | 'money_movement'              // Financial transactions, payments, refunds
  | 'identity_or_permission_change'; // Auth, role changes, access grants

/**
 * Infer safety class from an action type name.
 * Apps can override with explicit declarations.
 */
export function inferSafetyClass(actionType: string): SafetyClass {
  const upper = actionType.toUpperCase();

  if (upper.startsWith('GET_') || upper.startsWith('LIST_') || upper.startsWith('SEARCH_') || upper.startsWith('FIND_')) {
    return 'read_only';
  }
  if (upper.includes('DELETE') || upper.includes('REMOVE') || upper.includes('ARCHIVE')) {
    return 'irreversible_write';
  }
  if (upper.includes('SEND_EMAIL') || upper.includes('REPLY_TO') || upper.includes('FORWARD_')) {
    return 'external_side_effect';
  }
  if (upper === 'CALL_WEBHOOK') {
    return 'external_side_effect';
  }
  if (upper.includes('PAYMENT') || upper.includes('CHARGE') || upper.includes('REFUND') || upper.includes('INVOICE')) {
    return 'money_movement';
  }
  if (upper.includes('ROLE') || upper.includes('PERMISSION') || upper.includes('GRANT') || upper.includes('REVOKE')) {
    return 'identity_or_permission_change';
  }
  if (upper.startsWith('CREATE_') || upper.startsWith('UPDATE_') || upper.includes('ADD_TAG') || upper.includes('ASSIGN')) {
    return 'reversible_write';
  }

  return 'reversible_write'; // Conservative default
}

/**
 * Get all safety classes present in a set of action types.
 */
export function getSafetyClasses(actionTypes: string[]): SafetyClass[] {
  const classes = new Set<SafetyClass>();
  for (const type of actionTypes) {
    classes.add(inferSafetyClass(type));
  }
  return [...classes];
}

// ====================================================
// 4. PAUSED-BY-REASON
// ====================================================

/**
 * Standardized reason WHY execution is paused.
 * Agents, dashboards, and recovery logic all consume this.
 */
export type PauseReason =
  | 'waiting_for_time'            // Delay node — waiting for a scheduled time
  | 'waiting_for_event'           // Wait node — waiting for an external event
  | 'waiting_for_human_approval'  // Approval node — waiting for human
  | 'waiting_for_dependency'      // Job dependency not yet satisfied
  | 'paused_by_policy'            // Policy gate denied execution
  | 'paused_by_quarantine'        // Quarantined due to suspicious behavior
  | 'paused_by_circuit_breaker'   // Circuit breaker is open
  | 'paused_by_rate_limit'        // Rate limit exceeded
  | 'paused_by_user';             // Manually paused by operator

/**
 * Structured pause state with reason and metadata.
 */
export interface PauseState {
  reason: PauseReason;
  /** When the pause started. */
  pausedAt: Date;
  /** When the pause will auto-resolve (if applicable). */
  autoResumeAt?: Date;
  /** Who or what caused the pause. */
  pausedBy: string;
  /** Additional context for the pause. */
  context?: Record<string, unknown>;
}

/**
 * Infer pause reason from execution state.
 */
export function inferPauseReason(nodeType: string, nodeConfig?: Record<string, unknown>): PauseReason {
  switch (nodeType) {
    case 'wait':
      return nodeConfig?.awaitEvent ? 'waiting_for_event' : 'waiting_for_time';
    case 'approval':
      return 'waiting_for_human_approval';
    default:
      return 'paused_by_user';
  }
}

// ====================================================
// 5. CANONICAL EXECUTION PLAN
// ====================================================

/**
 * First-class execution plan object with a stable schema.
 * This is the engine's explainability contract.
 * Enterprise buyers see this as a centerpiece feature.
 */
export interface ExecutionPlan {
  /** Plan version for schema stability. */
  schemaVersion: 'execution-plan-v1';

  /** When this plan was generated. */
  generatedAt: Date;

  // ---- What triggers it ----
  trigger: {
    eventType: string;
    configFilters?: Record<string, unknown>;
  };

  // ---- What the intent is ----
  intent: DualIntent;

  // ---- Conditions evaluated ----
  conditions: {
    evaluated: boolean;
    wouldPass: boolean;
    trace: string[];
  };

  // ---- The execution path ----
  graph: {
    totalNodes: number;
    actionNodes: number;
    chosenBranches: string[];
    rejectedBranches: string[];
    parallelPaths: number;
    waitStates: number;
    approvalPoints: number;
  };

  // ---- Side effects ----
  sideEffects: {
    writes: string[];
    externalCalls: string[];
    irreversible: boolean;
    safetyClasses: SafetyClass[];
  };

  // ---- Approvals ----
  approvals: {
    required: boolean;
    points: string[];
    approverRoles: string[];
  };

  // ---- Trust ----
  trust: {
    requiredTier: number;
    currentTier?: number;
    sufficient: boolean;
  };

  // ---- Recovery ----
  recovery: {
    hasFailureEdges: boolean;
    hasFallbackEdges: boolean;
    hasRetryEdges: boolean;
    maxRetries: number;
    rollbackPossible: boolean;
  };

  // ---- Completion ----
  completion: {
    definitionOfDone: string[];
    estimatedDurationMs: number;
    confidence: number;
  };
}

// ====================================================
// 6. EXPLANATORY LAYER (Decision Journal)
// ====================================================

/**
 * A single decision made during execution.
 * The engine doesn't just execute — it explains.
 */
export interface DecisionEntry {
  /** When the decision was made. */
  timestamp: Date;
  /** The node that made the decision. */
  nodeId: string;
  /** What type of decision. */
  type: DecisionType;
  /** What was chosen. */
  chosen: string;
  /** What was rejected (and why). */
  rejected?: Array<{ option: string; reason: string }>;
  /** Why this choice was made. */
  reasoning: string;
  /** Data that informed the decision. */
  evidence?: Record<string, unknown>;
}

export type DecisionType =
  | 'path_selection'        // Condition node chose a branch
  | 'action_allowed'        // Policy/trust allowed an action
  | 'action_blocked'        // Policy/trust blocked an action
  | 'retry_decision'        // Decided to retry or not
  | 'escalation_triggered'  // Decided to escalate to human
  | 'fallback_activated'    // Primary failed, chose fallback
  | 'intent_evaluation'     // Checked whether intent was satisfied
  | 'pause_decision';       // Decided to pause and why

/**
 * The complete decision journal for an execution.
 * Agents read this to understand not just what happened,
 * but WHY every choice was made.
 */
export interface DecisionJournal {
  executionId: string;
  entries: DecisionEntry[];
}

/**
 * Create a decision journal and return helpers for recording entries.
 */
export function createDecisionJournal(executionId: string): {
  journal: DecisionJournal;
  record: (entry: Omit<DecisionEntry, 'timestamp'>) => void;
  explain: (nodeId: string, type: DecisionType, chosen: string, reasoning: string, rejected?: Array<{ option: string; reason: string }>) => void;
} {
  const journal: DecisionJournal = { executionId, entries: [] };

  return {
    journal,
    record(entry) {
      journal.entries.push({ ...entry, timestamp: new Date() });
    },
    explain(nodeId, type, chosen, reasoning, rejected) {
      journal.entries.push({
        timestamp: new Date(),
        nodeId,
        type,
        chosen,
        rejected,
        reasoning,
      });
    },
  };
}

/**
 * Summarize a decision journal for LLM context windows.
 */
export function summarizeDecisions(journal: DecisionJournal): string {
  if (journal.entries.length === 0) return 'No decisions recorded.';

  const parts: string[] = [];
  for (const entry of journal.entries) {
    let line = `[${entry.nodeId}] ${entry.type}: chose "${entry.chosen}" — ${entry.reasoning}`;
    if (entry.rejected?.length) {
      const rejections = entry.rejected.map(r => `${r.option} (${r.reason})`).join(', ');
      line += ` Rejected: ${rejections}`;
    }
    parts.push(line);
  }
  return parts.join('\n');
}
