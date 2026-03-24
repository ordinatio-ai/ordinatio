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

// ---- Intent Validation ----

/** Result of intent validation. */
export interface IntentValidation {
  valid: boolean;
  errors: string[];
}

/**
 * Validate that an intent is complete and well-formed.
 */
export function validateIntent(intent: AutomationIntent): IntentValidation {
  const errors: string[] = [];

  validateIntentProperties(intent, errors);
  validateDefinitionOfDone(intent.definitionOfDone, errors);

  validateFailureBoundary(intent.failureBoundary, errors);
  validateEscalationPolicy(intent.humanEscalationPolicy, errors);

  return { valid: errors.length === 0, errors };
}

function validateIntentProperties(intent: AutomationIntent, errors: string[]): void {
  if (!intent.intent || intent.intent.trim().length === 0) {
    errors.push('Intent description is empty');
  }

  if (!intent.definitionOfDone || intent.definitionOfDone.length === 0) {
    errors.push('Definition of done has no checks — cannot verify success');
  }

  if (!intent.acceptablePaths || intent.acceptablePaths.length === 0) {
    errors.push('No acceptable paths defined — automation has no guardrails');
  }

  if (!intent.failureBoundary) {
    errors.push('No failure boundary — automation has no stop conditions');
  }

  if (!intent.humanEscalationPolicy) {
    errors.push('No human escalation policy — failures have no escalation path');
  }
}

function validateDefinitionOfDone(definitionOfDone: DoDCheck[], errors: string[]): void {
  for (let i = 0; i < (definitionOfDone?.length ?? 0); i++) {
    const check = definitionOfDone[i];
    if (!check.description) {
      errors.push(`DoD check ${i} has no description`);
    }
    if (!check.verification) {
      errors.push(`DoD check ${i} has no verification method`);
    }
  }
}

function validateFailureBoundary(failureBoundary: FailureBoundary, errors: string[]): void {
  if (failureBoundary.maxConsecutiveFailures <= 0) {
    errors.push('maxConsecutiveFailures must be > 0');
  }
}

function validateEscalationPolicy(humanEscalationPolicy: EscalationPolicy, errors: string[]): void {
  if (!humanEscalationPolicy.escalateOn?.length) {
    errors.push('Escalation policy has no triggers — will never escalate');
  }
}

// ---- DoD Evaluation ----

/** Result of checking the definition of done. */
export interface DoDResult {
  satisfied: boolean;
  checks: Array<{
    description: string;
    passed: boolean;
    reason?: string;
  }>;
  satisfiedCount: number;
  totalChecks: number;
}

/**
 * Evaluate the definition of done against the current data context.
 * Returns which checks pass and which don't.
 *
 * For field_check: evaluates against the provided data context.
 * For record_exists/count_check: calls the provided checker callback.
 * For custom: calls the provided checker callback.
 */
export function evaluateDefinitionOfDone(
  checks: DoDCheck[],
  context: Record<string, unknown>,
  checker?: DoDChecker,
): DoDResult {
  const results = checks.map(check => evaluateCheck(check, context, checker));

  const satisfiedCount = results.filter(r => r.passed).length;

  return {
    satisfied: satisfiedCount === results.length,
    checks: results,
    satisfiedCount,
    totalChecks: results.length,
  };
}

function evaluateCheck(check: DoDCheck, context: Record<string, unknown>, checker?: DoDChecker): { description: string, passed: boolean, reason?: string } {
  let passed = false;
  let reason: string | undefined;

  switch (check.verification.type) {
    case 'field_check':
      passed = evaluateFieldCheck(
        getNestedValue(context, check.verification.field),
        check.verification.comparator,
        check.verification.value
      );

      if (!passed) {
        reason = `Field "${check.verification.field}" is "${String(getNestedValue(context, check.verification.field))}", expected ${check.verification.comparator} "${check.verification.value}"`;
      }
      break;
    case 'record_exists':
      if (checker?.recordExists) {
        passed = checker.recordExists(check.verification.table, check.verification.where);
      } else {
        reason = 'No record_exists checker provided';
      }
      break;
    case 'count_check':
      if (checker?.countCheck) {
        const count = checker.countCheck(check.verification.table, check.verification.where);
        passed = evaluateCountCheck(count, check.verification.comparator, check.verification.value);
        if (!passed) {
          reason = `Count is ${count}, expected ${check.verification.comparator} ${check.verification.value}`;
        }
      } else {
        reason = 'No count_check checker provided';
      }
      break;
    case 'custom':
      if (checker?.custom) {
        passed = checker.custom(check.verification.checkId, check.verification.params);
      } else {
        reason = 'No custom checker provided';
      }
      break;
  }
  return { description: check.description, passed, reason };
}

