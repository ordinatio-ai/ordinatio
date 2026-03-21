// ===========================================
// TASK ACTIONS
// ===========================================
// Handlers for task-related automation actions.
// Uses dependency injection for SaaS extraction readiness.
// ===========================================
// DEPENDS ON: registry, condition-evaluator, default-deps
// USED BY: action-executor, automation tests
// ===========================================

import { resolveTemplateVars } from '../condition-evaluator';
import {
  registerAction,
  completedResult,
  failedResult,
  type ActionResult,
  type ExecutionContext,
} from './registry';
import type { ActionDependencies } from './types';
import { getDependencies } from './default-deps';

// ===========================================
// CREATE_TASK
// ===========================================
// Config options:
//   - emailId (optional): Email ID, falls back to context.data.emailId (required for email-linked tasks)
//   - title (required): Task title, supports {{template}} vars
//   - notes (optional): Task notes, supports {{template}} vars
//   - categoryId (optional): Task category ID
//   - assignToUserId (optional): User ID to assign the task to
//   - dueDate (optional): Due date as ISO string or Date
// ===========================================

export async function executeCreateTask(
  actionId: string,
  config: Record<string, unknown>,
  context: ExecutionContext,
  customDeps?: ActionDependencies
): Promise<ActionResult> {
  const deps = getDependencies(customDeps);

  // EmailTask requires an emailId - this is for email-linked tasks only
  // Use CREATE_TASK_FROM_EMAIL for creating tasks from emails
  const emailId = (config.emailId ?? context.data.emailId) as string;
  const title = resolveTemplateVars(String(config.title ?? ''), context.data);
  const notes = config.notes
    ? resolveTemplateVars(String(config.notes), context.data)
    : null;
  const categoryId = config.categoryId as string | undefined;
  const assignToUserId = config.assignToUserId as string | undefined;
  const dueDate = config.dueDate as string | Date | undefined;

  if (!emailId) {
    return failedResult(
      actionId,
      'CREATE_TASK',
      'No emailId provided. Use CREATE_TASK_FROM_EMAIL for email-based tasks.'
    );
  }

  if (!title) {
    return failedResult(actionId, 'CREATE_TASK', 'No title provided');
  }

  // Verify email exists
  const email = await deps.taskService.findEmailById(emailId);

  if (!email) {
    return failedResult(actionId, 'CREATE_TASK', `Email not found: ${emailId}`);
  }

  const task = await deps.taskService.createTask({
    emailId,
    title,
    notes,
    categoryId,
    assignedToId: assignToUserId,
    dueDate: dueDate ? new Date(dueDate) : null,
    createdBy: 'automation',
  });

  return completedResult(actionId, 'CREATE_TASK', {
    taskId: task.id,
    title: task.title,
  });
}

// ===========================================
// UPDATE_TASK
// ===========================================
// Config options:
//   - taskId (optional): Task ID, falls back to context.data.taskId
//   - title (optional): New title, supports {{template}} vars
//   - notes (optional): New notes, supports {{template}} vars
//   - categoryId (optional): New category ID
//   - dueDate (optional): New due date as ISO string or Date
// ===========================================

export async function executeUpdateTask(
  actionId: string,
  config: Record<string, unknown>,
  context: ExecutionContext,
  customDeps?: ActionDependencies
): Promise<ActionResult> {
  const deps = getDependencies(customDeps);

  const taskId = (config.taskId ?? context.data.taskId) as string;

  if (!taskId) {
    return failedResult(actionId, 'UPDATE_TASK', 'No taskId provided');
  }

  const task = await deps.taskService.findTaskById(taskId);

  if (!task) {
    return failedResult(actionId, 'UPDATE_TASK', `Task not found: ${taskId}`);
  }

  const updates: Record<string, unknown> = {};

  if (config.title) {
    updates.title = resolveTemplateVars(String(config.title), context.data);
  }
  if (config.notes) {
    updates.notes = resolveTemplateVars(String(config.notes), context.data);
  }
  if (config.categoryId) {
    updates.categoryId = config.categoryId;
  }
  if (config.dueDate) {
    updates.dueDate = new Date(config.dueDate as string);
  }

  if (Object.keys(updates).length === 0) {
    return failedResult(actionId, 'UPDATE_TASK', 'No fields to update');
  }

  await deps.taskService.updateTask(taskId, updates);

  return completedResult(actionId, 'UPDATE_TASK', {
    taskId,
    updated: Object.keys(updates),
  });
}

