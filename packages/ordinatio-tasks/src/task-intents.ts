// ===========================================
// TASK ENGINE — INTENTS (OUTCOME-DRIVEN WORK)
// ===========================================
// Tasks represent actions. Intents represent desired outcomes.
// An intent can spawn multiple execution tasks.
// Completion requires verifying success criteria programmatically.
// ===========================================

import type { PrismaClient, Prisma } from '@prisma/client';
import {
  IntentNotFoundError,
  IntentCriteriaNotMetError,
  InvalidStatusTransitionError,
} from './types';
import type {
  CreateIntentInput,
  SatisfyIntentInput,
  CreateTaskInput,
  MutationCallbacks,
} from './types';

/**
 * Create a new intent with structured success criteria.
 */
export async function createIntent(
  db: PrismaClient,
  input: CreateIntentInput,
  callbacks?: MutationCallbacks
) {
  const intent = await db.taskIntent.create({
    data: {
      title: input.title,
      description: input.description,
      successCriteria: input.successCriteria as Prisma.InputJsonValue,
      acceptableMethods: input.acceptableMethods ?? [],
      entityType: input.entityType,
      entityId: input.entityId,
      agentRole: input.agentRole,
      context: (input.context ?? undefined) as Prisma.InputJsonValue | undefined,
      templateId: input.templateId,
      status: 'PROPOSED',
      createdBy: input.createdBy,
    },
  });

  callbacks?.onEvent?.({
    eventType: 'INTENT_CREATED',
    entityType: 'intent',
    entityId: intent.id,
    data: {
      title: intent.title,
      entityType: intent.entityType,
      entityId: intent.entityId,
      createdBy: intent.createdBy,
    },
  });

  callbacks?.onActivity?.('INTENT_CREATED', `Created intent: "${intent.title}"`, {
    intentId: intent.id,
    intentTitle: intent.title,
    userId: input.createdBy,
  });

  return intent;
}

/**
 * Update an intent's fields.
 */
export async function updateIntent(
  db: PrismaClient,
  intentId: string,
  input: Partial<Pick<CreateIntentInput, 'title' | 'description' | 'successCriteria' | 'acceptableMethods'>>
) {
  const intent = await db.taskIntent.findUnique({ where: { id: intentId } });
  if (!intent) throw new IntentNotFoundError(intentId);

  return db.taskIntent.update({
    where: { id: intentId },
    data: {
      ...(input.title !== undefined && { title: input.title }),
      ...(input.description !== undefined && { description: input.description }),
      ...(input.successCriteria !== undefined && { successCriteria: input.successCriteria as Prisma.InputJsonValue }),
      ...(input.acceptableMethods !== undefined && { acceptableMethods: input.acceptableMethods }),
    },
  });
}

/**
 * Activate an intent: PROPOSED → ACTIVE.
 */
export async function activateIntent(
  db: PrismaClient,
  intentId: string,
  userId?: string
) {
  const intent = await db.taskIntent.findUnique({ where: { id: intentId } });
  if (!intent) throw new IntentNotFoundError(intentId);
  if (intent.status !== 'PROPOSED') {
    throw new InvalidStatusTransitionError(intent.status, 'ACTIVE');
  }

  return db.taskIntent.update({
    where: { id: intentId },
    data: { status: 'ACTIVE' },
  });
}

/**
 * Verify success criteria against verification data.
 * Returns true if ALL criteria keys match.
 */
export function checkCriteriaMet(
  criteria: Record<string, unknown>,
  verificationData: Record<string, unknown>
): { met: boolean; unmet: string[] } {
  const unmet: string[] = [];

  for (const [key, expected] of Object.entries(criteria)) {
    const actual = verificationData[key];
    if (actual !== expected) {
      unmet.push(key);
    }
  }

  return { met: unmet.length === 0, unmet };
}

