// ===========================================
// ORDINATIO JOBS v1.1 — Failure Classification
// ===========================================
// Generates RecoveryPlan from errors.
// Every failure MUST produce a recovery plan.
// Agents always know what to do next.
// ===========================================

import type { RecoveryPlan, JobTypeDefinition } from './types';

/** Known error patterns and their classifications. */
const ERROR_PATTERNS: Array<{
  pattern: RegExp;
  nextAction: RecoveryPlan['nextAction'];
  retryRecommended: boolean;
  humanRequired: boolean;
}> = [
  // Auth / permission (check BEFORE transient — "401" should not match "service unavailable")
  { pattern: /401|403|unauthorized|forbidden|access denied/i, nextAction: 'request_human', retryRecommended: false, humanRequired: true },
  { pattern: /token expired|session expired|invalid credentials/i, nextAction: 'request_human', retryRecommended: false, humanRequired: true },

  // Connection / transient
  { pattern: /ECONNREFUSED|ECONNRESET|ETIMEDOUT|ENOTFOUND|socket hang up/i, nextAction: 'retry', retryRecommended: true, humanRequired: false },
  { pattern: /503|502|504|service unavailable|gateway timeout/i, nextAction: 'retry', retryRecommended: true, humanRequired: false },
  { pattern: /rate limit|too many requests|429/i, nextAction: 'wait', retryRecommended: true, humanRequired: false },

  // Validation / data
  { pattern: /validation|invalid|malformed|parse error|schema/i, nextAction: 'modify_payload', retryRecommended: false, humanRequired: false },
  { pattern: /not found|404|does not exist|missing/i, nextAction: 'modify_payload', retryRecommended: false, humanRequired: false },

  // Conflict / state
  { pattern: /conflict|409|already exists|duplicate/i, nextAction: 'abort', retryRecommended: false, humanRequired: false },
  { pattern: /quarantine|suspicious|unsafe|integrity/i, nextAction: 'abort', retryRecommended: false, humanRequired: true },
];

/**
 * Classify a failure and generate a RecoveryPlan.
 * Uses error message pattern matching + job definition safety flags.
 */
export function classifyFailure(
  error: unknown,
  jobDef: JobTypeDefinition,
): RecoveryPlan {
  const message = error instanceof Error ? error.message : String(error ?? '');

  // Match against known patterns
  for (const { pattern, nextAction, retryRecommended, humanRequired } of ERROR_PATTERNS) {
    if (pattern.test(message)) {
      return buildPlan(nextAction, retryRecommended, humanRequired, message, jobDef);
    }
  }

  // Unknown error — conservative default
  return buildPlan('abort', false, true, message, jobDef);
}

/**
 * Generate a default RecoveryPlan when a worker fails to provide one.
 * This is the fallback — workers SHOULD provide their own.
 */
export function defaultRecoveryPlan(
  error: unknown,
  jobDef: JobTypeDefinition,
): RecoveryPlan {
  return classifyFailure(error, jobDef);
}

/**
 * Validate that a RecoveryPlan has all required fields.
 */
export function isValidRecoveryPlan(plan: unknown): plan is RecoveryPlan {
  if (!plan || typeof plan !== 'object') return false;
  const p = plan as Record<string, unknown>;

  return (
    typeof p.recoverable === 'boolean' &&
    typeof p.retryRecommended === 'boolean' &&
    typeof p.nextAction === 'string' &&
    ['retry', 'modify_payload', 'request_human', 'abort', 'wait'].includes(p.nextAction as string) &&
    typeof p.humanInterventionRequired === 'boolean' &&
    typeof p.reasonCode === 'string' &&
    p.reasonCode.length > 0
  );
}

// ---- Internal ----

function buildPlan(
  nextAction: RecoveryPlan['nextAction'],
  retryRecommended: boolean,
  humanRequired: boolean,
  errorMessage: string,
  jobDef: JobTypeDefinition,
): RecoveryPlan {
  // Override with job definition safety flags
  const safeToRetry = jobDef.safeToRetry;
  const finalRetry = retryRecommended && safeToRetry;

  return {
    recoverable: nextAction !== 'abort',
    retryRecommended: finalRetry,
    retryDelayMs: finalRetry ? jobDef.retry.backoff.delay : undefined,
    nextAction: !safeToRetry && nextAction === 'retry' ? 'request_human' : nextAction,
    humanInterventionRequired: humanRequired || !safeToRetry,
    reasonCode: extractReasonCode(errorMessage),
  };
}

function extractReasonCode(message: string): string {
  // Try to extract an error code like [JOBS_100] or HTTPORDER_800
  const match = message.match(/\[?([A-Z_]+_\d+)\]?/);
  if (match) return match[1];
  // Fallback: first 50 chars normalized
  return message.slice(0, 50).replace(/[^a-zA-Z0-9_]/g, '_').toUpperCase() || 'UNKNOWN_ERROR';
}
