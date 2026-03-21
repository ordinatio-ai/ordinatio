// ===========================================
// EMAIL ENGINE — SYNC SERVICE
// ===========================================
// Syncs emails from providers to the local DB.
// Cross-cutting concerns injected via callbacks.
// ===========================================

import type { PrismaClient } from '@prisma/client';
import { getProvider, type ProviderType } from './providers';
import { getActiveAccount, getValidAccessToken, updateSyncTimestamp } from './account-queries';
import { EmailAccountNotFoundError, type EmailSyncCallbacks } from './types';

/**
 * Sync emails from the provider to the local database.
 */
export async function syncEmails(
  db: PrismaClient,
  callbacks?: EmailSyncCallbacks
): Promise<{ synced: number; total: number }> {
  const account = await getActiveAccount(db);
  if (!account) {
    throw new EmailAccountNotFoundError();
  }

  const accessToken = await getValidAccessToken(db, account.id);
  const provider = getProvider(account.provider.toLowerCase() as ProviderType);

  // Fetch messages from provider (since last sync)
  const result = await provider.listMessages(accessToken, {
    after: account.lastSyncAt || undefined,
    cursor: account.syncCursor || undefined,
    maxResults: 50,
  });

  let synced = 0;

  for (const message of result.messages) {
    // Skip existing
    const existing = await db.emailMessage.findFirst({
      where: {
        accountId: account.id,
        providerId: message.providerId,
      },
    });

    if (existing) continue;

    // Try to auto-link by client primary email
    let clientId: string | null = null;
    const client = await db.client.findFirst({
      where: { email: message.fromEmail },
      select: { id: true },
    });

    if (client) {
      clientId = client.id;
    } else {
      // Try additional addresses via clientEmailAddress table
      const clientByAdditional = await db.clientEmailAddress.findFirst({
        where: {
          email: {
            equals: message.fromEmail,
            mode: 'insensitive',
          },
        },
        select: { clientId: true },
      });
      if (clientByAdditional) {
        clientId = clientByAdditional.clientId;
      }
    }

    // Try contact resolution via callback
    if (!clientId && callbacks?.resolveContact) {
      try {
        const contact = await callbacks.resolveContact(db, message.fromEmail, message.fromName);
        if (contact?.clientId) {
          clientId = contact.clientId;
        }
      } catch {
        // Non-critical: contact resolution failure doesn't block sync
      }
    }

    // Create the email record
    const email = await db.emailMessage.create({
      data: {
        accountId: account.id,
        providerId: message.providerId,
        threadId: message.threadId || null,
        subject: message.subject,
        fromEmail: message.fromEmail,
        fromName: message.fromName || null,
        toEmail: message.toEmail,
        snippet: message.snippet,
        emailDate: message.date,
        status: 'INBOX',
        clientId,
      },
    });

    // Emit event for automation triggers
    await callbacks?.onEvent?.({
      eventType: 'email.received',
      entityType: 'EmailMessage',
      entityId: email.id,
      data: {
        subject: message.subject,
        fromEmail: message.fromEmail,
        fromName: message.fromName,
        clientId,
      },
    });

    // Extract context via callback
    if (callbacks?.onEmailSynced) {
      try {
        await callbacks.onEmailSynced(db, {
          id: email.id,
          subject: message.subject,
          bodyText: message.snippet,
          fromEmail: message.fromEmail,
          clientId,
        });
      } catch {
        // Non-critical
      }
    }

    synced++;
  }

  // Update sync cursor
  await updateSyncTimestamp(db, account.id, result.nextCursor);

  // Log activity
  if (synced > 0) {
    await callbacks?.onActivity?.('EMAIL_SYNCED', `Synced ${synced} new email${synced === 1 ? '' : 's'}`, { synced, accountId: account.id });
  }

  return { synced, total: result.messages.length };
}

/**
 * Log a sync failure as an activity.
 */
export async function logSyncFailure(
  error: unknown,
  callbacks?: EmailSyncCallbacks
): Promise<void> {
  const message = error instanceof Error ? error.message : 'Unknown error';
  await callbacks?.onActivity?.('EMAIL_SYNC_FAILED', `Email sync failed: ${message}`, { error: message });
}