/**
 * Satisfy an intent: verify criteria, mark SATISFIED if met.
 *
 * @throws {IntentNotFoundError}
 * @throws {IntentCriteriaNotMetError}
 */
export async function satisfyIntent(
  db: PrismaClient,
  intentId: string,
  input: SatisfyIntentInput,
  callbacks?: MutationCallbacks
) {
  const intent = await db.taskIntent.findUnique({ where: { id: intentId } });
  if (!intent) throw new IntentNotFoundError(intentId);

  const validStatuses = ['ACTIVE', 'IN_PROGRESS'];
  if (!validStatuses.includes(intent.status)) {
    throw new InvalidStatusTransitionError(intent.status, 'SATISFIED');
  }

  // Check criteria
  const criteria = intent.successCriteria as Record<string, unknown>;
  const check = checkCriteriaMet(criteria, input.verificationData);

  if (!check.met) {
    throw new IntentCriteriaNotMetError(intentId, `Unmet criteria: ${check.unmet.join(', ')}`);
  }

  const updated = await db.taskIntent.update({
    where: { id: intentId },
    data: {
      status: 'SATISFIED',
      satisfiedAt: new Date(),
      satisfiedBy: input.userId,
      verificationData: input.verificationData as Prisma.InputJsonValue,
    },
  });

  callbacks?.onEvent?.({
    eventType: 'INTENT_SATISFIED',
    entityType: 'intent',
    entityId: intentId,
    data: {
      title: intent.title,
      satisfiedBy: input.userId,
      entityType: intent.entityType,
      entityId: intent.entityId,
    },
  });

  callbacks?.onActivity?.('INTENT_SATISFIED', `Intent satisfied: "${intent.title}"`, {
    intentId,
    intentTitle: intent.title,
    userId: input.userId,
  });

  return updated;
}

/**
 * Mark an intent as failed.
 */
export async function failIntent(
  db: PrismaClient,
  intentId: string,
  reason: string,
  userId?: string,
  callbacks?: MutationCallbacks
) {
  const intent = await db.taskIntent.findUnique({ where: { id: intentId } });
  if (!intent) throw new IntentNotFoundError(intentId);

  const updated = await db.taskIntent.update({
    where: { id: intentId },
    data: {
      status: 'FAILED',
      failedAt: new Date(),
      failureReason: reason,
    },
  });

  callbacks?.onEvent?.({
    eventType: 'INTENT_FAILED',
    entityType: 'intent',
    entityId: intentId,
    data: {
      title: intent.title,
      reason,
      userId,
    },
  });

  callbacks?.onActivity?.('INTENT_FAILED', `Intent failed: "${intent.title}" — ${reason}`, {
    intentId,
    intentTitle: intent.title,
    userId,
  });

  return updated;
}

/**
 * Get an intent with tasks and dependencies.
 */
export async function getIntent(db: PrismaClient, intentId: string) {
  const intent = await db.taskIntent.findUnique({
    where: { id: intentId },
    include: {
      tasks: {
        select: { id: true, title: true, status: true, priority: true },
        orderBy: { createdAt: 'asc' },
      },
      dependsOn: {
        include: {
          requiredIntent: {
            select: { id: true, title: true, status: true },
          },
        },
      },
      dependedOnBy: {
        include: {
          dependentIntent: {
            select: { id: true, title: true, status: true },
          },
        },
      },
    },
  });

  if (!intent) throw new IntentNotFoundError(intentId);
  return intent;
}

/**
 * List/filter intents.
 */
export async function getIntents(
  db: PrismaClient,
  options?: {
    status?: string;
    entityType?: string;
    entityId?: string;
    agentRole?: string;
    limit?: number;
    offset?: number;
  }
) {
  const where: Record<string, unknown> = {};
  if (options?.status) where.status = options.status;
  if (options?.entityType) where.entityType = options.entityType;
  if (options?.entityId) where.entityId = options.entityId;
  if (options?.agentRole) where.agentRole = options.agentRole;

  const [intents, total] = await Promise.all([
    db.taskIntent.findMany({
      where,
      take: options?.limit ?? 50,
      skip: options?.offset ?? 0,
      orderBy: { createdAt: 'desc' },
      include: {
        tasks: {
          select: { id: true, title: true, status: true },
        },
      },
    }),
    db.taskIntent.count({ where }),
  ]);

  return { intents, total };
}

