// ===========================================
// LEDGER VALIDATOR — Hash Chain Integrity
// ===========================================

import type { LedgerEntry } from './types';
import { computeHash } from '../signing/hash';

export interface ChainValidationResult {
  valid: boolean;
  brokenAt?: number;
  conflicts: string[];
}

/**
 * Validate the hash chain integrity of a ledger.
 * Each entry's parentHash must match the capsuleHash of the previous entry.
 */
export function validateChain(entries: LedgerEntry[]): ChainValidationResult {
  if (entries.length === 0) {
    return { valid: true, conflicts: [] };
  }

  const conflicts: string[] = [];

  // Sort by stateVersion
  const sorted = [...entries].sort((a, b) => a.stateVersion - b.stateVersion);

  // First entry must have null parentHash
  if (sorted[0].parentHash !== null) {
    conflicts.push(`Entry 0 (v${sorted[0].stateVersion}): parentHash should be null for first entry, got "${sorted[0].parentHash}"`);
  }

  // Check chain links
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1];
    const curr = sorted[i];

    if (curr.parentHash !== prev.capsuleHash) {
      conflicts.push(
        `Entry ${i} (v${curr.stateVersion}): parentHash "${curr.parentHash}" does not match previous capsuleHash "${prev.capsuleHash}"`
      );
      return { valid: false, brokenAt: i, conflicts };
    }
  }

  // Check version sequence
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].stateVersion !== sorted[i - 1].stateVersion + 1) {
      conflicts.push(
        `Version gap: v${sorted[i - 1].stateVersion} → v${sorted[i].stateVersion}`
      );
    }
  }

  return {
    valid: conflicts.length === 0,
    conflicts,
  };
}

/**
 * Verify a single capsule hash against its raw content.
 */
export function verifyEntryHash(entry: LedgerEntry): boolean {
  const computed = computeHash(entry.capsuleRaw);
  return computed === entry.capsuleHash;
}
