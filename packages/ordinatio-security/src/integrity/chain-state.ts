// ===========================================
// @ordinatio/security — Integrity Layer: Chain State
// ===========================================
// Manages the integrity hash chain state in the database.
// Integrity data is stored in metadata JSON (no schema changes).
// ===========================================

import type { SecurityDb, SecurityEvent, SecurityEventInput } from '../types';
import { computeEventHash, computeIntegrityHash } from './event-hash';

/**
 * Get the last integrity hash from the most recent security event.
 * Returns null if no events have integrity hashes (chain genesis).
 */
export async function getLastHash(db: SecurityDb): Promise<string | null> {
  const events = await db.activityLog.findMany({
    where: {
      action: { startsWith: 'security.' },
    },
    orderBy: { createdAt: 'desc' },
    take: 10,
  });

  for (const event of events) {
    const metadata = event.metadata as Record<string, unknown> | null;
    if (metadata?.integrity && typeof metadata.integrity === 'object') {
      const integrity = metadata.integrity as Record<string, unknown>;
      if (typeof integrity.hash === 'string') {
        return integrity.hash;
      }
    }
  }

  return null;
}

/**
 * Build integrity metadata for a security event.
 * Computes content hash from event data and chains to previous hash.
 */
export function buildIntegrityMetadata(
  input: SecurityEventInput,
  prevHash: string | null
): { contentHash: string; hash: string; prevHash: string | null; chainIndex: number } {
  const content: Record<string, unknown> = {
    eventType: input.eventType,
    userId: input.userId ?? null,
    ip: input.ip ?? null,
    details: input.details ?? {},
    riskLevel: input.riskLevel ?? null,
  };

  const contentHash = computeEventHash(content);
  const hash = computeIntegrityHash(contentHash, prevHash);

  return {
    contentHash,
    hash,
    prevHash,
    chainIndex: -1, // Set by caller if tracking index
  };
}
