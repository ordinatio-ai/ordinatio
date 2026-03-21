// ===========================================
// @ordinatio/security — Integrity Verification Primitives
// ===========================================
// Generic integrity verification: hash comparison,
// chain link validation, content integrity.
// Used by email capsules, audit artifacts, migration proofs.
// ===========================================

import { createHash } from 'node:crypto';

/**
 * Verify that content matches its expected hash.
 * Generic primitive — works for any content that can be JSON-serialized.
 */
export function verifyContentIntegrity(
  content: Record<string, unknown>,
  expectedHash: string
): { valid: boolean; actualHash: string } {
  const serialized = JSON.stringify(content, Object.keys(content).sort());
  const actualHash = createHash('sha256').update(serialized).digest('hex');
  return {
    valid: actualHash === expectedHash,
    actualHash,
  };
}

/**
 * Verify a single chain link: current hash must chain from previous.
 */
export function verifyChainLink(
  currentContentHash: string,
  currentIntegrityHash: string,
  previousIntegrityHash: string | null
): { valid: boolean; expectedHash: string } {
  const input = currentContentHash + (previousIntegrityHash ?? 'GENESIS');
  const expectedHash = createHash('sha256').update(input).digest('hex');
  return {
    valid: expectedHash === currentIntegrityHash,
    expectedHash,
  };
}

export interface HashChainEntry {
  id: string;
  contentHash: string;
  integrityHash: string;
  prevHash: string | null;
}

export interface HashChainResult {
  valid: boolean;
  brokenAt?: number;
  entryId?: string;
  totalChecked: number;
  errors: string[];
}

/**
 * Verify a generic hash chain (events, ledger entries, artifacts).
 * Entries must be ordered chronologically (oldest first).
 */
export function verifyHashChain(entries: HashChainEntry[]): HashChainResult {
  const errors: string[] = [];

  if (entries.length === 0) {
    return { valid: true, totalChecked: 0, errors: [] };
  }

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    const expectedPrevHash = i === 0 ? null : entries[i - 1].integrityHash;

    // Check chain linkage
    if (entry.prevHash !== expectedPrevHash) {
      errors.push(
        `Chain broken at index ${i} (${entry.id}): ` +
        `expected prevHash ${expectedPrevHash ?? 'null'}, got ${entry.prevHash ?? 'null'}`
      );
      return { valid: false, brokenAt: i, entryId: entry.id, totalChecked: i + 1, errors };
    }

    // Verify integrity hash
    const { valid, expectedHash } = verifyChainLink(
      entry.contentHash,
      entry.integrityHash,
      entry.prevHash
    );

    if (!valid) {
      errors.push(
        `Integrity mismatch at index ${i} (${entry.id}): ` +
        `expected ${expectedHash}, got ${entry.integrityHash}`
      );
      return { valid: false, brokenAt: i, entryId: entry.id, totalChecked: i + 1, errors };
    }
  }

  return { valid: true, totalChecked: entries.length, errors: [] };
}
