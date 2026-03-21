// ===========================================
// EMAIL ENGINE — ACCOUNT MUTATIONS
// ===========================================

import type { PrismaClient } from '@prisma/client';
import { getProvider, type ProviderType } from './providers';
import { EmailAccountNotFoundError, EmailAccountExistsError, type EmailMutationCallbacks } from './types';

/**
 * Complete the OAuth flow and save the connected account.
 */
export async function connectAccount(
  db: PrismaClient,
  provider: ProviderType,
  code: string,
  email: string,
  callbacks?: EmailMutationCallbacks
): Promise<{ id: string; email: string }> {
  const existing = await db.emailAccount.findUnique({
    where: { email },
  });

  if (existing) {
    throw new EmailAccountExistsError(email);
  }

  const emailProvider = getProvider(provider);
  const tokens = await emailProvider.exchangeCodeForTokens!(code);

  await db.emailAccount.updateMany({
    where: { isActive: true },
    data: { isActive: false },
  });

  const account = await db.emailAccount.create({
    data: {
      provider: provider.toUpperCase() as 'GMAIL' | 'OUTLOOK' | 'IMAP',
      email,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      tokenExpiresAt: tokens.expiresAt,
      isActive: true,
    },
  });

  await callbacks?.onActivity?.('EMAIL_ACCOUNT_CONNECTED', `Connected ${provider} account: ${email}`, { accountId: account.id, email });

  return { id: account.id, email: account.email };
}

/**
 * Disconnect (delete) an email account.
 */
export async function disconnectAccount(
  db: PrismaClient,
  accountId: string,
  callbacks?: EmailMutationCallbacks
): Promise<void> {
  const account = await db.emailAccount.findUnique({
    where: { id: accountId },
  });

  if (!account) {
    throw new EmailAccountNotFoundError(accountId);
  }

  await db.emailAccount.delete({
    where: { id: accountId },
  });

  await callbacks?.onActivity?.('EMAIL_ACCOUNT_DISCONNECTED', `Disconnected email account: ${account.email}`, { accountId, email: account.email });
}
