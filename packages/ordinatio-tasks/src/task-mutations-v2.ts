// ===========================================
// TASK ENGINE — V2 WORKFLOW MUTATIONS
// ===========================================
// Extended status transitions: start, block, unblock,
// assign, complete-with-outcome, watchers.
// Split from task-mutations.ts for Rule 1 compliance.
// ===========================================
// DEPENDS ON: types.ts, task-history.ts, task-dependencies.ts
// USED BY: index.ts, service adapters, API routes
// ===========================================

import type { PrismaClient, Prisma } from '@prisma/client';
import {
  TaskNotFoundError,
  InvalidStatusTransitionError,
  DependencyNotMetError,
} from './types';
import type {
  CompleteTaskWithOutcomeInput,
  BlockTaskInput,
  MutationCallbacks,
} from './types';
import { recordHistory } from './task-history';
import { checkDependenciesMet } from './task-dependencies';

/**
 * Move task to IN_PROGRESS (checks dependencies).
 *
 * @throws {TaskNotFoundError}
 * @throws {InvalidStatusTransitionError}
 * @throws {DependencyNotMetError}
 */
export async function startTask(
  db: PrismaClient,
  taskId: string,
  userId: string,
  callbacks?: MutationCallbacks
): Promise<void> {
  const task = await db.task.findUnique({ where: { id: taskId } });
  if (!task) throw new TaskNotFoundError(taskId);
  if (task.status !== 'OPEN') throw new InvalidStatusTransitionError(task.status, 'IN_PROGRESS');

  // Check hard dependencies
  const depCheck = await checkDependenciesMet(db, taskId);
  if (!depCheck.met) throw new DependencyNotMetError(taskId);

  await db.task.update({
    where: { id: taskId },
    data: { status: 'IN_PROGRESS' },
  });

  await recordHistory(db, taskId, 'status_changed', 'status', 'OPEN', 'IN_PROGRESS', userId).catch(() => {});

  callbacks?.onEvent?.({
    eventType: 'TASK_STATUS_CHANGED',
    entityType: 'task',
    entityId: taskId,
    data: { from: 'OPEN', to: 'IN_PROGRESS', userId },
  });

  callbacks?.onActivity?.('TASK_STARTED', `Started task: "${task.title}"`, {
    taskId,
    taskTitle: task.title,
    userId,
  });
}

/**
 * Block a task with a reason.
 *
 * @throws {TaskNotFoundError}
 * @throws {InvalidStatusTransitionError}
 */
export async function blockTask(
  db: PrismaClient,
  taskId: string,
  input: BlockTaskInput,
  callbacks?: MutationCallbacks
): Promise<void> {
  const task = await db.task.findUnique({ where: { id: taskId } });
  if (!task) throw new TaskNotFoundError(taskId);
  if (task.status === 'COMPLETED') throw new InvalidStatusTransitionError(task.status, 'BLOCKED');

  const prevStatus = task.status;

  await db.task.update({
    where: { id: taskId },
    data: {
      status: 'BLOCKED',
      blockerReason: input.reason,
      blockerType: input.blockerType,
      blockerOwnerId: input.blockerOwnerId,
    },
  });

  await recordHistory(db, taskId, 'status_changed', 'status', prevStatus, 'BLOCKED', input.userId).catch(() => {});

  callbacks?.onEvent?.({
    eventType: 'TASK_BLOCKED',
    entityType: 'task',
    entityId: taskId,
    data: { from: prevStatus, reason: input.reason, blockerType: input.blockerType },
  });

  callbacks?.onActivity?.('TASK_BLOCKED', `Blocked task: "${task.title}" — ${input.reason}`, {
    taskId,
    taskTitle: task.title,
    userId: input.userId,
    blockerReason: input.reason,
  });
}

/**
 * Unblock a task.
 *
 * @throws {TaskNotFoundError}
 * @throws {InvalidStatusTransitionError}
 */
export async function unblockTask(
  db: PrismaClient,
  taskId: string,
  userId?: string,
  callbacks?: MutationCallbacks
): Promise<void> {
  const task = await db.task.findUnique({ where: { id: taskId } });
  if (!task) throw new TaskNotFoundError(taskId);
  if (task.status !== 'BLOCKED') throw new InvalidStatusTransitionError(task.status, 'OPEN');

  await db.task.update({
    where: { id: taskId },
    data: {
      status: 'OPEN',
      blockerReason: null,
      blockerType: null,
      blockerOwnerId: null,
    },
  });

  await recordHistory(db, taskId, 'status_changed', 'status', 'BLOCKED', 'OPEN', userId).catch(() => {});

  callbacks?.onActivity?.('TASK_UNBLOCKED', `Unblocked task: "${task.title}"`, {
    taskId,
    taskTitle: task.title,
    userId,
  });
}

