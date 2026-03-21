// ===========================================
// @ordinatio/entities — KNOWLEDGE DECAY
// ===========================================
// Exponential confidence decay based on field half-life.
// Fields with halfLifeDays on their definition decay over time.
// ===========================================

import type { PrismaClient } from '../types';
import { knowledgeError } from '../errors';

/**
 * Pure exponential decay: C_decayed = C_original × 0.5^(age_days / halfLifeDays)
 */
export function computeDecayedConfidence(
  originalConfidence: number,
  createdAt: Date,
  halfLifeDays: number,
  now?: Date,
): number {
  if (halfLifeDays <= 0) return originalConfidence;
  const current = now ?? new Date();
  const ageDays = (current.getTime() - createdAt.getTime()) / (1000 * 60 * 60 * 24);
  if (ageDays <= 0) return originalConfidence;
  return originalConfidence * Math.pow(0.5, ageDays / halfLifeDays);
}

/**
 * Is the decayed confidence below threshold?
 */
export function isStale(
  originalConfidence: number,
  createdAt: Date,
  halfLifeDays: number,
  threshold = 0.3,
  now?: Date,
): boolean {
  const decayed = computeDecayedConfidence(originalConfidence, createdAt, halfLifeDays, now);
  return decayed < threshold;
}

/**
 * Get all stale fields for an entity.
 * Only checks fields whose definitions have a non-null halfLifeDays.
 */
export async function getStaleFields(
  db: PrismaClient,
  entityType: string,
  entityId: string,
  threshold = 0.3,
): Promise<Array<{
  fieldKey: string;
  label: string;
  originalConfidence: number;
  decayedConfidence: number;
  halfLifeDays: number;
  lastUpdated: Date;
  staleSinceDays: number;
}>> {
  try {
    const entries = await db.knowledgeLedgerEntry.findMany({
      where: {
        entityType,
        entityId,
        supersededAt: null,
      },
      include: { field: true },
    });

    const now = new Date();
    const staleFields: Array<{
      fieldKey: string;
      label: string;
      originalConfidence: number;
      decayedConfidence: number;
      halfLifeDays: number;
      lastUpdated: Date;
      staleSinceDays: number;
    }> = [];

    for (const entry of entries) {
      const halfLife = (entry.field as any).halfLifeDays;
      if (halfLife == null) continue;

      const originalConfidence = Number(entry.confidence);
      const decayed = computeDecayedConfidence(originalConfidence, entry.createdAt, halfLife, now);

      if (decayed < threshold) {
        const ageDays = (now.getTime() - entry.createdAt.getTime()) / (1000 * 60 * 60 * 24);
        staleFields.push({
          fieldKey: entry.field.key,
          label: entry.field.label,
          originalConfidence,
          decayedConfidence: decayed,
          halfLifeDays: halfLife,
          lastUpdated: entry.createdAt,
          staleSinceDays: Math.floor(ageDays),
        });
      }
    }

    return staleFields;
  } catch (error) {
    const err = knowledgeError('KNOWLEDGE_342', { entityType, entityId, error: String(error) });
    console.error(`[${err.ref}] ${err.description}`, error);
    throw error;
  }
}

/**
 * Agent-friendly staleness warnings.
 */
export function formatStalenessWarnings(
  staleFields: Array<{
    fieldKey: string;
    label: string;
    decayedConfidence: number;
    staleSinceDays: number;
  }>,
): string[] {
  return staleFields.map((f) => {
    const pct = Math.round(f.decayedConfidence * 100);
    return `"${f.label}" confidence has decayed to ${pct}% (${f.staleSinceDays} days since last update)`;
  });
}
