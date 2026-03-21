// ===========================================
// EMAIL ENGINE — SCHEDULED QUERIES
// ===========================================

import type { PrismaClient } from '@prisma/client';
import { ScheduledEmailNotFoundError, type GetScheduledEmailsOptions } from './types';

/**
 * List scheduled emails with optional filters.
 */
export async function getScheduledEmails(
  db: PrismaClient,
  options: GetScheduledEmailsOptions = {}
) {
  const { limit = 50, offset = 0, status, createdBy, accountId } = options;

  const where: Record<string, unknown> = {};
  if (status) where.status = status;
  if (createdBy) where.createdBy = createdBy;
  if (accountId) where.accountId = accountId;

  const [emails, total] = await Promise.all([
    db.scheduledEmail.findMany({
      where,
      orderBy: { scheduledFor: 'asc' },
      take: limit,
      skip: offset,
    }),
    db.scheduledEmail.count({ where }),
  ]);

  return { emails, total };
}

/**
 * Get a single scheduled email by ID.
 */
export async function getScheduledEmail(db: PrismaClient, id: string) {
  const email = await db.scheduledEmail.findUnique({
    where: { id },
  });

  if (!email) {
    throw new ScheduledEmailNotFoundError(id);
  }

  return email;
}

/**
 * Get pending emails that are due to be sent.
 */
export async function getPendingToSend(
  db: PrismaClient,
  limit = 20
) {
  return db.scheduledEmail.findMany({
    where: {
      status: 'PENDING',
      scheduledFor: { lte: new Date() },
    },
    orderBy: { scheduledFor: 'asc' },
    take: limit,
  });
}
