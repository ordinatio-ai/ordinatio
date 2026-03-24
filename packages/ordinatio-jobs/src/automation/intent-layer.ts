// ===========================================
// ORDINATIO JOBS v2.0 — Intent Layer
// ===========================================
// Every automation declares what outcome it's
// trying to achieve, how to verify success,
// acceptable alternative paths, failure
// boundaries, and when to escalate to humans.
// ===========================================

import type { AutomationDag } from './dag-types';

// ---- Intent Definition ----

/**
 * The intent of an automation — what it's trying to accomplish.
 * Agents reason about the goal, not the steps.
 */
export interface AutomationIntent {
  /** Plain-language description of the goal (for agents and humans). */
  intent: string;

  /** Machine-readable conditions that define "done". */
  definitionOfDone: DoDCheck[];

  /**
   * Paths the automation is allowed to take.
   * Guardrails — if the DAG tries something outside these, it's a violation.
   */
  acceptablePaths: string[];

  /** What constitutes failure (not just "an action threw"). */
  failureBoundary: FailureBoundary;

  /** When and how to escalate to a human. */
  humanEscalationPolicy: EscalationPolicy;
}

// ---- Definition of Done ----

/**
 * A single completion check.
 * Evaluated after DAG execution to verify the outcome achieved the goal.
 */
export interface DoDCheck {
  /** Human-readable description of what to check. */
  description: string;
  /** Machine-readable verification. */
  verification: DoDVerification;
}

/**
 * How to verify a DoD check.
 */
export type DoDVerification =
  | { type: 'field_check'; field: string; comparator: string; value: string }
  | { type: 'record_exists'; table: string; where: Record<string, string> }
  | { type: 'count_check'; table: string; where: Record<string, string>; comparator: 'gt' | 'gte' | 'eq' | 'lt' | 'lte'; value: number }
  | { type: 'custom'; checkId: string; params?: Record<string, unknown> };

// ---- Failure Boundary ----

/**
 * When to stop an automation — not just "an action threw."
 */
export interface FailureBoundary {
  /** Max consecutive failures before pausing the automation. */
  maxConsecutiveFailures: number;
  /** Max failures within a time window. */
  maxFailuresPerWindow?: { count: number; windowMs: number };
  /** Error patterns that mean "stop permanently" (regex strings). */
  fatalPatterns?: string[];
}

// ---- Escalation Policy ----

/**
 * When and how to escalate to a human.
 */
export interface EscalationPolicy {
  /** Conditions that trigger escalation. */
  escalateOn: EscalationTrigger[];
  /** Role to notify. */
  notifyRole?: string;
  /** Specific user to notify. */
  notifyUserId?: string;
  /** Max wait for human response. */
  escalationTimeoutMs?: number;
  /** What happens if no human responds in time. */
  onTimeout: 'pause' | 'abort' | 'continue_cautious';
}

export type EscalationTrigger =
  | 'high_risk_action'
  | 'approval_timeout'
  | 'repeated_failure'
  | 'unknown_state'
  | 'intent_unsatisfied'
  | 'trust_insufficient';

// Flattened and simplified logic where necessary.