// ===========================================
// EMAIL ENGINE — SCHEDULED MUTATIONS
// ===========================================

import type { PrismaClient } from '@prisma/client';
import {
  ScheduledEmailNotFoundError,
  ScheduledEmailNotPendingError,
  ScheduledEmailNotFailedError,
  EmailAccountNotFoundError,
  type ScheduleEmailInput,
  type EmailMutationCallbacks,
} from './types';

/**
 * Schedule an email for future delivery.
 */
export async function scheduleEmail(
  db: PrismaClient,
  input: ScheduleEmailInput,
  callbacks?: EmailMutationCallbacks
) {
  // Verify account exists
  const account = await db.emailAccount.findUnique({
    where: { id: input.accountId },
  });

  if (!account) {
    throw new EmailAccountNotFoundError(input.accountId);
  }

  const scheduled = await db.scheduledEmail.create({
    data: {
      accountId: input.accountId,
      toEmail: input.toEmail,
      subject: input.subject,
      bodyHtml: input.bodyHtml,
      scheduledFor: input.scheduledFor,
      createdBy: input.createdBy,
      inReplyTo: input.inReplyTo || null,
      threadId: input.threadId || null,
      status: 'PENDING',
    },
  });

  await callbacks?.onActivity?.('EMAIL_SCHEDULED', `Scheduled email to ${input.toEmail}: ${input.subject}`, { scheduledId: scheduled.id });

  return scheduled;
}

/**
 * Cancel a pending scheduled email.
 */
export async function cancelScheduledEmail(
  db: PrismaClient,
  id: string,
  callbacks?: EmailMutationCallbacks
): Promise<void> {
  const email = await db.scheduledEmail.findUnique({
    where: { id },
  });

  if (!email) {
    throw new ScheduledEmailNotFoundError(id);
  }

  if (email.status !== 'PENDING') {
    throw new ScheduledEmailNotPendingError(id, email.status);
  }

  await db.scheduledEmail.update({
    where: { id },
    data: { status: 'CANCELLED' },
  });

  await callbacks?.onActivity?.('EMAIL_SCHEDULED_CANCELLED', `Cancelled scheduled email: ${email.subject}`, { scheduledId: id });
}

/**
 * Mark as processing (worker picks it up).
 */
export async function markAsProcessing(db: PrismaClient, id: string): Promise<void> {
  await db.scheduledEmail.update({
    where: { id },
    data: {
      status: 'PROCESSING',
      attempts: { increment: 1 },
    },
  });
}

/**
 * Mark as sent.
 */
export async function markAsSent(
  db: PrismaClient,
  id: string,
  callbacks?: EmailMutationCallbacks
): Promise<void> {
  await db.scheduledEmail.update({
    where: { id },
    data: {
      status: 'SENT',
      sentAt: new Date(),
    },
  });

  await callbacks?.onActivity?.('EMAIL_SCHEDULED_SENT', `Scheduled email sent`, { scheduledId: id });
}

/**
 * Mark as failed.
 */
export async function markAsFailed(
  db: PrismaClient,
  id: string,
  errorMessage: string,
  callbacks?: EmailMutationCallbacks
): Promise<void> {
  await db.scheduledEmail.update({
    where: { id },
    data: {
      status: 'FAILED',
      errorMessage: errorMessage,
    },
  });

  await callbacks?.onActivity?.('EMAIL_SCHEDULED_FAILED', `Scheduled email failed: ${errorMessage}`, { scheduledId: id, error: errorMessage });
}

/**
 * Retry a failed scheduled email.
 */
export async function retryScheduledEmail(
  db: PrismaClient,
  id: string,
  newScheduledFor?: Date
): Promise<void> {
  const email = await db.scheduledEmail.findUnique({
    where: { id },
  });

  if (!email) {
    throw new ScheduledEmailNotFoundError(id);
  }

  if (email.status !== 'FAILED') {
    throw new ScheduledEmailNotFailedError(id, email.status);
  }

  await db.scheduledEmail.update({
    where: { id },
    data: {
      status: 'PENDING',
      errorMessage: null,
      scheduledFor: newScheduledFor || new Date(),
    },
  });
}
