// ===========================================
// EMAIL ENGINE — ARCHIVE SERVICE
// ===========================================

import type { PrismaClient } from '@prisma/client';
import { getProvider, type ProviderType } from './providers';
import { getValidAccessToken } from './account-queries';
import { EmailMessageNotFoundError, type EmailMutationCallbacks } from './types';

/**
 * Archive an email (provider + local DB).
 */
export async function archiveEmail(
  db: PrismaClient,
  emailId: string,
  userId: string,
  callbacks?: EmailMutationCallbacks
): Promise<void> {
  const email = await db.emailMessage.findUnique({
    where: { id: emailId },
    include: { account: { select: { id: true, provider: true } } },
  });

  if (!email) {
    throw new EmailMessageNotFoundError(emailId);
  }

  // Archive on provider
  const accessToken = await getValidAccessToken(db, email.accountId);
  const provider = getProvider(email.account.provider.toLowerCase() as ProviderType);
  await provider.archiveMessage(accessToken, email.providerId);

  // Archive locally
  await db.emailMessage.update({
    where: { id: emailId },
    data: {
      status: 'ARCHIVED',
      archivedAt: new Date(),
      archivedBy: userId,
    },
  });

  await callbacks?.onActivity?.('EMAIL_ARCHIVED', `Archived email: ${email.subject}`, { emailId, userId });
  await callbacks?.onEvent?.({
    eventType: 'email.archived',
    entityType: 'EmailMessage',
    entityId: emailId,
    data: { subject: email.subject },
  });
}