/**
 * Assign a task to a user.
 *
 * @throws {TaskNotFoundError}
 */
export async function assignTask(
  db: PrismaClient,
  taskId: string,
  assigneeId: string,
  assignedBy?: string,
  callbacks?: MutationCallbacks
): Promise<void> {
  const task = await db.task.findUnique({ where: { id: taskId } });
  if (!task) throw new TaskNotFoundError(taskId);

  const prevAssignee = task.assignedToId;

  await db.task.update({
    where: { id: taskId },
    data: { assignedToId: assigneeId },
  });

  await recordHistory(db, taskId, 'assigned', 'assignedToId', prevAssignee, assigneeId, assignedBy).catch(() => {});

  callbacks?.onEvent?.({
    eventType: 'TASK_ASSIGNED',
    entityType: 'task',
    entityId: taskId,
    data: { assigneeId, assignedBy, previousAssignee: prevAssignee },
  });

  callbacks?.onActivity?.('TASK_ASSIGNED', `Assigned task: "${task.title}"`, {
    taskId,
    taskTitle: task.title,
    assignedToId: assigneeId,
    userId: assignedBy,
  });
}

/**
 * Complete a task with structured outcome.
 *
 * @throws {TaskNotFoundError}
 */
export async function completeTaskWithOutcome(
  db: PrismaClient,
  taskId: string,
  input: CompleteTaskWithOutcomeInput,
  callbacks?: MutationCallbacks
): Promise<void> {
  const task = await db.task.findUnique({
    where: { id: taskId },
    include: { email: { select: { clientId: true } } },
  });

  if (!task) throw new TaskNotFoundError(taskId);

  await db.task.update({
    where: { id: taskId },
    data: {
      status: 'COMPLETED',
      completedAt: new Date(),
      completedBy: input.userId,
      outcome: input.outcome,
      outcomeData: (input.outcomeData ?? undefined) as Prisma.InputJsonValue | undefined,
    },
  });

  await recordHistory(db, taskId, 'status_changed', 'status', task.status, 'COMPLETED', input.userId).catch(() => {});

  callbacks?.onEvent?.({
    eventType: 'TASK_COMPLETED',
    entityType: 'task',
    entityId: taskId,
    data: {
      title: task.title,
      completedBy: input.userId,
      outcome: input.outcome,
    },
  });

  callbacks?.onActivity?.('TASK_COMPLETED', `Completed task: "${task.title}" — ${input.outcome || 'done'}`, {
    taskId,
    taskTitle: task.title,
    userId: input.userId,
    clientId: task.email?.clientId,
    outcome: input.outcome,
  });

  // Check dependents
  const dependents = await db.taskDependency.findMany({
    where: { dependencyTaskId: taskId },
    select: { dependentTaskId: true },
  });
  for (const dep of dependents) {
    const depCheck = await checkDependenciesMet(db, dep.dependentTaskId);
    if (depCheck.met) {
      callbacks?.onEvent?.({
        eventType: 'TASK_DEPENDENCY_MET',
        entityType: 'task',
        entityId: dep.dependentTaskId,
        data: { completedDependency: taskId },
      });
    }
  }
}

/**
 * Add a watcher to a task.
 */
export async function addWatcher(db: PrismaClient, taskId: string, userId: string): Promise<void> {
  const task = await db.task.findUnique({ where: { id: taskId }, select: { watchers: true } });
  if (!task) throw new TaskNotFoundError(taskId);
  if (task.watchers.includes(userId)) return; // already watching

  await db.task.update({
    where: { id: taskId },
    data: { watchers: { push: userId } },
  });
}

/**
 * Remove a watcher from a task.
 */
export async function removeWatcher(db: PrismaClient, taskId: string, userId: string): Promise<void> {
  const task = await db.task.findUnique({ where: { id: taskId }, select: { watchers: true } });
  if (!task) throw new TaskNotFoundError(taskId);

  await db.task.update({
    where: { id: taskId },
    data: { watchers: task.watchers.filter((w) => w !== userId) },
  });
}
