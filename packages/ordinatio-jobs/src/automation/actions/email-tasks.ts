// ===========================================
// EMAIL TASK ACTIONS
// ===========================================
// Handlers for email task and scheduling actions.
// Includes archive, link, schedule, and task creation.
// Uses dependency injection for SaaS extraction readiness.
// ===========================================
// DEPENDS ON: registry, condition-evaluator, default-deps, types
// USED BY: actions/email.ts
// ===========================================

import { resolveTemplateVars } from '../condition-evaluator';
import {
  completedResult,
  failedResult,
  type ActionResult,
  type ExecutionContext,
} from './registry';
import type { ActionDependencies } from './types';
import { getDependencies } from './default-deps';

/**
 * ARCHIVE_EMAIL action
 * Config options:
 *   - emailId (optional): Email ID, falls back to context.data.emailId
 */
export async function executeArchiveEmail(
  actionId: string,
  config: Record<string, unknown>,
  context: ExecutionContext,
  customDeps?: ActionDependencies
): Promise<ActionResult> {
  const deps = getDependencies(customDeps);

  const emailId = (config.emailId ?? context.data.emailId) as string;

  if (!emailId) {
    return failedResult(actionId, 'ARCHIVE_EMAIL', 'No emailId in trigger data');
  }

  await deps.emailService.archiveEmail(emailId, 'automation');

  return completedResult(actionId, 'ARCHIVE_EMAIL', { emailId, archived: true });
}

/**
 * LINK_EMAIL_TO_CLIENT action
 * Config options:
 *   - emailId (optional): Email ID, falls back to context.data.emailId
 *   - clientId (optional): Client ID, falls back to context.data.clientId
 */
export async function executeLinkEmailToClient(
  actionId: string,
  config: Record<string, unknown>,
  context: ExecutionContext,
  customDeps?: ActionDependencies
): Promise<ActionResult> {
  const deps = getDependencies(customDeps);

  const emailId = (config.emailId ?? context.data.emailId) as string;
  const clientId = (config.clientId ?? context.data.clientId) as string;

  if (!emailId) {
    return failedResult(actionId, 'LINK_EMAIL_TO_CLIENT', 'No emailId provided');
  }

  if (!clientId) {
    return failedResult(actionId, 'LINK_EMAIL_TO_CLIENT', 'No clientId provided');
  }

  const client = await deps.clientService.findClientById(clientId);

  if (!client) {
    return failedResult(actionId, 'LINK_EMAIL_TO_CLIENT', `Client not found: ${clientId}`);
  }

  // Note: This uses the email service's linkEmailToClient if available,
  // otherwise we skip. In a full SaaS extraction, add linkEmailToClient to IEmailService.
  // For now, actions using LINK_EMAIL_TO_CLIENT require the app layer to provide
  // this capability via the emailService dependency.
  if ('linkEmailToClient' in deps.emailService && typeof (deps.emailService as Record<string, unknown>).linkEmailToClient === 'function') {
    await (deps.emailService as unknown as { linkEmailToClient(emailId: string, clientId: string, linkedBy: string): Promise<void> }).linkEmailToClient(emailId, clientId, 'automation');
  } else {
    // Fallback: not available in this deployment — return a descriptive error
    return failedResult(actionId, 'LINK_EMAIL_TO_CLIENT', 'linkEmailToClient not available on emailService — provide via ActionDependencies');
  }

  return completedResult(actionId, 'LINK_EMAIL_TO_CLIENT', {
    emailId,
    clientId,
    clientName: client.name,
  });
}

/**
 * SCHEDULE_EMAIL action
 * Config options:
 *   - to (required): Recipient email, supports {{template}} vars
 *   - subject (optional): Email subject, supports {{template}} vars
 *   - body/bodyHtml (optional): Email body HTML, supports {{template}} vars
 *   - scheduledFor (optional): ISO date string for when to send
 *   - delayMinutes (optional): Minutes from now to send (alternative to scheduledFor)
 */
