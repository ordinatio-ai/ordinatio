// ===========================================
// TASK ENGINE — CORE MUTATIONS
// ===========================================
// Core write operations: create (email + generic),
// update, complete, reopen, delete.
// V2 workflow mutations (start, block, unblock, assign,
// watchers) are in task-mutations-v2.ts.
// ===========================================

import type { PrismaClient, Prisma } from '@prisma/client';
import {
  TaskNotFoundError,
  EmailNotFoundForTaskError,
} from './types';
import type {
  CreateTaskFromEmailInput,
  CreateTaskInput,
  UpdateTaskInput,
  CreateTaskResult,
  MutationCallbacks,
} from './types';
import { recordHistory } from './task-history';
import { checkDependenciesMet } from './task-dependencies';

/**
 * Create a follow-up task from an email message (legacy).
 *
 * @throws {EmailNotFoundForTaskError} If the email ID doesn't exist
 */
export async function createTaskFromEmail(
  db: PrismaClient,
  params: CreateTaskFromEmailInput,
  callbacks?: MutationCallbacks
): Promise<CreateTaskResult> {
  const { emailId, title, notes, assignedToId, dueDate, categoryId, createdBy } = params;

  const email = await db.emailMessage.findUnique({
    where: { id: emailId },
    select: { id: true, subject: true, clientId: true },
  });

  if (!email) {
    throw new EmailNotFoundForTaskError(emailId);
  }

  const task = await db.task.create({
    data: {
      emailId,
      title: title || email.subject,
      notes,
      assignedToId,
      dueDate,
      categoryId,
      createdBy,
      status: 'OPEN',
      priority: 'MEDIUM',
    },
  });

  await recordHistory(db, task.id, 'created', undefined, undefined, undefined, createdBy).catch(() => {});

  callbacks?.onEvent?.({
    eventType: 'TASK_CREATED',
    entityType: 'task',
    entityId: task.id,
    data: {
      title: task.title,
      emailId: task.emailId,
      assignedToId: task.assignedToId,
      dueDate: task.dueDate?.toISOString() ?? null,
      categoryId: task.categoryId,
      createdBy: task.createdBy,
      clientId: email.clientId,
    },
  });

  callbacks?.onActivity?.('EMAIL_TASK_CREATED', `Created task: "${task.title}" from email`, {
    taskId: task.id,
    taskTitle: task.title,
    emailId,
    userId: createdBy,
    clientId: email.clientId,
    assignedToId: task.assignedToId,
  });

  return {
    id: task.id,
    title: task.title,
    assignedToId: task.assignedToId,
    email: { clientId: email.clientId },
  };
}

/**
 * Create an entity-agnostic task (new API).
 */
export async function createTask(
  db: PrismaClient,
  params: CreateTaskInput,
  callbacks?: MutationCallbacks
): Promise<{ id: string; title: string }> {
  const task = await db.task.create({
    data: {
      title: params.title,
      description: params.description,
      notes: params.notes,
      successCriteria: params.successCriteria,
      priority: params.priority || 'MEDIUM',
      entityType: params.entityType,
      entityId: params.entityId,
      emailId: params.emailId,
      assignedToId: params.assignedToId,
      watchers: params.watchers || [],
      dueDate: params.dueDate,
      categoryId: params.categoryId,
      parentTaskId: params.parentTaskId,
      intentId: params.intentId,
      templateId: params.templateId,
      tags: params.tags || [],
      agentRole: params.agentRole,
      context: (params.context ?? undefined) as Prisma.InputJsonValue | undefined,
      createdBy: params.createdBy,
      status: 'OPEN',
    },
  });

  await recordHistory(db, task.id, 'created', undefined, undefined, undefined, params.createdBy).catch(() => {});

  callbacks?.onEvent?.({
    eventType: 'TASK_CREATED',
    entityType: 'task',
    entityId: task.id,
    data: {
      title: task.title,
      priority: task.priority,
      entityType: task.entityType,
      entityId: task.entityId,
      assignedToId: task.assignedToId,
      createdBy: task.createdBy,
    },
  });

  callbacks?.onActivity?.('TASK_CREATED', `Created task: "${task.title}"`, {
    taskId: task.id,
    taskTitle: task.title,
    userId: params.createdBy,
    assignedToId: task.assignedToId,
  });

  return { id: task.id, title: task.title };
}

/**
 * Update a task's fields.
 *
 * @throws {TaskNotFoundError} If the task doesn't exist
 */
