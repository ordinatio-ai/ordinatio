// Trigger Registry — central event emitter for the automation system.
// DEPENDS ON: automation-queries, condition-evaluator, execution,
//             action-executor, resilience, queue-client, rate-limiter
// USED BY: Services that emit events (email, orders, clients, etc.)

import { getAutomationsByTriggerEvent } from './queries';
import { evaluateConditions } from './condition-evaluator';
import { createExecution, updateExecutionStatus } from './execution';
import { executeActions } from './action-executor';
import {
  generateIdempotencyKey,
  isDuplicateExecution,
  clearIdempotencyCache,
  executeWithTimeout,
  executeWithRetry,
  DEFAULT_RETRY_CONFIG,
  moveToDeadLetter,
  emitMonitoringEvent,
  registerActiveExecution,
  unregisterActiveExecution,
  isSystemShuttingDown,
} from './resilience/index';
import { checkRateLimits, updateRateLimitTracking, clearRateLimitTracking } from './resilience/rate-limiter';
import { queueAutomationExecution } from './queue-client';
import { autoError } from './errors';
import type { AutomationDb, AutomationCallbacks, AutomationActionType, TriggerEventType } from './db-types';
import { AUTOMATION_ACTIVITY_ACTIONS } from './db-types';

const EXECUTION_MODE =
  process.env.AUTOMATION_EXECUTION_MODE ?? (process.env.REDIS_HOST ? 'queue' : 'sync');

const EXECUTION_TIMEOUT_MS = 5 * 60 * 1000;
const MAX_RETRY_ATTEMPTS = 3;

export interface TriggerEvent {
  eventType: TriggerEventType;
  entityType: string;
  entityId: string;
  data: Record<string, unknown>;
}

export interface TriggerResult {
  triggered: number;
  skipped: number;
  duplicate: number;
  errors: string[];
}

export async function emit(
  db: AutomationDb,
  callbacks: AutomationCallbacks,
  event: TriggerEvent
): Promise<TriggerResult> {
  const result: TriggerResult = {
    triggered: 0,
    skipped: 0,
    duplicate: 0,
    errors: [],
  };

  if (isSystemShuttingDown()) {
    result.errors.push('System is shutting down, skipping new triggers');
    return result;
  }

  const log = callbacks.logger;

  try {
    const automations = await getAutomationsByTriggerEvent(db, event.eventType);
    for (const automation of automations) {
      try {
        const idempotencyKey = generateIdempotencyKey(
          automation.id,
          event.entityType,
          event.entityId,
          new Date()
        );

        if (isDuplicateExecution(idempotencyKey)) {
          result.duplicate++;
          continue;
        }

        if (!checkRateLimits(automation)) {
          result.skipped++;
          continue;
        }

        if (automation.trigger?.config) {
          const configMatch = checkTriggerConfig(
            automation.trigger.config as Record<string, unknown>,
            event.data
          );
          if (!configMatch) {
            result.skipped++;
            continue;
          }
        }

        if (automation.conditions.length > 0) {
          const conditionResult = await evaluateConditions(db, automation.conditions, event.data);
          if (!conditionResult.passed) {
            result.skipped++;
            continue;
          }
        }

        const execution = await createExecution(db, {
          automationId: automation.id,
          triggerEventType: event.eventType,
          triggerEntityType: event.entityType,
          triggerEntityId: event.entityId,
          inputData: event.data,
        });

        if (EXECUTION_MODE === 'queue') {
          await queueAutomationExecution({
            executionId: execution.id,
            automationId: automation.id,
            automationName: automation.name,
            triggerEventType: event.eventType,
            triggerEntityType: event.entityType,
            triggerEntityId: event.entityId,
            triggerData: event.data,
            conditions: automation.conditions.map((c: typeof automation.conditions[number]) => ({
              id: c.id,
              groupIndex: c.groupIndex,
              field: c.field,
              comparator: c.comparator,
              value: c.value,
              valueType: c.valueType,
            })),
            actions: automation.actions.map((a: typeof automation.actions[number]) => ({
              id: a.id,
              actionType: a.actionType,
              sortOrder: a.sortOrder,
              config: (a.config ?? {}) as Record<string, unknown>,
              useOutputFrom: a.useOutputFrom,
              continueOnError: a.continueOnError,
            })),
            idempotencyKey,
            maxExecutionsPerHour: automation.maxExecutionsPerHour,
            cooldownSeconds: automation.cooldownSeconds,
          });

          log?.info('Automation queued for execution', {
            automationId: automation.id,
            automationName: automation.name,
            executionId: execution.id,
          });
        } else {
          executeAutomationWithResilience(db, callbacks, automation, execution.id, event.data);
        }

        updateRateLimitTracking(automation.id);

        result.triggered++;
      } catch (err) {
        const { ref } = autoError('AUTO_202');
        const errorMessage = err instanceof Error ? err.message : 'Unknown error';
        console.error(`[${ref}] Failed to evaluate/execute automation ${automation.id}:`, err);
        result.errors.push(`Automation ${automation.id}: ${errorMessage}`);
        log?.error('Automation trigger failed', {
          automationId: automation.id,
          event: event.eventType,
          error: errorMessage,
          code: 'AUTO_202',
          ref,
        });
      }
    }
  } catch (err) {
    const { ref } = autoError('AUTO_201');
    const errorMessage = err instanceof Error ? err.message : 'Unknown error';
    console.error(`[${ref}] Trigger registration failed:`, err);
    result.errors.push(`Registry error: ${errorMessage}`);
    log?.error('Trigger registry error', { event: event.eventType, error: errorMessage, code: 'AUTO_201', ref });
  }

  return result;
}

