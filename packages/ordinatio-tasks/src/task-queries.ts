// ===========================================
// TASK ENGINE — QUERIES
// ===========================================
// Read-only operations for tasks: get, list, count, search.
// ===========================================

import type { PrismaClient } from '@prisma/client';
import { TaskNotFoundError } from './types';
import type { GetTasksOptions, GetMyTasksOptions, TaskCounts } from './types';

// Priority sort order for deterministic work queues
const PRIORITY_ORDER = { URGENT: 0, HIGH: 1, MEDIUM: 2, LOW: 3 } as const;

/**
 * Get tasks (filterable by all fields).
 */
export async function getTasks(db: PrismaClient, options?: GetTasksOptions) {
  const { limit = 50, offset = 0 } = options ?? {};

  const where: Record<string, unknown> = {};
  if (options?.status) where.status = options.status;
  if (options?.assignedToId) where.assignedToId = options.assignedToId;
  if (options?.categoryId) where.categoryId = options.categoryId;
  if (options?.entityType) where.entityType = options.entityType;
  if (options?.entityId) where.entityId = options.entityId;
  if (options?.priority) where.priority = options.priority;
  if (options?.agentRole) where.agentRole = options.agentRole;
  if (options?.parentTaskId !== undefined) where.parentTaskId = options.parentTaskId;
  if (options?.templateId) where.templateId = options.templateId;
  if (options?.intentId) where.intentId = options.intentId;
  if (options?.tags && options.tags.length > 0) {
    where.tags = { hasSome: options.tags };
  }
  if (options?.dueBefore) {
    where.dueDate = { lte: options.dueBefore };
  }
  if (options?.overdue) {
    where.dueDate = { lt: new Date() };
    where.status = { not: 'COMPLETED' };
  }
  if (options?.hasBlocker) {
    where.status = 'BLOCKED';
  }

  // Default order: OPEN first, then by due date, then newest
  let orderBy: Record<string, string>[] = [
    { status: 'asc' },
    { dueDate: 'asc' },
    { createdAt: 'desc' },
  ];

  if (options?.orderBy === 'priority') {
    orderBy = [
      { priority: 'asc' },
      { dueDate: 'asc' },
      { createdAt: 'desc' },
    ];
  } else if (options?.orderBy === 'dueDate') {
    orderBy = [
      { dueDate: 'asc' },
      { createdAt: 'desc' },
    ];
  } else if (options?.orderBy === 'createdAt') {
    orderBy = [{ createdAt: 'desc' }];
  }

  const [tasks, total] = await Promise.all([
    db.task.findMany({
      where,
      orderBy,
      take: limit,
      skip: offset,
      include: {
        email: {
          select: {
            id: true,
            subject: true,
            fromEmail: true,
            fromName: true,
            snippet: true,
            emailDate: true,
            client: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
        assignedTo: {
          select: {
            id: true,
            name: true,
          },
        },
        category: {
          select: {
            id: true,
            name: true,
            color: true,
          },
        },
      },
    }),
    db.task.count({ where }),
  ]);

  return { tasks, total, limit, offset };
}

/**
 * Get a single task by ID with full relations.
 *
 * @throws {TaskNotFoundError}
 */
export async function getTask(db: PrismaClient, taskId: string) {
  const task = await db.task.findUnique({
    where: { id: taskId },
    include: {
      email: {
        include: {
          client: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
        },
      },
      assignedTo: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
      category: true,
      subtasks: {
        select: {
          id: true,
          title: true,
          status: true,
          priority: true,
          assignedToId: true,
          dueDate: true,
        },
        orderBy: { createdAt: 'asc' },
      },
      dependsOn: {
        include: {
          dependencyTask: {
            select: { id: true, title: true, status: true },
          },
        },
      },
      dependedOnBy: {
        include: {
          dependentTask: {
            select: { id: true, title: true, status: true },
          },
        },
      },
      intent: {
        select: {
          id: true,
          title: true,
          status: true,
          successCriteria: true,
        },
      },
    },
  });

  if (!task) {
    throw new TaskNotFoundError(taskId);
  }

  return task;
}

/**
 * Get task counts grouped by status.
 */
export async function getTaskCounts(db: PrismaClient, assignedToId?: string): Promise<TaskCounts> {
  const where: Record<string, unknown> = {};
  if (assignedToId) where.assignedToId = assignedToId;

  const counts = await db.task.groupBy({
    by: ['status'],
    where,
    _count: true,
  });

  type CountRow = (typeof counts)[number];
  return {
    open: counts.find((c: CountRow) => c.status === 'OPEN')?._count ?? 0,
    inProgress: counts.find((c: CountRow) => c.status === 'IN_PROGRESS')?._count ?? 0,
    blocked: counts.find((c: CountRow) => c.status === 'BLOCKED')?._count ?? 0,
    completed: counts.find((c: CountRow) => c.status === 'COMPLETED')?._count ?? 0,
    total: counts.reduce((sum: number, c: CountRow) => sum + c._count, 0),
  };
}

/**
 * Get tasks assigned to a specific user.
 */
export async function getMyTasks(
  db: PrismaClient,
  userId: string,
  options?: GetMyTasksOptions
) {
  const { includeCompleted = false, limit = 20 } = options ?? {};

  const where: Record<string, unknown> = {
    assignedToId: userId,
  };

  if (!includeCompleted) {
    where.status = { not: 'COMPLETED' };
  }

  return db.task.findMany({
    where,
    orderBy: [{ dueDate: 'asc' }, { createdAt: 'desc' }],
    take: limit,
    include: {
      email: {
        select: {
          id: true,
          subject: true,
          fromName: true,
          fromEmail: true,
          snippet: true,
        },
      },
    },
  });
}

/**
 * Get tasks linked to a specific entity.
 */
export async function getTasksForEntity(
  db: PrismaClient,
  entityType: string,
  entityId: string,
  options?: { status?: string; limit?: number }
) {
  const where: Record<string, unknown> = { entityType, entityId };
  if (options?.status) where.status = options.status;

  return db.task.findMany({
    where,
    orderBy: [{ status: 'asc' }, { priority: 'asc' }, { createdAt: 'desc' }],
    take: options?.limit ?? 50,
    include: {
      assignedTo: { select: { id: true, name: true } },
      category: { select: { id: true, name: true, color: true } },
    },
  });
}

/**
 * Get subtasks of a parent task.
 */
export async function getSubtasks(db: PrismaClient, parentTaskId: string) {
  return db.task.findMany({
    where: { parentTaskId },
    orderBy: [{ status: 'asc' }, { createdAt: 'asc' }],
    include: {
      assignedTo: { select: { id: true, name: true } },
    },
  });
}

/**
 * Get a prioritized agent work queue.
 * Order: overdue → urgent → due soon → high → medium → low
 */
export async function getAgentQueue(
  db: PrismaClient,
  agentRole?: string,
  options?: { limit?: number }
) {
  const where: Record<string, unknown> = {
    status: { in: ['OPEN', 'IN_PROGRESS'] },
  };
  if (agentRole) where.agentRole = agentRole;

  const tasks = await db.task.findMany({
    where,
    take: options?.limit ?? 20,
    include: {
      assignedTo: { select: { id: true, name: true } },
      dependsOn: {
        include: {
          dependencyTask: { select: { id: true, status: true } },
        },
      },
    },
  });

  // Sort: overdue first, then by priority, then due date
  const now = new Date();
  return tasks.sort((a, b) => {
    const aOverdue = a.dueDate && a.dueDate < now ? 1 : 0;
    const bOverdue = b.dueDate && b.dueDate < now ? 1 : 0;
    if (bOverdue !== aOverdue) return bOverdue - aOverdue; // overdue first

    const aPri = PRIORITY_ORDER[a.priority as keyof typeof PRIORITY_ORDER] ?? 2;
    const bPri = PRIORITY_ORDER[b.priority as keyof typeof PRIORITY_ORDER] ?? 2;
    if (aPri !== bPri) return aPri - bPri; // urgent first

    // Earlier due date first
    if (a.dueDate && b.dueDate) return a.dueDate.getTime() - b.dueDate.getTime();
    if (a.dueDate) return -1;
    if (b.dueDate) return 1;

    return b.createdAt.getTime() - a.createdAt.getTime(); // newest first
  });
}

/**
 * Full-text search across task titles and descriptions.
 */
export async function searchTasks(
  db: PrismaClient,
  query: string,
  options?: { limit?: number; status?: string }
) {
  const where: Record<string, unknown> = {
    OR: [
      { title: { contains: query, mode: 'insensitive' } },
      { description: { contains: query, mode: 'insensitive' } },
      { notes: { contains: query, mode: 'insensitive' } },
    ],
  };
  if (options?.status) where.status = options.status;

  return db.task.findMany({
    where,
    take: options?.limit ?? 20,
    orderBy: { createdAt: 'desc' },
    include: {
      assignedTo: { select: { id: true, name: true } },
      category: { select: { id: true, name: true, color: true } },
    },
  });
}
