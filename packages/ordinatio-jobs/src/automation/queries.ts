// ===========================================
// AUTOMATION SERVICE
// ===========================================
// CRUD operations for automations.
// Manages the lifecycle of user-configurable workflows.
//
// This file provides query operations and re-exports CRUD
// operations from automation-crud.ts.
// ===========================================
// DEPENDS ON: automation-crud, automation-types, errors, types
// USED BY: API routes, trigger-registry
// ===========================================

import type { AutomationDb, AutomationModule, ExecutionStatus } from './db-types';
import { AutomationNotFoundError } from './errors';

// Re-export types
export type {
  CreateAutomationInput,
  UpdateAutomationInput,
  CreateTriggerInput,
  CreateConditionInput,
  CreateActionInput,
  AutomationListItem,
  AutomationListResult,
} from './automation-types';

// Re-export CRUD operations
export {
  createAutomation,
  updateAutomation,
  deleteAutomation,
  toggleAutomation,
} from './crud';

// Re-export error for API routes
export { AutomationNotFoundError };

// Type exports
export type AutomationWithRelations = Awaited<ReturnType<typeof getAutomationById>>;

/**
 * Get all automations with basic relations and pagination
 */
export async function getAllAutomations(db: AutomationDb, filters?: {
  sourceModule?: AutomationModule;
  isActive?: boolean;
  search?: string;
  limit?: number;
  offset?: number;
}) {
  const { sourceModule, isActive, search, limit = 20, offset = 0 } = filters ?? {};

  const where: Record<string, unknown> = {};

  if (sourceModule) {
    where.sourceModule = sourceModule;
  }

  if (isActive !== undefined) {
    where.isActive = isActive;
  }

  if (search) {
    where.OR = [
      { name: { contains: search, mode: 'insensitive' } },
      { description: { contains: search, mode: 'insensitive' } },
    ];
  }

  const [automations, total] = await Promise.all([
    db.automation.findMany({
      where,
      include: {
        trigger: true,
        _count: {
          select: {
            conditions: true,
            actions: true,
            executions: true,
          },
        },
      },
      orderBy: [{ sourceModule: 'asc' }, { priority: 'desc' }, { name: 'asc' }],
      take: limit,
      skip: offset,
    }),
    db.automation.count({ where }),
  ]);

  return { automations, total };
}

/**
 * Get a single automation with all relations
 */
export async function getAutomationById(db: AutomationDb, id: string) {
  const automation = await db.automation.findUnique({
    where: { id },
    include: {
      trigger: true,
      conditions: {
        orderBy: [{ groupIndex: 'asc' }, { sortOrder: 'asc' }],
      },
      actions: {
        orderBy: { sortOrder: 'asc' },
      },
    },
  });

  if (!automation) {
    throw new AutomationNotFoundError(id);
  }

  return automation;
}

/**
 * Get automations by trigger event type
 * Used by trigger-registry to find matching automations
 */
export async function getAutomationsByTriggerEvent(
  db: AutomationDb,
  eventType: string,
  sourceModule?: AutomationModule
) {
  return db.automation.findMany({
    where: {
      isActive: true,
      trigger: {
        eventType: eventType as never,
      },
      ...(sourceModule && { sourceModule }),
    },
    include: {
      trigger: true,
      conditions: {
        orderBy: [{ groupIndex: 'asc' }, { sortOrder: 'asc' }],
      },
      actions: {
        orderBy: { sortOrder: 'asc' },
      },
    },
    orderBy: { priority: 'desc' },
  });
}

/**
 * Get execution history for an automation
 */
export async function getAutomationExecutions(
  db: AutomationDb,
  automationId: string,
  options?: {
    status?: ExecutionStatus;
    limit?: number;
    offset?: number;
  }
) {
  const { status, limit = 50, offset = 0 } = options ?? {};

  // Verify automation exists
  const existing = await db.automation.findUnique({
    where: { id: automationId },
    select: { id: true },
  });

  if (!existing) {
    throw new AutomationNotFoundError(automationId);
  }

  const where: Record<string, unknown> = {
    automationId,
    ...(status && { status }),
  };

  const [executions, total] = await Promise.all([
    db.automationExecution.findMany({
      where,
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
