// ===========================================
// EMAIL ENGINE — MESSAGE QUERIES
// ===========================================

import type { PrismaClient } from '@prisma/client';
import { getProvider, type ProviderType } from './providers';
import { getActiveAccount, getValidAccessToken } from './account-queries';
import { EmailAccountNotFoundError, EmailMessageNotFoundError } from './types';
import type { GetInboxOptions, GetThreadsOptions, EmailContentCallbacks } from './types';

/**
 * Get inbox emails (paginated).
 */
export async function getInboxEmails(
  db: PrismaClient,
  options: GetInboxOptions = {}
) {
  const { limit = 50, offset = 0, threadId } = options;

  const account = await getActiveAccount(db);
  if (!account) {
    throw new EmailAccountNotFoundError();
  }

  const where: Record<string, unknown> = {
    accountId: account.id,
    status: 'INBOX',
  };
  if (threadId) {
    where.threadId = threadId;
  }

  const [emails, total] = await Promise.all([
    db.emailMessage.findMany({
      where,
      orderBy: { emailDate: 'desc' },
      take: limit,
      skip: offset,
      include: {
        client: { select: { id: true, name: true } },
      },
    }),
    db.emailMessage.count({ where }),
  ]);

  return { emails, total };
}

/**
 * Get inbox threads (distinct threads with message counts).
 */
export async function getInboxThreads(
  db: PrismaClient,
  options: GetThreadsOptions = {}
) {
  const { limit = 20, offset = 0 } = options;

  const account = await getActiveAccount(db);
  if (!account) {
    throw new EmailAccountNotFoundError();
  }

  // Get distinct thread IDs with latest message
  const threads = await db.emailMessage.findMany({
    where: {
      accountId: account.id,
      status: 'INBOX',
      threadId: { not: null },
    },
    distinct: ['threadId'],
    orderBy: { emailDate: 'desc' },
    take: limit,
    skip: offset,
    include: {
      client: { select: { id: true, name: true } },
    },
  });

  // Get message counts per thread
  const threadIds = threads.map((t) => t.threadId).filter(Boolean) as string[];
  const counts = await db.emailMessage.groupBy({
    by: ['threadId'],
    where: {
      accountId: account.id,
      threadId: { in: threadIds },
    },
    _count: true,
  });

  const countMap = new Map(
    counts.map((c) => [c.threadId, c._count])
  );

  return threads.map((thread) => ({
    ...thread,
    messageCount: countMap.get(thread.threadId!) || 1,
  }));
}

/**
 * Get a single email by ID, fetching content from provider if not cached.
 */
export async function getEmail(
  db: PrismaClient,
  emailId: string,
  contentCallbacks?: EmailContentCallbacks
) {
  const email = await db.emailMessage.findUnique({
    where: { id: emailId },
    include: {
      client: { select: { id: true, name: true } },
      account: { select: { id: true, provider: true } },
    },
  });

  if (!email) {
    throw new EmailMessageNotFoundError(emailId);
  }

  // If content is already cached, return as-is
  if (email.bodyHtml || email.bodyText) {
    return email;
  }

  // Fetch content from provider
  try {
    const accessToken = await getValidAccessToken(db, email.accountId);
    const provider = getProvider(email.account.provider.toLowerCase() as ProviderType);
    const fullMessage = await provider.getMessage(accessToken, email.providerId);

    let bodyHtml = fullMessage.bodyHtml;
    if (bodyHtml && contentCallbacks?.sanitizeHtml) {
      bodyHtml = contentCallbacks.sanitizeHtml(bodyHtml);
    }

    // Cache the content
    await db.emailMessage.update({
      where: { id: emailId },
      data: {
        bodyHtml: bodyHtml || null,
        bodyText: fullMessage.bodyText || null,
      },
    });

    return {
      ...email,
      bodyHtml: bodyHtml || null,
      bodyText: fullMessage.bodyText || null,
    };
  } catch {
    // Return email without content on fetch failure
    return email;
  }
}

/**
 * Get emails linked to a specific client.
 */
export async function getClientEmails(
  db: PrismaClient,
  clientId: string,
  options: { limit?: number; offset?: number } = {}
) {
  const { limit = 50, offset = 0 } = options;

  const [emails, total] = await Promise.all([
    db.emailMessage.findMany({
      where: { clientId },
      orderBy: { emailDate: 'desc' },
      take: limit,
      skip: offset,
    }),
    db.emailMessage.count({ where: { clientId } }),
  ]);

  return { emails, total };
}
