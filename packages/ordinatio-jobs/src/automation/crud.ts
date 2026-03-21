// ===========================================
// AUTOMATION CRUD OPERATIONS
// ===========================================
// Create, update, and delete operations for automations.
// Handles atomic updates with transaction support.
// ===========================================
// DEPENDS ON: errors, automation-types
// USED BY: automation-queries.ts
// ===========================================

import type { AutomationDb, AutomationTxClient, InputJsonValue } from './db-types';
import { AutomationNotFoundError } from './errors';
import type {
  CreateAutomationInput,
  UpdateAutomationInput,
} from './automation-types';

/**
 * Create a new automation with trigger, conditions, and actions
 */
export async function createAutomation(db: AutomationDb, input: CreateAutomationInput) {
  return db.automation.create({
    data: {
      name: input.name,
      description: input.description,
      sourceModule: input.sourceModule,
      isActive: input.isActive ?? true,
      priority: input.priority ?? 0,
      maxExecutionsPerHour: input.maxExecutionsPerHour,
      cooldownSeconds: input.cooldownSeconds ?? 0,
      createdBy: input.createdBy,
      trigger: input.trigger
        ? {
            create: {
              eventType: input.trigger.eventType,
              config: (input.trigger.config ?? {}) as InputJsonValue,
            },
          }
        : undefined,
      conditions: input.conditions?.length
        ? {
            create: input.conditions.map((c, index) => ({
              groupIndex: c.groupIndex ?? 0,
              field: c.field,
              comparator: c.comparator,
              value: c.value,
              valueType: c.valueType ?? 'STRING',
              sortOrder: c.sortOrder ?? index,
            })),
          }
        : undefined,
      actions: input.actions?.length
        ? {
            create: input.actions.map((a, index) => ({
              actionType: a.actionType,
              sortOrder: a.sortOrder ?? index,
              config: (a.config ?? {}) as InputJsonValue,
              useOutputFrom: a.useOutputFrom,
              continueOnError: a.continueOnError ?? false,
            })),
          }
        : undefined,
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
  });
}

/**
 * Update an existing automation
 * Replaces trigger, conditions, and actions if provided
 */
export async function updateAutomation(db: AutomationDb, id: string, input: UpdateAutomationInput) {
  // Verify exists
  const existing = await db.automation.findUnique({
    where: { id },
    select: { id: true },
  });

  if (!existing) {
    throw new AutomationNotFoundError(id);
  }

  // Use transaction to update automation and replace relations atomically
  return db.$transaction(async (tx: AutomationTxClient) => {
    // Delete existing relations if we're replacing them
    if (input.trigger !== undefined) {
      await tx.automationTrigger.deleteMany({ where: { automationId: id } });
    }
    if (input.conditions !== undefined) {
      await tx.automationCondition.deleteMany({ where: { automationId: id } });
    }
    if (input.actions !== undefined) {
      await tx.automationAction.deleteMany({ where: { automationId: id } });
    }

    // Update the automation
    const updated = await tx.automation.update({
      where: { id },
      data: {
        ...(input.name !== undefined && { name: input.name }),
        ...(input.description !== undefined && { description: input.description }),
        ...(input.sourceModule !== undefined && { sourceModule: input.sourceModule }),
        ...(input.isActive !== undefined && { isActive: input.isActive }),
        ...(input.priority !== undefined && { priority: input.priority }),
        ...(input.maxExecutionsPerHour !== undefined && {
          maxExecutionsPerHour: input.maxExecutionsPerHour,
        }),
        ...(input.cooldownSeconds !== undefined && { cooldownSeconds: input.cooldownSeconds }),
        trigger: input.trigger
          ? {
              create: {
                eventType: input.trigger.eventType,
                config: (input.trigger.config ?? {}) as InputJsonValue,
              },
            }
          : undefined,
        conditions: input.conditions?.length
          ? {
              create: input.conditions.map((c, index) => ({
                groupIndex: c.groupIndex ?? 0,
                field: c.field,
                comparator: c.comparator,
                value: c.value,
                valueType: c.valueType ?? 'STRING',
                sortOrder: c.sortOrder ?? index,
              })),
            }
          : undefined,
        actions: input.actions?.length
          ? {
              create: input.actions.map((a, index) => ({
                actionType: a.actionType,
                sortOrder: a.sortOrder ?? index,
                config: (a.config ?? {}) as InputJsonValue,
                useOutputFrom: a.useOutputFrom,
                continueOnError: a.continueOnError ?? false,
              })),
            }
          : undefined,
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
    });

    return updated;
  });
}

/**
 * Delete an automation and all its relations
 */
export async function deleteAutomation(db: AutomationDb, id: string) {
  const existing = await db.automation.findUnique({
    where: { id },
    select: { id: true },
  });

  if (!existing) {
    throw new AutomationNotFoundError(id);
  }

  // Cascade delete handles relations
  await db.automation.delete({
    where: { id },
  });

  return { success: true };
}

/**
 * Toggle automation active state
 * If isActive is not provided, flips the current state
 */
export async function toggleAutomation(db: AutomationDb, id: string, isActive?: boolean) {
  const existing = await db.automation.findUnique({
    where: { id },
    select: { id: true, isActive: true },
  });

  if (!existing) {
    throw new AutomationNotFoundError(id);
  }

  const newState = isActive !== undefined ? isActive : !existing.isActive;

  return db.automation.update({
    where: { id },
    data: { isActive: newState },
    include: {
      trigger: true,
    },
  });
}