/**
 * Get all intents for an entity.
 */
export async function getIntentsForEntity(
  db: PrismaClient,
  entityType: string,
  entityId: string
) {
  return db.taskIntent.findMany({
    where: { entityType, entityId },
    orderBy: { createdAt: 'desc' },
    include: {
      tasks: {
        select: { id: true, title: true, status: true },
      },
    },
  });
}

/**
 * Get active intents not yet satisfied.
 */
export async function getUnsatisfiedIntents(
  db: PrismaClient,
  options?: { agentRole?: string; entityType?: string; limit?: number }
) {
  const where: Record<string, unknown> = {
    status: { in: ['ACTIVE', 'IN_PROGRESS'] },
  };
  if (options?.agentRole) where.agentRole = options.agentRole;
  if (options?.entityType) where.entityType = options.entityType;

  return db.taskIntent.findMany({
    where,
    take: options?.limit ?? 20,
    orderBy: { createdAt: 'asc' },
    include: {
      tasks: {
        select: { id: true, title: true, status: true },
      },
    },
  });
}

/**
 * Add an intent dependency.
 */
export async function addIntentDependency(
  db: PrismaClient,
  dependentIntentId: string,
  requiredIntentId: string
) {
  if (dependentIntentId === requiredIntentId) {
    throw new Error('An intent cannot depend on itself');
  }

  // Verify both exist
  const [dep, req] = await Promise.all([
    db.taskIntent.findUnique({ where: { id: dependentIntentId }, select: { id: true } }),
    db.taskIntent.findUnique({ where: { id: requiredIntentId }, select: { id: true } }),
  ]);
  if (!dep) throw new IntentNotFoundError(dependentIntentId);
  if (!req) throw new IntentNotFoundError(requiredIntentId);

  return db.intentDependency.create({
    data: { dependentIntentId, requiredIntentId },
  });
}

/**
 * Remove an intent dependency.
 */
export async function removeIntentDependency(
  db: PrismaClient,
  dependentIntentId: string,
  requiredIntentId: string
) {
  await db.intentDependency.deleteMany({
    where: { dependentIntentId, requiredIntentId },
  });
}

/**
 * Spawn execution tasks linked to an intent.
 */
export async function spawnTasksForIntent(
  db: PrismaClient,
  intentId: string,
  tasks: Array<Omit<CreateTaskInput, 'intentId' | 'createdBy'> & { createdBy?: string }>,
  createdBy: string
): Promise<string[]> {
  const intent = await db.taskIntent.findUnique({ where: { id: intentId } });
  if (!intent) throw new IntentNotFoundError(intentId);

  // Move intent to IN_PROGRESS if it's ACTIVE
  if (intent.status === 'ACTIVE') {
    await db.taskIntent.update({
      where: { id: intentId },
      data: { status: 'IN_PROGRESS' },
    });
  }

  const taskIds: string[] = [];
  for (const taskInput of tasks) {
    const task = await db.task.create({
      data: {
        title: taskInput.title,
        description: taskInput.description,
        notes: taskInput.notes,
        successCriteria: taskInput.successCriteria,
        priority: taskInput.priority || 'MEDIUM',
        entityType: taskInput.entityType ?? intent.entityType,
        entityId: taskInput.entityId ?? intent.entityId,
        assignedToId: taskInput.assignedToId,
        tags: taskInput.tags ?? [],
        intentId,
        status: 'OPEN',
        createdBy: taskInput.createdBy || createdBy,
      },
    });
    taskIds.push(task.id);
  }

  return taskIds;
}