// ===========================================
// ASSIGN_TASK
// ===========================================
// Config options:
//   - taskId (optional): Task ID, falls back to context.data.taskId
//   - userId (optional): User ID to assign to
//   - userEmail (optional): User email to look up and assign to
// ===========================================

export async function executeAssignTask(
  actionId: string,
  config: Record<string, unknown>,
  context: ExecutionContext,
  customDeps?: ActionDependencies
): Promise<ActionResult> {
  const deps = getDependencies(customDeps);

  const taskId = (config.taskId ?? context.data.taskId) as string;
  const userId = config.userId as string | undefined;
  const userEmail = config.userEmail as string | undefined;

  if (!taskId) {
    return failedResult(actionId, 'ASSIGN_TASK', 'No taskId provided');
  }

  const task = await deps.taskService.findTaskById(taskId);

  if (!task) {
    return failedResult(actionId, 'ASSIGN_TASK', `Task not found: ${taskId}`);
  }

  let assigneeId = userId;

  if (!assigneeId && userEmail) {
    const user = await deps.taskService.findUserByEmail(userEmail);

    if (user) {
      assigneeId = user.id;
    }
  }

  if (!assigneeId) {
    return failedResult(actionId, 'ASSIGN_TASK', 'No valid user found to assign');
  }

  await deps.taskService.assignTask(taskId, assigneeId);

  return completedResult(actionId, 'ASSIGN_TASK', {
    taskId,
    assignedToId: assigneeId,
  });
}

// ===========================================
// COMPLETE_TASK
// ===========================================
// Config options:
//   - taskId (optional): Task ID, falls back to context.data.taskId
// ===========================================

export async function executeCompleteTask(
  actionId: string,
  config: Record<string, unknown>,
  context: ExecutionContext,
  customDeps?: ActionDependencies
): Promise<ActionResult> {
  const deps = getDependencies(customDeps);

  const taskId = (config.taskId ?? context.data.taskId) as string;

  if (!taskId) {
    return failedResult(actionId, 'COMPLETE_TASK', 'No taskId provided');
  }

  const task = await deps.taskService.findTaskById(taskId);

  if (!task) {
    return failedResult(actionId, 'COMPLETE_TASK', `Task not found: ${taskId}`);
  }

  if (task.status === 'COMPLETED') {
    return completedResult(actionId, 'COMPLETE_TASK', {
      taskId,
      alreadyCompleted: true,
    });
  }

  await deps.taskService.completeTask(taskId);

  return completedResult(actionId, 'COMPLETE_TASK', {
    taskId,
    completed: true,
  });
}

// ===========================================
// REOPEN_TASK
// ===========================================
// Config options:
//   - taskId (optional): Task ID, falls back to context.data.taskId
// ===========================================

export async function executeReopenTask(
  actionId: string,
  config: Record<string, unknown>,
  context: ExecutionContext,
  customDeps?: ActionDependencies
): Promise<ActionResult> {
  const deps = getDependencies(customDeps);

  const taskId = (config.taskId ?? context.data.taskId) as string;

  if (!taskId) {
    return failedResult(actionId, 'REOPEN_TASK', 'No taskId provided');
  }

  const task = await deps.taskService.findTaskById(taskId);

  if (!task) {
    return failedResult(actionId, 'REOPEN_TASK', `Task not found: ${taskId}`);
  }

  if (task.status === 'OPEN') {
    return completedResult(actionId, 'REOPEN_TASK', {
      taskId,
      alreadyOpen: true,
    });
  }

  await deps.taskService.reopenTask(taskId);

  return completedResult(actionId, 'REOPEN_TASK', {
    taskId,
    reopened: true,
  });
}

// ===========================================
// REGISTER ALL TASK ACTIONS
// ===========================================

export function registerTaskActions(): void {
  // Wrap the exported functions to match the registry signature
  registerAction('CREATE_TASK', (actionId, config, context) =>
    executeCreateTask(actionId, config, context)
  );
  registerAction('UPDATE_TASK', (actionId, config, context) =>
    executeUpdateTask(actionId, config, context)
  );
  registerAction('ASSIGN_TASK', (actionId, config, context) =>
    executeAssignTask(actionId, config, context)
  );
  registerAction('COMPLETE_TASK', (actionId, config, context) =>
    executeCompleteTask(actionId, config, context)
  );
  registerAction('REOPEN_TASK', (actionId, config, context) =>
    executeReopenTask(actionId, config, context)
  );
}
