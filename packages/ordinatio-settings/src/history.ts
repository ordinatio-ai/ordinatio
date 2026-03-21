// ===========================================
// ORDINATIO SETTINGS — Setting History (Append-Only Ledger)
// ===========================================
// Immutable audit trail for every setting change.
// Follows the KnowledgeLedgerEntry pattern from
// @ordinatio/entities.
// ===========================================

import { createHash } from 'node:crypto';
import type { SettingHistoryDb, SettingHistoryEntry, SettingChangeSource } from './types';

/**
 * Compute a SHA-256 content hash for a history entry.
 */
export function computeContentHash(key: string, newValue: string, source: string, changedBy: string | null): string {
  const data = JSON.stringify({ key, newValue, source, changedBy, timestamp: Date.now() });
  return createHash('sha256').update(data).digest('hex');
}

/**
 * Record a setting change in the append-only ledger.
 * Supersedes all previous active entries for this key.
 */
export async function recordSettingChange(
  db: SettingHistoryDb,
  key: string,
  oldValue: string | null,
  newValue: string,
  source: SettingChangeSource,
  changedBy: string | null,
): Promise<SettingHistoryEntry> {
  const now = new Date();

  // Supersede all previous active entries for this key
  await db.settingHistory.updateMany({
    where: { key, supersededAt: null },
    data: { supersededAt: now },
  });

  // Create new entry
  const contentHash = computeContentHash(key, newValue, source, changedBy);

  return db.settingHistory.create({
    data: {
      key,
      oldValue,
      newValue,
      source,
      changedBy,
      contentHash,
      supersededAt: null,
    },
  });
}

/**
 * Get the history of a setting, ordered by most recent first.
 */
export async function getSettingHistory(
  db: SettingHistoryDb,
  key: string,
  limit = 50,
): Promise<SettingHistoryEntry[]> {
  return db.settingHistory.findMany({
    where: { key },
    orderBy: { createdAt: 'desc' },
    take: limit,
  });
}

/**
 * Time-travel: get the value of a setting at a specific point in time.
 * Returns the most recent entry created at or before the given timestamp.
 */
export async function getSettingAt(
  db: SettingHistoryDb,
  key: string,
  timestamp: Date,
): Promise<string | null> {
  const entries = await db.settingHistory.findMany({
    where: { key },
    orderBy: { createdAt: 'desc' },
    take: 1000,
  });

  // Find the most recent entry created at or before the timestamp
  for (const entry of entries) {
    if (entry.createdAt <= timestamp) {
      return entry.newValue;
    }
  }

  return null;
}
