// ===========================================
// DEAD LETTER QUEUE
// ===========================================
// Handles permanently failed automation executions.
// Stores them for review and provides retry functionality.
// ===========================================
// DEPENDS ON: ../types (AutomationDb, InputJsonValue)
// USED BY: resilience.ts, trigger-registry.ts
// ===========================================

import type { AutomationDb, InputJsonValue } from '../db-types';

// Logger fallback
const logger = {
  error(message: string, meta?: Record<string, unknown>): void {
    console.error(`[automation/dead-letter] ${message}`, meta ?? '');
  },
};

export interface DeadLetterEntry {
  id: string;
  automationId: string;
  executionId: string;
  errorMessage: string;
  errorStack?: string;
  triggerData: unknown;
  attempts: number;
  createdAt: Date;
  lastAttemptAt: Date;
}

/**
 * Move failed execution to dead letter queue
 * Stores in AutomationExecution with special status
 */
export async function moveToDeadLetter(
  db: AutomationDb,
  executionId: string,
  error: Error,
  attempts: number
): Promise<void> {
  await db.automationExecution.update({
    where: { id: executionId },
    data: {
      status: 'FAILED',
      errorMessage: `[DEAD_LETTER] ${error.message} (after ${attempts} attempts)`,
      completedAt: new Date(),
      actionResults: {
        deadLetter: true,
        finalError: error.message,
        errorStack: error.stack,
        attempts,
        movedAt: new Date().toISOString(),
      } as InputJsonValue,
    },
  });

  logger.error('Execution moved to dead letter queue', {
    executionId,
    error: error.message,
    attempts,
  });
}

/**
 * Get dead letter entries for review
 */
export async function getDeadLetterEntries(db: AutomationDb, options?: {
  automationId?: string;
  limit?: number;
  offset?: number;
}): Promise<{ entries: unknown[]; total: number }> {
  const { limit = 50, offset = 0, automationId } = options ?? {};

  const where: Record<string, unknown> = {
    status: 'FAILED' as const,
    errorMessage: { startsWith: '[DEAD_LETTER]' },
    ...(automationId && { automationId }),
  };

  const [entries, total] = await Promise.all([
    db.automationExecution.findMany({
      where,
      include: {
        automation: {
          select: { id: true, name: true, sourceModule: true },
        },
      },
      orderBy: { completedAt: 'desc' },
      take: limit,
      skip: offset,
    }),
    db.automationExecution.count({ where }),
  ]);

  return { entries, total };
}

/**
 * Retry a dead letter entry
 */
export async function retryDeadLetterEntry(db: AutomationDb, executionId: string): Promise<boolean> {
  const execution = await db.automationExecution.findUnique({
    where: { id: executionId },
    select: {
      id: true,
      status: true,
      errorMessage: true,
      inputData: true,
      automationId: true,
    },
  });

  if (!execution || !execution.errorMessage?.startsWith('[DEAD_LETTER]')) {
    return false;
  }

  // Reset execution for retry
  await db.automationExecution.update({
    where: { id: executionId },
    data: {
      status: 'PENDING',
      errorMessage: null,
      errorActionId: null,
      startedAt: null,
      completedAt: null,
      actionResults: null,
    },
  });

  return true;
}
