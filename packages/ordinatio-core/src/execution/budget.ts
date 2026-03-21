// IHS
/**
 * Budget Tracking & Enforcement (Book IV)
 *
 * Pure functions for tracking resource consumption during bounded execution.
 * All functions are immutable — they return new BudgetSnapshot objects.
 *
 * Budget priority (hardest wall first): time > llmCalls > tokens > actions
 *
 * DEPENDS ON: execution/types (ExecutionBounds, ExecutionConsumption, DEFAULT_EXECUTION_BOUNDS)
 *             execution/machine-types (BudgetSnapshot, BudgetRemaining, ExceededBound, MachineConfig)
 */

import type { ExecutionBounds, ExecutionConsumption } from './types';
import { DEFAULT_EXECUTION_BOUNDS } from './types';
import type { BudgetSnapshot, BudgetRemaining, ExceededBound, MachineConfig } from './machine-types';

/**
 * Create a fresh budget snapshot (all zeros).
 */
export function createBudgetSnapshot(): BudgetSnapshot {
  return {
    llmCallsUsed: 0,
    tokensUsed: 0,
    actionsExecuted: 0,
    elapsedMs: 0,
  };
}

/**
 * Record an LLM call. Returns new snapshot with incremented llmCallsUsed + tokensUsed.
 */
export function recordLlmCall(budget: BudgetSnapshot, tokensUsed: number): BudgetSnapshot {
  return {
    ...budget,
    llmCallsUsed: budget.llmCallsUsed + 1,
    tokensUsed: budget.tokensUsed + tokensUsed,
  };
}

/**
 * Record a capability action. Returns new snapshot with incremented actionsExecuted.
 */
export function recordAction(budget: BudgetSnapshot): BudgetSnapshot {
  return {
    ...budget,
    actionsExecuted: budget.actionsExecuted + 1,
  };
}

/**
 * Update elapsed time. Returns new snapshot with updated elapsedMs.
 */
export function updateElapsed(budget: BudgetSnapshot, elapsedMs: number): BudgetSnapshot {
  return {
    ...budget,
    elapsedMs,
  };
}

/**
 * Check which bounds have been exceeded.
 * Returns array of ExceededBound (empty = within budget).
 * Priority order: timeoutMs > maxLlmCalls > maxTokens > maxActions
 */
export function checkBounds(budget: BudgetSnapshot, bounds: ExecutionBounds): ExceededBound[] {
  const exceeded: ExceededBound[] = [];

  if (budget.elapsedMs >= bounds.timeoutMs) {
    exceeded.push({ bound: 'timeoutMs', limit: bounds.timeoutMs, actual: budget.elapsedMs });
  }
  if (budget.llmCallsUsed >= bounds.maxLlmCalls) {
    exceeded.push({ bound: 'maxLlmCalls', limit: bounds.maxLlmCalls, actual: budget.llmCallsUsed });
  }
  if (budget.tokensUsed >= bounds.maxTokens) {
    exceeded.push({ bound: 'maxTokens', limit: bounds.maxTokens, actual: budget.tokensUsed });
  }
  if (budget.actionsExecuted >= bounds.maxActions) {
    exceeded.push({ bound: 'maxActions', limit: bounds.maxActions, actual: budget.actionsExecuted });
  }

  return exceeded;
}

/**
 * Compute remaining budget in each dimension.
 */
export function getRemainingBudget(budget: BudgetSnapshot, bounds: ExecutionBounds): BudgetRemaining {
  return {
    llmCalls: Math.max(0, bounds.maxLlmCalls - budget.llmCallsUsed),
    tokens: Math.max(0, bounds.maxTokens - budget.tokensUsed),
    actions: Math.max(0, bounds.maxActions - budget.actionsExecuted),
    timeMs: Math.max(0, bounds.timeoutMs - budget.elapsedMs),
  };
}

/**
 * Map BudgetSnapshot to the existing ExecutionConsumption type.
 */
export function toConsumption(budget: BudgetSnapshot): ExecutionConsumption {
  return {
    llmCalls: budget.llmCallsUsed,
    tokensUsed: budget.tokensUsed,
    durationMs: budget.elapsedMs,
    actionsPerformed: budget.actionsExecuted,
    auditEntriesCreated: budget.actionsExecuted,
  };
}

/**
 * Resolve execution bounds from config, falling back to DEFAULT_EXECUTION_BOUNDS.
 */
export function resolveBounds(config: MachineConfig): ExecutionBounds {
  return {
    maxLlmCalls: config.bounds?.maxLlmCalls ?? DEFAULT_EXECUTION_BOUNDS.maxLlmCalls,
    timeoutMs: config.bounds?.timeoutMs ?? DEFAULT_EXECUTION_BOUNDS.timeoutMs,
    maxTokens: config.bounds?.maxTokens ?? DEFAULT_EXECUTION_BOUNDS.maxTokens,
    maxActions: config.bounds?.maxActions ?? DEFAULT_EXECUTION_BOUNDS.maxActions,
  };
}
