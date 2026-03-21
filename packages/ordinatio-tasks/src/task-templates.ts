// ===========================================
// TASK ENGINE — TEMPLATES & WORKFLOW BLUEPRINTS
// ===========================================
// Reusable workflow definitions with tasks, subtasks,
// dependencies, and intents.
// ===========================================

import type { PrismaClient, Prisma } from '@prisma/client';
import { TemplateNotFoundError } from './types';
import type {
  CreateTemplateInput,
  InstantiateTemplateInput,
  TemplateDefinition,
  TemplateTaskSpec,
  TemplateIntentSpec,
  DependencyType,
} from './types';

/**
 * Create a reusable task template.
 */
export async function createTemplate(
  db: PrismaClient,
  input: CreateTemplateInput
) {
  return db.taskTemplate.create({
    data: {
      name: input.name,
      description: input.description,
      category: input.category,
      definition: input.definition as unknown as Prisma.InputJsonValue,
      triggerEntityType: input.triggerEntityType,
      triggerEnabled: input.triggerEnabled ?? false,
      createdBy: input.createdBy,
    },
  });
}

/**
 * Update a template's definition.
 */
export async function updateTemplate(
  db: PrismaClient,
  templateId: string,
  input: Partial<Omit<CreateTemplateInput, 'createdBy'>>
) {
  const template = await db.taskTemplate.findUnique({ where: { id: templateId } });
  if (!template) throw new TemplateNotFoundError(templateId);

  return db.taskTemplate.update({
    where: { id: templateId },
    data: {
      ...(input.name !== undefined && { name: input.name }),
      ...(input.description !== undefined && { description: input.description }),
      ...(input.category !== undefined && { category: input.category }),
      ...(input.definition !== undefined && { definition: input.definition as unknown as Prisma.InputJsonValue }),
      ...(input.triggerEntityType !== undefined && { triggerEntityType: input.triggerEntityType }),
      ...(input.triggerEnabled !== undefined && { triggerEnabled: input.triggerEnabled }),
    },
  });
}

/**
 * Delete a template.
 */
export async function deleteTemplate(db: PrismaClient, templateId: string): Promise<void> {
  const template = await db.taskTemplate.findUnique({ where: { id: templateId } });
  if (!template) throw new TemplateNotFoundError(templateId);

  await db.taskTemplate.delete({ where: { id: templateId } });
}

/**
 * Get a template by ID.
 */
export async function getTemplate(db: PrismaClient, templateId: string) {
  const template = await db.taskTemplate.findUnique({ where: { id: templateId } });
  if (!template) throw new TemplateNotFoundError(templateId);
  return template;
}

/**
 * List templates.
 */
export async function getTemplates(
  db: PrismaClient,
  options?: { category?: string; limit?: number }
) {
  const where: Record<string, unknown> = {};
  if (options?.category) where.category = options.category;

  return db.taskTemplate.findMany({
    where,
    take: options?.limit ?? 50,
    orderBy: { name: 'asc' },
  });
}

/**
 * Find templates that should auto-trigger for an entity type.
 */
export async function getTemplatesForTrigger(db: PrismaClient, entityType: string) {
  return db.taskTemplate.findMany({
    where: {
      triggerEntityType: entityType,
      triggerEnabled: true,
    },
    take: 20,
  });
}

/**
 * Instantiate a template: create tasks (and optionally intents)
 * from the template definition. Resolves dependencies and applies
 * due date offsets.
 */
export async function instantiateTemplate(
  db: PrismaClient,
  templateId: string,
  params: InstantiateTemplateInput
): Promise<{ taskIds: string[]; intentIds: string[] }> {
  const template = await db.taskTemplate.findUnique({ where: { id: templateId } });
  if (!template) throw new TemplateNotFoundError(templateId);

  const definition = template.definition as unknown as TemplateDefinition;
  const now = new Date();
  const taskIds: string[] = [];
  const intentIds: string[] = [];

  // Map from template keys to created IDs
  const taskKeyToId = new Map<string, string>();
  const intentKeyToId = new Map<string, string>();

  // 1. Create intents first (tasks may reference them)
  if (definition.intents) {
    for (const intentSpec of definition.intents) {
      const intent = await db.taskIntent.create({
        data: {
          title: intentSpec.title,
          description: intentSpec.description,
          successCriteria: intentSpec.successCriteria as Prisma.InputJsonValue,
          acceptableMethods: intentSpec.acceptableMethods ?? [],
          entityType: params.entityType,
          entityId: params.entityId,
          templateId,
          status: 'PROPOSED',
          createdBy: params.createdBy,
        },
      });
      intentKeyToId.set(intentSpec.key, intent.id);
      intentIds.push(intent.id);
    }

    // Wire intent dependencies
    for (const intentSpec of definition.intents) {
      if (intentSpec.dependsOn) {
        for (const depKey of intentSpec.dependsOn) {
          const depId = intentKeyToId.get(depKey);
          const thisId = intentKeyToId.get(intentSpec.key);
          if (depId && thisId) {
            await db.intentDependency.create({
              data: { dependentIntentId: thisId, requiredIntentId: depId },
            });
          }
        }
      }
    }
  }

  // 2. Create tasks (recursive for subtasks)
  async function createTaskFromSpec(
    spec: TemplateTaskSpec,
    parentId?: string
  ): Promise<string> {
    const dueDate = spec.dueDateOffset
      ? new Date(now.getTime() + spec.dueDateOffset * 24 * 60 * 60 * 1000)
      : undefined;

    const assigneeId = spec.assigneeRole && params.assigneeMap
      ? params.assigneeMap[spec.assigneeRole]
      : undefined;

    const intentId = spec.intentKey
      ? intentKeyToId.get(spec.intentKey)
      : undefined;

    const task = await db.task.create({
      data: {
        title: spec.title,
        description: spec.description,
        priority: (spec.priority as 'URGENT' | 'HIGH' | 'MEDIUM' | 'LOW') ?? 'MEDIUM',
        successCriteria: spec.successCriteria,
        assignedToId: assigneeId,
        dueDate,
        tags: spec.tags ?? [],
        parentTaskId: parentId,
        intentId,
        templateId,
        entityType: params.entityType,
        entityId: params.entityId,
        status: 'OPEN',
        createdBy: params.createdBy,
      },
    });

    taskKeyToId.set(spec.key, task.id);
    taskIds.push(task.id);

    // Create subtasks
    if (spec.subtasks) {
      for (const sub of spec.subtasks) {
        await createTaskFromSpec(sub, task.id);
      }
    }

    return task.id;
  }

  for (const taskSpec of definition.tasks) {
    await createTaskFromSpec(taskSpec);
  }

  // 3. Wire task dependencies
  for (const taskSpec of definition.tasks) {
    await wireDependencies(db, taskSpec, taskKeyToId);
  }

  return { taskIds, intentIds };
}

async function wireDependencies(
  db: PrismaClient,
  spec: TemplateTaskSpec,
  keyToId: Map<string, string>
) {
  if (spec.dependsOn) {
    const thisId = keyToId.get(spec.key);
    if (!thisId) return;

    for (const depKey of spec.dependsOn) {
      const depId = keyToId.get(depKey);
      if (depId) {
        await db.taskDependency.create({
          data: {
            dependentTaskId: thisId,
            dependencyTaskId: depId,
            type: (spec.dependencyType as DependencyType) ?? 'FINISH_START',
          },
        });
      }
    }
  }

  // Recurse into subtasks
  if (spec.subtasks) {
    for (const sub of spec.subtasks) {
      await wireDependencies(db, sub, keyToId);
    }
  }
}
