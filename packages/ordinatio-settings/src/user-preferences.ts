// ===========================================
// ORDINATIO SETTINGS — User Preferences Service
// ===========================================
// Per-user preferences stored in the database.
// ===========================================

import type { UserPreferenceDb, UserPreference, ReplyLayout, SettingsCallbacks } from './types';

// Default preferences for new users
const DEFAULT_REPLY_LAYOUT: ReplyLayout = 'MODAL';

/**
 * Get user preferences, creating defaults if none exist.
 * Uses try/catch for P2002 (unique constraint) to handle concurrent creation race.
 */
export async function getPreferences(db: UserPreferenceDb, userId: string): Promise<UserPreference> {
  const existing = await db.userPreference.findUnique({
    where: { userId },
  });

  if (existing) {
    return existing;
  }

  // Create default preferences — handle race condition where another request creates first
  try {
    return await db.userPreference.create({
      data: {
        userId,
        replyLayout: DEFAULT_REPLY_LAYOUT,
      },
    });
  } catch (error: unknown) {
    if (isUniqueConstraintError(error)) {
      // Another concurrent request created it first — read and return
      const fallback = await db.userPreference.findUnique({ where: { userId } });
      if (fallback) return fallback;
    }
    throw error;
  }
}

/** Detect Prisma P2002 unique constraint violation. */
function isUniqueConstraintError(error: unknown): boolean {
  if (error && typeof error === 'object' && 'code' in error) {
    return (error as { code: string }).code === 'P2002';
  }
  return false;
}

/**
 * Update user preferences.
 */
export async function updatePreferences(
  db: UserPreferenceDb,
  userId: string,
  data: {
    replyLayout?: ReplyLayout;
  },
  callbacks?: SettingsCallbacks,
): Promise<UserPreference> {
  const result = await db.userPreference.upsert({
    where: { userId },
    update: data,
    create: {
      userId,
      ...{ replyLayout: DEFAULT_REPLY_LAYOUT },
      ...data,
    },
  });

  await callbacks?.onPreferenceChanged?.(userId, data as Record<string, unknown>);

  return result;
}

/**
 * Get just the reply layout preference.
 */
export async function getReplyLayout(db: UserPreferenceDb, userId: string): Promise<ReplyLayout> {
  const prefs = await getPreferences(db, userId);
  return prefs.replyLayout;
}
