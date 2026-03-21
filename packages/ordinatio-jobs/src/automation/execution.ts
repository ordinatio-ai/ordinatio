// ===========================================
// EXECUTION SERVICE
// ===========================================
// Manages automation execution records.
// Tracks the lifecycle of each automation run.
// ===========================================

import type { AutomationDb, ExecutionStatus, TriggerEventType, InputJsonValue } from './db-types';
import { ExecutionNotFoundError } from './errors';

export interface CreateExecutionInput {
  automationId: string;
  triggerEventType: TriggerEventType;
  triggerEntityType?: string;
  triggerEntityId?: string;
  inputData?: Record<string, unknown>;
}

export interface UpdateExecutionInput {
  status?: ExecutionStatus;
  startedAt?: Date;
  completedAt?: Date;
  actionResults?: unknown[];
  errorMessage?: string;
  errorActionId?: string;
}

// Re-export error for API routes
export { ExecutionNotFoundError };

/**
 * Create a new execution record
 */
export async function createExecution(db: AutomationDb, input: CreateExecutionInput) {
  return db.automationExecution.create({
    data: {
      automationId: input.automationId,
      triggerEventType: input.triggerEventType,
      triggerEntityType: input.triggerEntityType,
      triggerEntityId: input.triggerEntityId,
      inputData: (input.inputData ?? null) as InputJsonValue,
      status: 'PENDING',
    },
  });
}

/**
 * Update execution status and data
 */
export async function updateExecutionStatus(
  db: AutomationDb,
  executionId: string,
  status: ExecutionStatus,
  data?: Omit<UpdateExecutionInput, 'status'>
) {
  return db.automationExecution.update({
    where: { id: executionId },
    data: {
      status,
      ...(data?.startedAt && { startedAt: data.startedAt }),
      ...(data?.completedAt && { completedAt: data.completedAt }),
      ...(data?.actionResults && { actionResults: data.actionResults as InputJsonValue }),
      ...(data?.errorMessage !== undefined && { errorMessage: data.errorMessage }),
      ...(data?.errorActionId !== undefined && { errorActionId: data.errorActionId }),
    },
  });
}

/**
 * Get execution by ID with automation details
 */
export async function getExecutionById(db: AutomationDb, id: string) {
  const execution = await db.automationExecution.findUnique({
    where: { id },
    include: {
      automation: {
        select: {
          id: true,
          name: true,
          sourceModule: true,
        },
      },
    },
  });

  if (!execution) {
    throw new ExecutionNotFoundError(id);
  }

  return execution;
}

/**
 * Get recent executions with optional filters
 */
export async function getRecentExecutions(db: AutomationDb, options?: {
  automationId?: string;
  status?: ExecutionStatus;
  entityType?: string;
  entityId?: string;
  limit?: number;
  offset?: number;
}) {
  const { limit = 50, offset = 0, ...filters } = options ?? {};

  const where: Record<string, unknown> = {};

  if (filters.automationId) {
    where.automationId = filters.automationId;
  }
  if (filters.status) {
    where.status = filters.status;
  }
  if (filters.entityType) {
    where.triggerEntityType = filters.entityType;
  }
  if (filters.entityId) {
    where.triggerEntityId = filters.entityId;
  }

  const [executions, total] = await Promise.all([
    db.automationExecution.findMany({
      where,
      include: {
        automation: {
          select: {
            id: true,
            name: true,
            sourceModule: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: offset,
    }),
    db.automationExecution.count({ where }),
  ]);

  return {
    executions,
    total,
    hasMore: offset + executions.length < total,
  };
}

/**
 * Get execution statistics for an automation
 */
export async function getExecutionStats(db: AutomationDb, automationId: string, since?: Date) {
  const where: Record<string, unknown> = {
    automationId,
    ...(since && {
      createdAt: { gte: since },
    }),
  };

  const [total, completed, failed, pending] = await Promise.all([
    db.automationExecution.count({ where }),
    db.automationExecution.count({
      where: { ...where, status: 'COMPLETED' },
    }),
    db.automationExecution.count({
      where: { ...where, status: 'FAILED' },
    }),
    db.automationExecution.count({
      where: { ...where, status: 'PENDING' },
    }),
  ]);

  return {
    total,
    completed,
    failed,
    pending,
    successRate: total > 0 ? (completed / total) * 100 : 0,
  };
}

/**
 * Get executions for a specific entity (e.g., all executions triggered by a specific email)
 */
export async function getExecutionsForEntity(
  db: AutomationDb,
  entityType: string,
  entityId: string,
  options?: { limit?: number }
) {
  const { limit = 20 } = options ?? {};

  return db.automationExecution.findMany({
    where: {
      triggerEntityType: entityType,
      triggerEntityId: entityId,
    },
    include: {
      automation: {
        select: {
          id: true,
          name: true,
          sourceModule: true,
        },
      },
    },
    orderBy: { createdAt: 'desc' },
    take: limit,
  });
}

/**
 * Clean up old execution records
 * Call this periodically to manage database size
 */
export async function cleanupOldExecutions(db: AutomationDb, retentionDays: number = 30) {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

  const result = await db.automationExecution.deleteMany({
    where: {
      createdAt: { lt: cutoffDate },
      status: { in: ['COMPLETED', 'SKIPPED'] },
    },
  });

  return { deletedCount: result.count };
}

/**
 * Mark stuck executions as failed
 * Useful for recovering from crashes
 */
export async function recoverStuckExecutions(db: AutomationDb, stuckThresholdMinutes: number = 30) {
  const cutoffTime = new Date();
  cutoffTime.setMinutes(cutoffTime.getMinutes() - stuckThresholdMinutes);

  const result = await db.automationExecution.updateMany({
    where: {
      status: 'PROCESSING',
      startedAt: { lt: cutoffTime },
    },
    data: {
      status: 'FAILED',
      errorMessage: 'Execution timed out - marked as failed during recovery',
      completedAt: new Date(),
    },
  });

  return { recoveredCount: result.count };
}
