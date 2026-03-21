// IHS
/**
 * Council Artifact Helpers (Book II)
 *
 * Pure functions for creating, hashing, and superseding Council artifacts.
 * Extracts the hash logic from council.service.ts (apps/web) into the
 * library so both the pure orchestrator and the DB-backed service share
 * the same algorithm.
 *
 * DEPENDS ON: council/types (CouncilArtifact, ArtifactContent, OfficeId, ArtifactStatus)
 */

import { createHash, randomBytes } from 'crypto';
import type { CouncilArtifact, ArtifactContent, OfficeId, ArtifactType, ArtifactStatus } from './types';

// ---------------------------------------------------------------------------
// Content Hashing
// ---------------------------------------------------------------------------

/**
 * Compute SHA-256 hash of artifact content for integrity verification.
 * Uses deterministic JSON.stringify (sorted keys) — same algorithm
 * as council.service.ts lines 62-65.
 */
export function computeContentHash(content: ArtifactContent | Record<string, unknown>): string {
  const serialized = JSON.stringify(content, Object.keys(content).sort());
  return createHash('sha256').update(serialized).digest('hex');
}

/**
 * Verify an artifact's content hash matches its stored content.
 */
export function verifyArtifactHash(artifact: {
  content: ArtifactContent | Record<string, unknown>;
  contentHash: string;
}): boolean {
  const expected = computeContentHash(artifact.content);
  return expected === artifact.contentHash;
}

// ---------------------------------------------------------------------------
// Artifact Creation
// ---------------------------------------------------------------------------

/**
 * Create a new CouncilArtifact with computed hash and generated ID.
 * ID format: `art-{cycleId}-{office}-{timestamp}-{nonce}`
 */
export function createArtifact(params: {
  cycleId: string;
  producedBy: OfficeId;
  type: ArtifactType;
  content: ArtifactContent;
  references?: readonly string[];
  version?: number;
  status?: ArtifactStatus;
}): CouncilArtifact {
  const contentHash = computeContentHash(params.content);
  const now = new Date();
  const nonce = randomBytes(4).toString('hex');
  const id = `art-${params.cycleId}-${params.producedBy}-${now.getTime()}-${nonce}`;

  return {
    id,
    type: params.type,
    producedBy: params.producedBy,
    cycleId: params.cycleId,
    version: params.version ?? 1,
    status: params.status ?? 'submitted',
    content: params.content,
    contentHash,
    references: params.references ?? [],
    producedAt: now,
  };
}

// ---------------------------------------------------------------------------
// Artifact Supersession
// ---------------------------------------------------------------------------

/**
 * Supersede an existing artifact with new content.
 * Bumps version, references the original, resets status to 'submitted'.
 */
export function supersede(
  original: CouncilArtifact,
  newContent: ArtifactContent,
): CouncilArtifact {
  const contentHash = computeContentHash(newContent);
  const now = new Date();
  const nonce = randomBytes(4).toString('hex');
  const id = `art-${original.cycleId}-${original.producedBy}-${now.getTime()}-${nonce}`;

  return {
    id,
    type: original.type,
    producedBy: original.producedBy,
    cycleId: original.cycleId,
    version: original.version + 1,
    status: 'submitted',
    content: newContent,
    contentHash,
    references: [...original.references, original.id],
    producedAt: now,
  };
}
