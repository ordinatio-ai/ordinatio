// ===========================================
// EMAIL ENGINE — MESSAGE MUTATIONS
// ===========================================

import type { PrismaClient } from '@prisma/client';
import { getProvider, type ProviderType } from './providers';
import { getActiveAccount, getValidAccessToken } from './account-queries';
import { EmailAccountNotFoundError, EmailMessageNotFoundError, type EmailMutationCallbacks } from './types';

/**
 * Reply to an email via the provider.
 */
export async function replyToEmail(
  db: PrismaClient,
  emailId: string,
  bodyHtml: string,
  userId: string,
  autoArchive = false,
  callbacks?: EmailMutationCallbacks
): Promise<string> {
  const email = await db.emailMessage.findUnique({
    where: { id: emailId },
    include: { account: { select: { id: true, provider: true } } },
  });

  if (!email) {
    throw new EmailMessageNotFoundError(emailId);
  }

  const accessToken = await getValidAccessToken(db, email.accountId);
  const provider = getProvider(email.account.provider.toLowerCase() as ProviderType);

  const sentId = await provider.sendReply(accessToken, {
    inReplyTo: email.providerId,
    threadId: email.threadId || undefined,
    bodyHtml,
  });

  if (autoArchive) {
    await provider.archiveMessage(accessToken, email.providerId);
    await db.emailMessage.update({
      where: { id: emailId },
      data: {
        status: 'ARCHIVED',
        archivedAt: new Date(),
        archivedBy: userId,
      },
    });
  }

  await callbacks?.onActivity?.('EMAIL_REPLIED', `Replied to email: ${email.subject}`, { emailId, sentId });
  await callbacks?.onEvent?.({ eventType: 'email.replied', entityType: 'EmailMessage', entityId: emailId, data: { sentId } });

  return sentId;
}

/**
 * Link an email to a client.
 */
export async function linkEmailToClient(
  db: PrismaClient,
  emailId: string,
  clientId: string,
  addToAddressBook = false,
  callbacks?: EmailMutationCallbacks
): Promise<void> {
  const email = await db.emailMessage.findUnique({
    where: { id: emailId },
  });

  if (!email) {
    throw new EmailMessageNotFoundError(emailId);
  }

  await db.emailMessage.update({
    where: { id: emailId },
    data: {
      clientId,
      clientLinkedAt: new Date(),
    },
  });

  if (addToAddressBook && email.fromEmail) {
    // Add the email to the client's known addresses via clientEmailAddress table
    try {
      await db.clientEmailAddress.upsert({
        where: {
          clientId_email: {
            clientId,
            email: email.fromEmail,
          },
        },
        create: {
          clientId,
          email: email.fromEmail,
        },
        update: {}, // No update needed if exists
      });
    } catch {
      // Non-critical — address book update failure doesn't block linking
    }
  }

  await callbacks?.onActivity?.('EMAIL_LINKED', `Linked email to client`, { emailId, clientId });
}
