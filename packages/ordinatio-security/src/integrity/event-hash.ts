// ===========================================
// @ordinatio/security — Integrity Layer: Event Hash
// ===========================================
// Deterministic event hashing + hash chain for tamper detection.
// Reuses computeContentHash pattern from @ordinatio/core.
// ===========================================

import { createHash } from 'node:crypto';

/**
 * Compute a SHA-256 hash of event content.
 * Deterministic: sorted keys ensure same content = same hash.
 */
export function computeEventHash(event: Record<string, unknown>): string {
  const serialized = JSON.stringify(event, Object.keys(event).sort());
  return createHash('sha256').update(serialized).digest('hex');
}

/**
 * Compute an integrity hash that chains to the previous event.
 * Creates a tamper-evident chain: modifying any event breaks all subsequent hashes.
 */
export function computeIntegrityHash(contentHash: string, prevHash: string | null): string {
  const input = contentHash + (prevHash ?? 'GENESIS');
  return createHash('sha256').update(input).digest('hex');
}

export interface HashedSecurityEvent {
  id: string;
  contentHash: string;
  integrityHash: string;
  prevHash: string | null;
}

export interface ChainVerificationResult {
  valid: boolean;
  brokenAt?: number;
  eventId?: string;
  totalChecked: number;
  errors: string[];
}

/**
 * Verify an ordered sequence of hashed events.
 * Checks both content integrity and chain linkage.
 */
export function verifyEventChain(
  events: HashedSecurityEvent[]
): ChainVerificationResult {
  const errors: string[] = [];

  if (events.length === 0) {
    return { valid: true, totalChecked: 0, errors: [] };
  }

  for (let i = 0; i < events.length; i++) {
    const event = events[i];
    const expectedPrevHash = i === 0 ? null : events[i - 1].integrityHash;

    // Check chain linkage
    if (event.prevHash !== expectedPrevHash) {
      errors.push(
        `Chain broken at index ${i} (event ${event.id}): ` +
        `expected prevHash ${expectedPrevHash ?? 'null'}, got ${event.prevHash ?? 'null'}`
      );
      return {
        valid: false,
        brokenAt: i,
        eventId: event.id,
        totalChecked: i + 1,
        errors,
      };
    }

    // Verify integrity hash
    const recomputed = computeIntegrityHash(event.contentHash, event.prevHash);
    if (recomputed !== event.integrityHash) {
      errors.push(
        `Integrity hash mismatch at index ${i} (event ${event.id}): ` +
        `expected ${recomputed}, got ${event.integrityHash}`
      );
      return {
        valid: false,
        brokenAt: i,
        eventId: event.id,
        totalChecked: i + 1,
        errors,
      };
    }
  }

  return { valid: true, totalChecked: events.length, errors: [] };
}

/**
 * Build a hashed event from content and chain state.
 */
export function buildHashedEvent(
  id: string,
  content: Record<string, unknown>,
  prevHash: string | null
): HashedSecurityEvent {
  const contentHash = computeEventHash(content);
  const integrityHash = computeIntegrityHash(contentHash, prevHash);
  return { id, contentHash, integrityHash, prevHash };
}