export async function executeScheduleEmail(
  actionId: string,
  config: Record<string, unknown>,
  context: ExecutionContext,
  customDeps?: ActionDependencies
): Promise<ActionResult> {
  const deps = getDependencies(customDeps);

  const to = resolveTemplateVars(String(config.to ?? ''), context.data);
  const subject = resolveTemplateVars(String(config.subject ?? ''), context.data);
  const bodyHtml = resolveTemplateVars(
    String(config.body ?? config.bodyHtml ?? ''),
    context.data
  );
  const scheduledFor = config.scheduledFor as string | Date | undefined;
  const delayMinutes = config.delayMinutes as number | undefined;

  if (!to) {
    return failedResult(actionId, 'SCHEDULE_EMAIL', 'No recipient (to) specified');
  }

  const account = await deps.emailService.getActiveEmailAccount();

  if (!account) {
    return failedResult(actionId, 'SCHEDULE_EMAIL', 'No active email account configured');
  }

  let sendAt: Date;
  if (scheduledFor) {
    sendAt = new Date(scheduledFor);
  } else if (delayMinutes) {
    sendAt = new Date(Date.now() + delayMinutes * 60 * 1000);
  } else {
    return failedResult(
      actionId,
      'SCHEDULE_EMAIL',
      'Either scheduledFor or delayMinutes must be provided'
    );
  }

  const scheduled = await deps.scheduledEmailService.createScheduledEmail({
    accountId: account.id,
    toEmail: to,
    subject,
    bodyHtml,
    scheduledFor: sendAt,
    createdBy: 'automation',
  });

  return completedResult(actionId, 'SCHEDULE_EMAIL', {
    scheduledEmailId: scheduled.id,
    to,
    scheduledFor: sendAt.toISOString(),
  });
}

/**
 * CANCEL_SCHEDULED_EMAIL action
 * Config options:
 *   - scheduledEmailId (optional): Scheduled email ID, falls back to context.data.scheduledEmailId
 */
export async function executeCancelScheduledEmail(
  actionId: string,
  config: Record<string, unknown>,
  context: ExecutionContext,
  customDeps?: ActionDependencies
): Promise<ActionResult> {
  const deps = getDependencies(customDeps);

  const scheduledEmailId = (config.scheduledEmailId ??
    context.data.scheduledEmailId) as string;

  if (!scheduledEmailId) {
    return failedResult(actionId, 'CANCEL_SCHEDULED_EMAIL', 'No scheduledEmailId provided');
  }

  const scheduled = await deps.scheduledEmailService.findScheduledEmailById(scheduledEmailId);

  if (!scheduled) {
    return failedResult(
      actionId,
      'CANCEL_SCHEDULED_EMAIL',
      `Scheduled email not found: ${scheduledEmailId}`
    );
  }

  if (scheduled.status !== 'PENDING') {
    return failedResult(
      actionId,
      'CANCEL_SCHEDULED_EMAIL',
      `Cannot cancel email with status: ${scheduled.status}`
    );
  }

  await deps.scheduledEmailService.cancelScheduledEmail(scheduledEmailId);

  return completedResult(actionId, 'CANCEL_SCHEDULED_EMAIL', {
    scheduledEmailId,
    cancelled: true,
  });
}

/**
 * CREATE_TASK_FROM_EMAIL action
 * Config options:
 *   - emailId (optional): Email ID, falls back to context.data.emailId
 *   - title (optional): Task title, supports {{template}} vars
 *   - notes (optional): Task notes, supports {{template}} vars
 *   - categoryId (optional): Task category ID
 */
export async function executeCreateTaskFromEmail(
  actionId: string,
  config: Record<string, unknown>,
  context: ExecutionContext,
  customDeps?: ActionDependencies
): Promise<ActionResult> {
  const deps = getDependencies(customDeps);

  const emailId = (config.emailId ?? context.data.emailId) as string;
  const title = config.title
    ? resolveTemplateVars(String(config.title), context.data)
    : undefined;
  const notes = config.notes
    ? resolveTemplateVars(String(config.notes), context.data)
    : undefined;
  const categoryId = config.categoryId as string | undefined;

  if (!emailId) {
    return failedResult(actionId, 'CREATE_TASK_FROM_EMAIL', 'No emailId provided');
  }

  const email = await deps.taskService.findEmailById(emailId);

  if (!email) {
    return failedResult(actionId, 'CREATE_TASK_FROM_EMAIL', `Email not found: ${emailId}`);
  }

  const task = await deps.taskService.createTask({
    emailId,
    title: title ?? `Follow up: ${email.subject}`,
    notes: notes ?? `From: ${email.fromName ?? email.fromEmail}\n${email.snippet}`,
    categoryId,
    createdBy: 'automation',
  });

  return completedResult(actionId, 'CREATE_TASK_FROM_EMAIL', {
    taskId: task.id,
    emailId,
    title: task.title,
  });
}