function checkTriggerConfig(
  config: Record<string, unknown>,
  data: Record<string, unknown>
): boolean {
  for (const [key, expectedValue] of Object.entries(config)) {
    const actualValue = data[key];

    if (Array.isArray(expectedValue)) {
      if (!expectedValue.includes(actualValue)) {
        return false;
      }
    } else if (actualValue !== expectedValue) {
      return false;
    }
  }

  return true;
}

async function executeAutomationWithResilience(
  db: AutomationDb,
  callbacks: AutomationCallbacks,
  automation: {
    id: string;
    name: string;
    actions: Array<{
      id: string;
      actionType: AutomationActionType;
      sortOrder: number;
      config: unknown;
      useOutputFrom: number | null;
      continueOnError: boolean;
    }>;
  },
  executionId: string,
  triggerData: Record<string, unknown>
): Promise<void> {
  const startTime = Date.now();
  const log = callbacks.logger;

  registerActiveExecution(executionId);
  await emitMonitoringEvent({
    type: 'EXECUTION_STARTED',
    automationId: automation.id,
    executionId,
  });

  callbacks.logActivity?.({
    action: AUTOMATION_ACTIVITY_ACTIONS.AUTOMATION_TRIGGERED,
    description: `Automation "${automation.name}" triggered`,
    system: true,
    metadata: {
      automationId: automation.id,
      automationName: automation.name,
      executionId,
      triggerData,
    },
  });

  try {
    await updateExecutionStatus(db, executionId, 'PROCESSING', {
      startedAt: new Date(),
    });

    const actionResults = await executeWithRetry(
      () =>
        executeWithTimeout(
          () => executeActions(automation.actions, triggerData),
          EXECUTION_TIMEOUT_MS,
          `automation:${automation.id}`
        ),
      {
        ...DEFAULT_RETRY_CONFIG,
        maxAttempts: MAX_RETRY_ATTEMPTS,
      },
      `automation:${automation.id}`
    );

    const hasError = actionResults.some((r) => r.status === 'FAILED');
    const duration = Date.now() - startTime;

    await updateExecutionStatus(db, executionId, hasError ? 'FAILED' : 'COMPLETED', {
      completedAt: new Date(),
      actionResults,
      ...(hasError && {
        errorMessage: actionResults.find((r) => r.status === 'FAILED')?.error,
        errorActionId: actionResults.find((r) => r.status === 'FAILED')?.actionId,
      }),
    });

    await emitMonitoringEvent({
      type: hasError ? 'EXECUTION_FAILED' : 'EXECUTION_COMPLETED',
      automationId: automation.id,
      executionId,
      duration,
      error: hasError ? actionResults.find((r) => r.status === 'FAILED')?.error : undefined,
    });

    if (hasError) {
      const failedAction = actionResults.find((r) => r.status === 'FAILED');
      callbacks.logActivity?.({
        action: AUTOMATION_ACTIVITY_ACTIONS.AUTOMATION_FAILED,
        description: `Automation "${automation.name}" failed: ${failedAction?.error ?? 'Unknown error'}`,
        system: true,
        metadata: {
          automationId: automation.id,
          automationName: automation.name,
          executionId,
          duration,
          failedActionId: failedAction?.actionId,
          error: failedAction?.error,
        },
      });

      log?.warn('Automation execution had failures', {
        automationId: automation.id,
        automationName: automation.name,
        executionId,
        duration,
        failedActions: actionResults.filter((r) => r.status === 'FAILED').length,
      });
    } else {
      callbacks.logActivity?.({
        action: AUTOMATION_ACTIVITY_ACTIONS.AUTOMATION_COMPLETED,
        description: `Automation "${automation.name}" completed successfully`,
        system: true,
        metadata: {
          automationId: automation.id,
          automationName: automation.name,
          executionId,
          duration,
          actionsExecuted: actionResults.length,
        },
      });
    }
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    const duration = Date.now() - startTime;

    await moveToDeadLetter(db, executionId, error, MAX_RETRY_ATTEMPTS);
    await emitMonitoringEvent({
      type: 'EXECUTION_FAILED',
      automationId: automation.id,
      executionId,
      duration,
      error: error.message,
    });

    await emitMonitoringEvent({
      type: 'DEAD_LETTER',
      automationId: automation.id,
      executionId,
      error: error.message,
      metadata: { attempts: MAX_RETRY_ATTEMPTS },
    });

    callbacks.logActivity?.({
      action: AUTOMATION_ACTIVITY_ACTIONS.AUTOMATION_DEAD_LETTER,
      description: `Automation "${automation.name}" moved to dead letter queue after ${MAX_RETRY_ATTEMPTS} attempts: ${error.message}`,
      system: true,
      metadata: {
        automationId: automation.id,
        automationName: automation.name,
        executionId,
        duration,
        attempts: MAX_RETRY_ATTEMPTS,
        error: error.message,
        stack: error.stack,
      },
    });

    const { ref } = autoError('AUTO_501');
    console.error(`[${ref}] Retry exhausted — all attempts failed for automation ${automation.id}:`, error);
    log?.error('Automation execution failed permanently', {
      automationId: automation.id,
      automationName: automation.name,
      executionId,
      duration,
      error: error.message,
      stack: error.stack,
      code: 'AUTO_501',
      ref,
    });
  } finally {
    unregisterActiveExecution(executionId);
  }
}

export function clearAllTracking(): void {
  clearRateLimitTracking();
  clearIdempotencyCache();
}

export function getExecutionMode(): 'queue' | 'sync' {
  return EXECUTION_MODE as 'queue' | 'sync';
}

export { clearRateLimitTracking } from './resilience/rate-limiter';

export const triggerRegistry = {
  emit,
  clearRateLimitTracking,
  clearAllTracking,
  getExecutionMode,
};
