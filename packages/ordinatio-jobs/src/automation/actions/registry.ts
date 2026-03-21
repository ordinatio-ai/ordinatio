// ===========================================
// ACTION REGISTRY
// ===========================================
// Registry pattern for automation actions.
// Each action type has a handler that can be registered
// and executed dynamically.
// ===========================================

import type { AutomationActionType } from '../db-types';

export interface ActionResult {
  actionId: string;
  actionType: string;
  status: 'COMPLETED' | 'FAILED' | 'SKIPPED';
  output?: unknown;
  error?: string;
}

export interface ExecutionContext {
  data: Record<string, unknown>;
  previousOutputs: Map<number, unknown>;
}

export type ActionHandler = (
  actionId: string,
  config: Record<string, unknown>,
  context: ExecutionContext
) => Promise<ActionResult>;

// Registry of action handlers
const actionHandlers = new Map<AutomationActionType, ActionHandler>();

/**
 * Register an action handler
 */
export function registerAction(
  actionType: AutomationActionType,
  handler: ActionHandler
): void {
  if (actionHandlers.has(actionType)) {
    throw new Error(`Action handler already registered for: ${actionType}`);
  }
  actionHandlers.set(actionType, handler);
}

/**
 * Get an action handler
 */
export function getActionHandler(
  actionType: AutomationActionType
): ActionHandler | undefined {
  return actionHandlers.get(actionType);
}

/**
 * Check if an action type is registered
 */
export function isActionRegistered(actionType: AutomationActionType): boolean {
  return actionHandlers.has(actionType);
}

/**
 * Get all registered action types
 */
export function getRegisteredActions(): AutomationActionType[] {
  return Array.from(actionHandlers.keys());
}

/**
 * Clear all registered actions (for testing)
 */
export function clearActionRegistry(): void {
  actionHandlers.clear();
}

/**
 * Create a failed action result
 */
export function failedResult(
  actionId: string,
  actionType: string,
  error: string
): ActionResult {
  return {
    actionId,
    actionType,
    status: 'FAILED',
    error,
  };
}

/**
 * Create a completed action result
 */
export function completedResult(
  actionId: string,
  actionType: string,
  output?: unknown
): ActionResult {
  return {
    actionId,
    actionType,
    status: 'COMPLETED',
    output,
  };
}

/**
 * Create a skipped action result
 */
export function skippedResult(
  actionId: string,
  actionType: string,
  reason?: string
): ActionResult {
  return {
    actionId,
    actionType,
    status: 'SKIPPED',
    output: reason ? { reason } : undefined,
  };
}