export async function updateTask(
  db: PrismaClient,
  taskId: string,
  data: UpdateTaskInput,
  options?: {
    userId?: string;
    logActivity?: boolean;
  },
  callbacks?: MutationCallbacks
): Promise<void> {
  const task = await db.task.findUnique({
    where: { id: taskId },
    include: {
      email: {
        select: { clientId: true },
      },
    },
  });

  if (!task) {
    throw new TaskNotFoundError(taskId);
  }

  const previousTitle = task.title;

  await db.task.update({
    where: { id: taskId },
    data,
  });

  // Record history for changed fields
  const changes: Record<string, unknown> = {};
  if (data.title !== undefined && data.title !== task.title) {
    changes.title = { from: previousTitle, to: data.title };
    await recordHistory(db, taskId, 'field_updated', 'title', previousTitle, data.title, options?.userId).catch(() => {});
  }
  if (data.assignedToId !== undefined && data.assignedToId !== task.assignedToId) {
    changes.assignedToId = { from: task.assignedToId, to: data.assignedToId };
    await recordHistory(db, taskId, 'field_updated', 'assignedToId', task.assignedToId, data.assignedToId, options?.userId).catch(() => {});
  }
  if (data.priority !== undefined && data.priority !== task.priority) {
    changes.priority = { from: task.priority, to: data.priority };
    await recordHistory(db, taskId, 'field_updated', 'priority', task.priority, data.priority, options?.userId).catch(() => {});
  }

  if (options?.logActivity !== false && callbacks?.onActivity) {
    callbacks.onActivity('TASK_UPDATED', `Updated task: "${data.title || task.title}"`, {
      taskId,
      taskTitle: data.title || task.title,
      userId: options?.userId,
      clientId: task.email?.clientId,
      previousTitle,
      changes,
    });
  }
}

/**
 * Mark a task as completed (legacy — no outcome).
 *
 * @throws {TaskNotFoundError}
 */
export async function completeTask(
  db: PrismaClient,
  taskId: string,
  userId: string,
  callbacks?: MutationCallbacks
): Promise<void> {
  const task = await db.task.findUnique({
    where: { id: taskId },
    include: {
      email: {
        select: { clientId: true },
      },
    },
  });

  if (!task) {
    throw new TaskNotFoundError(taskId);
  }

  await db.task.update({
    where: { id: taskId },
    data: {
      status: 'COMPLETED',
      completedAt: new Date(),
      completedBy: userId,
    },
  });

  await recordHistory(db, taskId, 'status_changed', 'status', task.status, 'COMPLETED', userId).catch(() => {});

  callbacks?.onEvent?.({
    eventType: 'TASK_COMPLETED',
    entityType: 'task',
    entityId: taskId,
    data: {
      title: task.title,
      emailId: task.emailId,
      assignedToId: task.assignedToId,
      completedBy: userId,
    },
  });

  callbacks?.onActivity?.('TASK_COMPLETED', `Completed task: "${task.title}"`, {
    taskId,
    taskTitle: task.title,
    emailId: task.emailId,
    userId,
    clientId: task.email?.clientId,
  });

  // Check if this completes a dependency for other tasks
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
 * Reopen a completed task.
 *
 * @throws {TaskNotFoundError}
 */
export async function reopenTask(
  db: PrismaClient,
  taskId: string,
  userId?: string,
  callbacks?: MutationCallbacks
): Promise<void> {
  const task = await db.task.findUnique({
    where: { id: taskId },
    include: {
      email: {
        select: { clientId: true },
      },
    },
  });

  if (!task) {
    throw new TaskNotFoundError(taskId);
  }

  await db.task.update({
    where: { id: taskId },
    data: {
      status: 'OPEN',
      completedAt: null,
      completedBy: null,
    },
  });

  await recordHistory(db, taskId, 'status_changed', 'status', task.status, 'OPEN', userId).catch(() => {});

  callbacks?.onEvent?.({
    eventType: 'TASK_REOPENED',
    entityType: 'task',
    entityId: taskId,
    data: { title: task.title, userId },
  });

  callbacks?.onActivity?.('TASK_REOPENED', `Reopened task: "${task.title}"`, {
    taskId,
    taskTitle: task.title,
    emailId: task.emailId,
    userId,
    clientId: task.email?.clientId,
  });
}

/**
 * Delete a task.
 *
 * @throws {TaskNotFoundError}
 */
export async function deleteTask(
  db: PrismaClient,
  taskId: string,
  userId?: string,
  callbacks?: MutationCallbacks
): Promise<void> {
  const task = await db.task.findUnique({
    where: { id: taskId },
    include: {
      email: {
        select: { clientId: true },
      },
    },
  });

  if (!task) {
    throw new TaskNotFoundError(taskId);
  }

  const taskTitle = task.title;
  const emailId = task.emailId;
  const clientId = task.email?.clientId;

  await db.task.delete({
    where: { id: taskId },
  });

  callbacks?.onActivity?.('TASK_DELETED', `Deleted task: "${taskTitle}"`, {
    taskId,
    taskTitle,
    emailId,
    userId,
    clientId,
  });
}

