// ===========================================
// TASK ENGINE — HEALTH ENGINE
// ===========================================
// Proactive monitoring of operational risk across tasks.
// ===========================================

import type { PrismaClient } from '@prisma/client';
import type { TaskHealthSignal, TaskHealthSummary } from './types';

/**
 * Get overdue tasks (past due date, not completed).
 */
export async function getOverdueTasks(
  db: PrismaClient,
  options?: { limit?: number }
) {
  return db.task.findMany({
    where: {
      dueDate: { lt: new Date() },
      status: { not: 'COMPLETED' },
    },
    take: options?.limit ?? 50,
    orderBy: { dueDate: 'asc' },
    select: { id: true, title: true, dueDate: true, priority: true, status: true, assignedToId: true },
  });
}

/**
 * Get tasks blocked for longer than N days.
 */
export async function getLongBlockedTasks(
  db: PrismaClient,
  thresholdDays: number = 3
) {
  const threshold = new Date();
  threshold.setDate(threshold.getDate() - thresholdDays);

  return db.task.findMany({
    where: {
      status: 'BLOCKED',
      updatedAt: { lt: threshold },
    },
    take: 50,
    orderBy: { updatedAt: 'asc' },
    select: { id: true, title: true, blockerReason: true, blockerType: true, updatedAt: true },
  });
}

/**
 * Get tasks approaching deadlines (due within N days).
 */
export async function getApproachingDeadlines(
  db: PrismaClient,
  withinDays: number = 3
) {
  const now = new Date();
  const deadline = new Date();
  deadline.setDate(deadline.getDate() + withinDays);

  return db.task.findMany({
    where: {
      dueDate: { gte: now, lte: deadline },
      status: { not: 'COMPLETED' },
    },
    take: 50,
    orderBy: { dueDate: 'asc' },
    select: { id: true, title: true, dueDate: true, priority: true, status: true },
  });
}

/**
 * Get unassigned tasks (no assignee set).
 */
export async function getUnassignedTasks(
  db: PrismaClient,
  options?: { limit?: number }
) {
  return db.task.findMany({
    where: {
      assignedToId: null,
      status: { not: 'COMPLETED' },
    },
    take: options?.limit ?? 50,
    orderBy: { createdAt: 'desc' },
    select: { id: true, title: true, priority: true, status: true, createdAt: true },
  });
}

/**
 * Get tasks without success criteria.
 */
export async function getTasksWithoutCriteria(
  db: PrismaClient,
  options?: { limit?: number }
) {
  return db.task.findMany({
    where: {
      successCriteria: null,
      status: { not: 'COMPLETED' },
    },
    take: options?.limit ?? 50,
    orderBy: { createdAt: 'desc' },
    select: { id: true, title: true, priority: true, status: true },
  });
}

/**
 * Get dependency risks: tasks with incomplete dependencies approaching deadline.
 */
export async function getDependencyRisks(db: PrismaClient) {
  const threeDays = new Date();
  threeDays.setDate(threeDays.getDate() + 3);

  // Tasks due within 3 days that have incomplete dependencies
  const atRisk = await db.task.findMany({
    where: {
      dueDate: { lte: threeDays },
      status: { not: 'COMPLETED' },
      dependsOn: {
        some: {
          dependencyTask: {
            status: { not: 'COMPLETED' },
          },
        },
      },
    },
    take: 20,
    include: {
      dependsOn: {
        include: {
          dependencyTask: {
            select: { id: true, title: true, status: true },
          },
        },
      },
    },
  });

  return atRisk.map((task) => ({
    id: task.id,
    title: task.title,
    dueDate: task.dueDate,
    blockingDependencies: task.dependsOn
      .filter((d) => d.dependencyTask.status !== 'COMPLETED')
      .map((d) => ({
        id: d.dependencyTask.id,
        title: d.dependencyTask.title,
        status: d.dependencyTask.status,
      })),
  }));
}

/**
 * Get all health signals combined (for agent context).
 */
export async function getHealthSignals(db: PrismaClient): Promise<TaskHealthSignal[]> {
  const [
    overdue,
    longBlocked,
    approaching,
    unassigned,
    noCriteria,
    depRisks,
    unsatisfiedIntents,
  ] = await Promise.all([
    getOverdueTasks(db, { limit: 10 }),
    getLongBlockedTasks(db),
    getApproachingDeadlines(db),
    getUnassignedTasks(db, { limit: 10 }),
    getTasksWithoutCriteria(db, { limit: 10 }),
    getDependencyRisks(db),
    db.taskIntent.findMany({
      where: { status: { in: ['ACTIVE', 'IN_PROGRESS'] } },
      take: 10,
      select: { id: true, title: true },
    }),
  ]);

  const signals: TaskHealthSignal[] = [];

  if (overdue.length > 0) {
    signals.push({
      type: 'overdue',
      count: overdue.length,
      severity: 'error',
      tasks: overdue.map((t) => ({ id: t.id, title: t.title })),
    });
  }

  if (longBlocked.length > 0) {
    signals.push({
      type: 'long_blocked',
      count: longBlocked.length,
      severity: 'warning',
      tasks: longBlocked.map((t) => ({ id: t.id, title: t.title })),
    });
  }

  if (approaching.length > 0) {
    signals.push({
      type: 'approaching_deadline',
      count: approaching.length,
      severity: 'warning',
      tasks: approaching.map((t) => ({ id: t.id, title: t.title })),
    });
  }

  if (unassigned.length > 0) {
    signals.push({
      type: 'unassigned',
      count: unassigned.length,
      severity: 'info',
      tasks: unassigned.map((t) => ({ id: t.id, title: t.title })),
    });
  }

  if (noCriteria.length > 0) {
    signals.push({
      type: 'no_criteria',
      count: noCriteria.length,
      severity: 'info',
      tasks: noCriteria.map((t) => ({ id: t.id, title: t.title })),
    });
  }

  if (depRisks.length > 0) {
    signals.push({
      type: 'dependency_risk',
      count: depRisks.length,
      severity: 'error',
      tasks: depRisks.map((t) => ({ id: t.id, title: t.title })),
    });
  }

  if (unsatisfiedIntents.length > 0) {
    signals.push({
      type: 'unsatisfied_intent',
      count: unsatisfiedIntents.length,
      severity: 'warning',
      tasks: unsatisfiedIntents.map((t) => ({ id: t.id, title: t.title })),
    });
  }

  return signals;
}

/**
 * Aggregate health summary.
 */
export async function getHealthSummary(
  db: PrismaClient,
  options?: { assignedToId?: string }
): Promise<TaskHealthSummary> {
  const where: Record<string, unknown> = {};
  if (options?.assignedToId) where.assignedToId = options.assignedToId;

  const [signals, totalOpen, totalOverdue, totalBlocked, totalUnsatisfied] = await Promise.all([
    getHealthSignals(db),
    db.task.count({ where: { ...where, status: { not: 'COMPLETED' } } }),
    db.task.count({ where: { ...where, dueDate: { lt: new Date() }, status: { not: 'COMPLETED' } } }),
    db.task.count({ where: { ...where, status: 'BLOCKED' } }),
    db.taskIntent.count({ where: { status: { in: ['ACTIVE', 'IN_PROGRESS'] } } }),
  ]);

  return {
    signals,
    totalOpen,
    totalOverdue,
    totalBlocked,
    totalUnsatisfiedIntents: totalUnsatisfied,
  };
}
