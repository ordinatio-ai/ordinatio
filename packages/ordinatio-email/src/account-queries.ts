// ===========================================
// EMAIL ENGINE — ACCOUNT QUERIES
// ===========================================

import type { PrismaClient } from '@prisma/client';
import { getProvider, type ProviderType } from './providers';
import { EmailAccountNotFoundError } from './types';

/**
 * Get the active email account (one per org for now).
 */
export async function getActiveAccount(db: PrismaClient) {
  return db.emailAccount.findFirst({
    where: { isActive: true },
  });
}

/**
 * Get the OAuth authorization URL.
 */
export function getConnectUrl(provider: ProviderType, state?: string): string {
  const emailProvider = getProvider(provider);
  return emailProvider.getAuthUrl!(state);
}

/**
 * Get a valid access token, refreshing if necessary.
 */
export async function getValidAccessToken(db: PrismaClient, accountId: string): Promise<string> {
  const account = await db.emailAccount.findUnique({
    where: { id: accountId },
  });

  if (!account) {
    throw new EmailAccountNotFoundError(accountId);
  }

  const expiresIn = account.tokenExpiresAt.getTime() - Date.now();
  const needsRefresh = expiresIn < 5 * 60 * 1000;

  if (!needsRefresh) {
    return account.accessToken;
  }

  const provider = getProvider(account.provider.toLowerCase() as ProviderType);
  const tokens = await provider.refreshAccessToken!(account.refreshToken);

  await db.emailAccount.update({
    where: { id: accountId },
    data: {
      accessToken: tokens.accessToken,
      tokenExpiresAt: tokens.expiresAt,
    },
  });

  return tokens.accessToken;
}

/**
 * Update last sync timestamp.
 */
export async function updateSyncTimestamp(
  db: PrismaClient,
  accountId: string,
  cursor?: string
): Promise<void> {
  await db.emailAccount.update({
    where: { id: accountId },
    data: {
      lastSyncAt: new Date(),
      syncCursor: cursor ?? null,
    },
  });
}
