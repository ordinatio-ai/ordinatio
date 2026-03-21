// ===========================================
// ACTION EXECUTOR
// ===========================================
// Executes automation actions in order using the action registry.
// Each action type is defined in a separate file under actions/.
// ===========================================

import type { AutomationActionType } from './db-types';
import {
  initializeActionHandlers,
  getActionHandler,
  type ActionResult,
  type ExecutionContext,
} from './actions';

// Re-export types from registry for backwards compatibility
export type { ActionResult, ExecutionContext } from './actions';

export interface ActionInput {
  id: string;
  actionType: AutomationActionType;
  sortOrder: number;
  config: unknown;
  useOutputFrom: number | null;
  continueOnError: boolean;
}

// Ensure action handlers are initialized
let initialized = false;
function ensureInitialized(): void {
  if (!initialized) {
    initializeActionHandlers();
    initialized = true;
  }
}

/**
 * Execute a list of actions in order
 */
export async function executeActions(
  actions: ActionInput[],
  triggerData: Record<string, unknown>
): Promise<ActionResult[]> {
  ensureInitialized();

  const results: ActionResult[] = [];
  const context: ExecutionContext = {
    data: triggerData,
    previousOutputs: new Map(),
  };

  // Sort by sortOrder
  const sortedActions = [...actions].sort((a, b) => a.sortOrder - b.sortOrder);

  for (const action of sortedActions) {
    try {
      // If action uses output from previous action, merge it into context
      if (action.useOutputFrom !== null) {
        const previousOutput = context.previousOutputs.get(action.useOutputFrom);
        if (previousOutput && typeof previousOutput === 'object') {
          context.data = {
            ...context.data,
            previousAction: previousOutput,
          };
        }
      }

      const result = await executeAction(action, context);
      results.push(result);

      // Store output for chaining
      if (result.output !== undefined) {
        context.previousOutputs.set(action.sortOrder, result.output);
      }

      // Stop execution if action failed and continueOnError is false
      if (result.status === 'FAILED' && !action.continueOnError) {
        break;
      }
    } catch (err) {
      const result: ActionResult = {
        actionId: action.id,
        actionType: action.actionType,
        status: 'FAILED',
        error: err instanceof Error ? err.message : 'Unknown error',
      };
      results.push(result);

      if (!action.continueOnError) {
        break;
      }
    }
  }

  return results;
}

/**
 * Execute a single action using the registry
 */
async function executeAction(
  action: ActionInput,
  context: ExecutionContext
): Promise<ActionResult> {
  const handler = getActionHandler(action.actionType);

  if (!handler) {
    return {
      actionId: action.id,
      actionType: action.actionType,
      status: 'FAILED',
      error: `Unknown action type: ${action.actionType}`,
    };
  }

  const config = (action.config ?? {}) as Record<string, unknown>;
  return handler(action.id, config, context);
}
