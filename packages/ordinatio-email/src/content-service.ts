// ===========================================
// EMAIL ENGINE — CONTENT SERVICE
// ===========================================
// Fetches and caches email content from providers.
// HTML sanitization and transcription handled via callbacks.
// ===========================================

import type { PrismaClient } from '@prisma/client';
import { getProvider, type ProviderType } from './providers';
import { getValidAccessToken } from './account-queries';
import type { EmailContentCallbacks, OaemCallbacks } from './types';

/**
 * Fetch full email content from provider and cache it.
 * Returns the email with bodyHtml/bodyText populated.
 * Audio attachments metadata returned for app-layer transcription.
 */
export async function fetchEmailContent(
  db: PrismaClient,
  emailId: string,
  callbacks?: EmailContentCallbacks,
  oaemCallbacks?: OaemCallbacks
): Promise<{
  bodyHtml: string | null;
  bodyText: string | null;
  audioAttachments: Array<{ providerId: string; name: string; mimeType: string; size: number }>;
}> {
  const email = await db.emailMessage.findUnique({
    where: { id: emailId },
    include: { account: { select: { id: true, provider: true } } },
  });

  if (!email) {
    return { bodyHtml: null, bodyText: null, audioAttachments: [] };
  }

  // If already cached, return
  if (email.bodyHtml || email.bodyText) {
    return { bodyHtml: email.bodyHtml, bodyText: email.bodyText, audioAttachments: [] };
  }

  try {
    const accessToken = await getValidAccessToken(db, email.accountId);
    const provider = getProvider(email.account.provider.toLowerCase() as ProviderType);
    const fullMessage = await provider.getMessage(accessToken, email.providerId);

    let bodyHtml = fullMessage.bodyHtml || null;

    // Parse OAEM capsule BEFORE sanitization (sanitizer strips hidden div)
    if (bodyHtml && oaemCallbacks?.parseCapsule) {
      try {
        const capsuleResult = await oaemCallbacks.parseCapsule({
          bodyHtml,
          fromEmail: email.fromEmail,
          subject: email.subject,
        });

        if (capsuleResult.found && capsuleResult.capsule && oaemCallbacks.onCapsuleVerified) {
          await oaemCallbacks.onCapsuleVerified({
            emailId,
            threadId: email.threadId ?? emailId,
            capsule: capsuleResult.capsule,
            trustTier: capsuleResult.trustTier,
            stateVersion: 0, // Will be set by the ledger builder
          });
        }
      } catch {
        // OAEM parsing failures are non-blocking — email still works normally
      }
    }

    if (bodyHtml && callbacks?.sanitizeHtml) {
      bodyHtml = callbacks.sanitizeHtml(bodyHtml);
    }

    const bodyText = fullMessage.bodyText || null;

    // Cache content
    await db.emailMessage.update({
      where: { id: emailId },
      data: { bodyHtml, bodyText },
    });

    // Identify audio attachments for app-layer transcription
    const audioMimeTypes = ['audio/mpeg', 'audio/mp4', 'audio/wav', 'audio/webm', 'audio/ogg', 'audio/x-m4a', 'audio/mp3'];
    const audioAttachments = fullMessage.attachments.filter(
      (att) => audioMimeTypes.some((mime) => att.mimeType.startsWith(mime.split('/')[0]))
    );

    return { bodyHtml, bodyText, audioAttachments };
  } catch {
    return { bodyHtml: null, bodyText: null, audioAttachments: [] };
  }
}
