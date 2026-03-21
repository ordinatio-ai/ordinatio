// ===========================================
// ORDINATIO JOBS v2.0 — Automation Posture
// ===========================================
// Per-automation health monitoring.
// Agents read this to understand state
// without inspecting execution tables.
// ===========================================

import type { RecoveryPlan, HypermediaAction } from '../types';

// ---- Posture Types ----

export type AutomationHealth =
  | 'healthy'
  | 'degraded'
  | 'failing'
  | 'paused'
  | 'circuit_open'
  | 'rate_limited'
  | 'backlogged';

/**
 * Full health posture for an automation.
 * Agents consume this to understand state instantly.
 */
export interface AutomationPosture {
  automationId: string;
  automationName: string;

  health: AutomationHealth;

  lastSuccess?: Date;
  lastFailure?: Date;
  consecutiveFailures: number;

  /** Last 24h statistics. */
  stats24h: {
    total: number;
    completed: number;
    failed: number;
    skipped: number;
    avgDurationMs: number;
  };

  deadLetterCount: number;

  /** Whether the intent's DoD has been satisfied recently. */
  intentSatisfied: boolean;

  recommendedAction?: string;

  /** Plain-language summary for humans and agents. */
  plainLanguageSummary: string;

  _actions: Record<string, HypermediaAction>;
  _state: string;
  _constraints: string[];
  _recovery?: RecoveryPlan;
}

// ---- Posture Input ----

/**
 * Raw data needed to compute posture.
 * The app layer queries this from the DB and passes it in.
 */
export interface PostureInput {
  automationId: string;
  automationName: string;
  isActive: boolean;

  lastSuccess?: Date;
  lastFailure?: Date;
  consecutiveFailures: number;

  executions24h: {
    total: number;
    completed: number;
    failed: number;
    skipped: number;
    totalDurationMs: number;
  };

  deadLetterCount: number;
  circuitOpen: boolean;
  rateLimited: boolean;
  intentSatisfied: boolean;
  queueDepth?: number;
}

/**
 * Compute the automation posture from raw input.
 * Pure function — no DB access.
 */
export function computeAutomationPosture(input: PostureInput): AutomationPosture {
  const health = assessHealth(input);
  const recommendedAction = computeRecommendation(input, health);
  const summary = buildSummary(input, health, recommendedAction);
  const actions = buildActions(input, health);
  const constraints = buildConstraints(input);

  return {
    automationId: input.automationId,
    automationName: input.automationName,
    health,
    lastSuccess: input.lastSuccess,
    lastFailure: input.lastFailure,
    consecutiveFailures: input.consecutiveFailures,
    stats24h: {
      total: input.executions24h.total,
      completed: input.executions24h.completed,
      failed: input.executions24h.failed,
      skipped: input.executions24h.skipped,
      avgDurationMs: input.executions24h.total > 0
        ? Math.round(input.executions24h.totalDurationMs / input.executions24h.total)
        : 0,
    },
    deadLetterCount: input.deadLetterCount,
    intentSatisfied: input.intentSatisfied,
    recommendedAction,
    plainLanguageSummary: summary,
    _actions: actions,
    _state: health,
    _constraints: constraints,
    _recovery: health === 'failing' ? {
      recoverable: true,
      retryRecommended: false,
      nextAction: 'request_human',
      humanInterventionRequired: true,
      reasonCode: `AUTOMATION_${health.toUpperCase()}`,
    } : undefined,
  };
}

/**
 * Summarize posture for LLM context windows.
 * Returns a compact single string.
 */
export function summarizeAutomationPosture(posture: AutomationPosture): string {
  return posture.plainLanguageSummary;
}

/**
 * Quick check: does this automation need attention?
 */
export function automationNeedsAttention(posture: AutomationPosture): boolean {
  return posture.health !== 'healthy';
}

// ---- Internal ----

function assessHealth(input: PostureInput): AutomationHealth {
  if (!input.isActive) return 'paused';
  if (input.circuitOpen) return 'circuit_open';
  if (input.rateLimited) return 'rate_limited';
  if ((input.queueDepth ?? 0) > 50) return 'backlogged';
  if (input.consecutiveFailures >= 5) return 'failing';
  if (input.consecutiveFailures >= 2 || input.deadLetterCount > 0) return 'degraded';
  return 'healthy';
}

function computeRecommendation(input: PostureInput, health: AutomationHealth): string | undefined {
  switch (health) {
    case 'failing':
      return `${input.consecutiveFailures} consecutive failures. Investigate error patterns and consider pausing.`;
    case 'circuit_open':
      return 'Circuit breaker is open due to high failure rate. Will auto-recover after cooldown.';
    case 'rate_limited':
      return 'Rate limit reached. Execution will resume when the window resets.';
    case 'backlogged':
      return `Queue depth is ${input.queueDepth}. Consider scaling workers or reducing trigger frequency.`;
    case 'degraded':
      if (input.deadLetterCount > 0) {
        return `${input.deadLetterCount} executions in dead letter queue. Review and retry or discard.`;
      }
      return 'Recent failures detected. Monitor closely.';
    case 'paused':
      return 'Automation is paused. Reactivate when ready.';
    default:
      return undefined;
  }
}

function buildSummary(input: PostureInput, health: AutomationHealth, recommendation?: string): string {
  const parts: string[] = [];

  parts.push(`${input.automationName} is ${health}.`);

  if (input.executions24h.total > 0) {
    parts.push(`Last 24h: ${input.executions24h.completed} completed, ${input.executions24h.failed} failed out of ${input.executions24h.total} total.`);
  } else {
    parts.push('No executions in the last 24 hours.');
  }

  if (input.consecutiveFailures > 0) {
    parts.push(`${input.consecutiveFailures} consecutive failures.`);
  }

  if (input.deadLetterCount > 0) {
    parts.push(`${input.deadLetterCount} in dead letter queue.`);
  }

  if (!input.intentSatisfied && input.executions24h.completed > 0) {
    parts.push('Intent has not been satisfied despite completions — check definition of done.');
  }

  if (recommendation) {
    parts.push(recommendation);
  }

  return parts.join(' ');
}

function buildActions(input: PostureInput, health: AutomationHealth): Record<string, HypermediaAction> {
  const actions: Record<string, HypermediaAction> = {};

  if (health === 'paused') {
    actions.reactivate = { intent: 'Reactivate this automation' };
  } else {
    actions.pause = { intent: 'Pause this automation' };
  }

  if (input.deadLetterCount > 0) {
    actions.retry_dead_letter = { intent: `Retry ${input.deadLetterCount} dead-lettered executions` };
    actions.purge_dead_letter = { intent: 'Discard all dead-lettered executions' };
  }

  if (health === 'failing' || health === 'degraded') {
    actions.inspect_failures = { intent: 'View recent failure details' };
  }

  actions.test = { intent: 'Dry-run this automation with test data' };
  actions.simulate = { intent: 'Simulate against historical data' };
  actions.view_history = { intent: 'View execution history' };

  return actions;
}

function buildConstraints(input: PostureInput): string[] {
  const constraints: string[] = [];

  if (!input.isActive) constraints.push('Automation is paused — will not trigger');
  if (input.circuitOpen) constraints.push('Circuit breaker is open — executions blocked');
  if (input.rateLimited) constraints.push('Rate limit reached — queued executions delayed');
  if (input.consecutiveFailures >= 5) constraints.push('Failure threshold reached — manual review required');

  return constraints;
}