/**
 * Callback interface for DoD checks that need external lookups.
 * The app layer provides these (e.g., database queries).
 */
export interface DoDChecker {
  recordExists?: (table: string, where: Record<string, string>) => boolean;
  countCheck?: (table: string, where: Record<string, string>) => number;
  custom?: (checkId: string, params?: Record<string, unknown>) => boolean;
}

// ---- Failure Boundary Evaluation ----

/** Check if the failure boundary has been breached. */
export interface FailureBoundaryCheck {
  breached: boolean;
  reason?: string;
  isFatal?: boolean;
}

/**
 * Check if the failure boundary has been reached.
 */
export function checkFailureBoundary(
  boundary: FailureBoundary,
  consecutiveFailures: number,
  recentFailures?: { count: number; windowMs: number },
  lastError?: string,
): FailureBoundaryCheck {
  const breachDetails = checkFatalPatterns(boundary, lastError);
  if (breachDetails) return breachDetails;

  if (consecutiveFailures >= boundary.maxConsecutiveFailures) {
    return {
      breached: true,
      reason: `${consecutiveFailures} consecutive failures (max: ${boundary.maxConsecutiveFailures})`,
    };
  }

  if (boundary.maxFailuresPerWindow && recentFailures && (recentFailures.count >= boundary.maxFailuresPerWindow.count)) {
    return {
      breached: true,
      reason: `${recentFailures.count} failures in ${boundary.maxFailuresPerWindow.windowMs}ms window (max: ${boundary.maxFailuresPerWindow.count})`,
    };
  }

  return { breached: false };
}

function checkFatalPatterns(boundary: FailureBoundary, lastError?: string): FailureBoundaryCheck | null {
  if (lastError && boundary.fatalPatterns) {
    for (const pattern of boundary.fatalPatterns) {
      if (new RegExp(pattern, 'i').test(lastError)) {
        return { breached: true, reason: `Fatal error pattern matched: ${pattern}`, isFatal: true };
      }
    }
  }
  return null;
}

// ---- Escalation Evaluation ----

/**
 * Determine if escalation is needed based on the policy and current state.
 */
export function shouldEscalate(
  policy: EscalationPolicy,
  conditions: {
    hasHighRiskAction?: boolean;
    approvalTimedOut?: boolean;
    consecutiveFailures?: number;
    isUnknownState?: boolean;
    intentSatisfied?: boolean;
    trustInsufficient?: boolean;
  },
): boolean {
  return policy.escalateOn.some(trigger => checkEscalationTrigger(trigger, conditions));
}

function checkEscalationTrigger(trigger: EscalationTrigger, conditions: {
  hasHighRiskAction?: boolean;
  approvalTimedOut?: boolean;
  consecutiveFailures?: number;
  isUnknownState?: boolean;
  intentSatisfied?: boolean;
  trustInsufficient?: boolean;
}): boolean {
  switch (trigger) {
    case 'high_risk_action':
      return !!conditions.hasHighRiskAction;
    case 'approval_timeout':
      return !!conditions.approvalTimedOut;
    case 'repeated_failure':
      return (conditions.consecutiveFailures ?? 0) >= 2;
    case 'unknown_state':
      return !!conditions.isUnknownState;
    case 'intent_unsatisfied':
      return conditions.intentSatisfied === false;
    case 'trust_insufficient':
      return !!conditions.trustInsufficient;
    default:
      return false;
  }
}

// ---- Internal helpers ----

function getNestedValue(obj: Record<string, unknown>, path: string): unknown {
  const parts = path.split('.');
  let current: unknown = obj;
  for (const part of parts) {
    if (current === null || current === undefined) return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

function evaluateFieldCheck(actual: unknown, comparator: string, expected: string): boolean {
  const strActual = String(actual ?? '');
  switch (comparator) {
    case 'EQUALS': return strActual === expected;
    case 'NOT_EQUALS': return strActual !== expected;
    case 'CONTAINS': return strActual.includes(expected);
    case 'IS_NOT_EMPTY': return !!actual && strActual !== '';
    case 'IS_EMPTY': return !actual || strActual === '';
    case 'GREATER_THAN': return Number(actual) > Number(expected);
    case 'LESS_THAN': return Number(actual) < Number(expected);
    default: return strActual === expected;
  }
}

function evaluateCountCheck(count: number, comparator: string, value: number): boolean {
  switch (comparator) {
    case 'gt': return count > value;
    case 'gte': return count >= value;
    case 'eq': return count === value;
    case 'lt': return count < value;
    case 'lte': return count <= value;
    default: return count === value;
  }
}
