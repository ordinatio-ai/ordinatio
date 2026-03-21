// ===========================================
// ORDINATIO SETTINGS — Merkle Auditing
// ===========================================
// Integrity proofs for settings state.
// Compute and verify Merkle roots over the
// entire settings configuration.
// ===========================================

import { createHash } from 'node:crypto';
import type { SettingsDb, SettingHistoryDb } from './types';

/**
 * Compute a Merkle root hash of the current settings state.
 * Sorts all settings by key, concatenates `key:value` pairs,
 * and produces a single SHA-256 hash.
 */
export async function computeSettingsMerkleRoot(db: SettingsDb): Promise<string> {
  const settings = await db.systemSettings.findMany({ take: 1000 });

  // Sort by key for deterministic ordering
  const sorted = [...settings].sort((a, b) => a.key.localeCompare(b.key));

  // Concatenate key:value pairs
  const data = sorted.map(s => `${s.key}:${s.value}`).join('|');

  return createHash('sha256').update(data).digest('hex');
}

/**
 * Verify that the current settings match an expected Merkle root.
 */
export async function verifySettingsIntegrity(
  db: SettingsDb,
  expectedRoot: string,
): Promise<{ valid: boolean; currentRoot: string }> {
  const currentRoot = await computeSettingsMerkleRoot(db);
  return {
    valid: currentRoot === expectedRoot,
    currentRoot,
  };
}

/**
 * Compute a Merkle root from a specific set of key-value pairs.
 * Useful for computing historical state hashes.
 */
export function computeMerkleRootFromPairs(pairs: Array<{ key: string; value: string }>): string {
  const sorted = [...pairs].sort((a, b) => a.key.localeCompare(b.key));
  const data = sorted.map(s => `${s.key}:${s.value}`).join('|');
  return createHash('sha256').update(data).digest('hex');
}
