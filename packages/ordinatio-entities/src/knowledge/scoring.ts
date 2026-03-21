// ===========================================
// @ordinatio/entities — TRUTH SCORE + COMPLEXITY SCORE
// ===========================================
// Pure functions for scoring entity knowledge quality.
// No DB mutations, no schema changes.
// ===========================================

import type { PrismaClient } from '../types';
import { knowledgeError } from '../errors';

/**
 * Source reliability weights.
 * Higher = more trustworthy.
 */
export const SOURCE_RELIABILITY: Record<string, number> = {
  manual: 1.0,
  note: 0.9,
  email: 0.7,
  agent: 0.6,
  'ai-batch': 0.5,
  predicted: 0.3,
};

/**
 * Recency factor: 1.0 for today, decays exponentially toward 0.
 * Uses formula: exp(-age_days / maxAgeDays × 3) — reaches ~0.05 at maxAgeDays.
 */
export function computeRecencyFactor(
  createdAt: Date,
  now?: Date,
  maxAgeDays = 365,
): number {
  const current = now ?? new Date();
  const ageDays = (current.getTime() - createdAt.getTime()) / (1000 * 60 * 60 * 24);
  if (ageDays <= 0) return 1.0;
  return Math.exp((-ageDays / maxAgeDays) * 3);
}

/**
 * Truth Score: weighted average of assertions.
 * T_v = Σ(C_i × R_i × T_i) / Σ(C_i × R_i)
 * where C_i = confidence, R_i = source reliability, T_i = recency
 *
 * Returns 0 if no assertions.
 */
export function computeTruthScore(
  assertions: Array<{
    confidence: number;
    source: string;
    createdAt: Date;
    supersededAt: Date | null;
  }>,
  now?: Date,
): number {
  if (assertions.length === 0) return 0;

  let numerator = 0;
  let denominator = 0;

  for (const a of assertions) {
    const reliability = SOURCE_RELIABILITY[a.source] ?? 0.5;
    const recency = computeRecencyFactor(a.createdAt, now);
    const weight = a.confidence * reliability;

    numerator += weight * recency;
    denominator += weight;
  }

  if (denominator === 0) return 0;
  return numerator / denominator;
}

/**
 * Entity complexity score: how "filled" is the entity's knowledge.
 * Weighted: 60% category coverage + 40% field coverage.
 */
export function computeComplexityScore(
  fieldsUsed: number,
  fieldsAvailable: number,
  categoriesUsed: number,
  maxCategories: number,
): number {
  if (fieldsAvailable === 0 || maxCategories === 0) return 0;

  const categoryRatio = Math.min(categoriesUsed / maxCategories, 1.0);
  const fieldRatio = Math.min(fieldsUsed / fieldsAvailable, 1.0);

  return 0.6 * categoryRatio + 0.4 * fieldRatio;
}

/**
 * Compute truth scores for all current (non-superseded) fields on an entity.
 * DB wrapper that reads ledger entries + their history for truth calculation.
 */
export async function computeEntityTruthScores(
  db: PrismaClient,
  entityType: string,
  entityId: string,
): Promise<Record<string, {
  truthScore: number;
  confidence: number;
  source: string;
  assertions: number;
}>> {
  try {
    // Get all entries (including superseded) for this entity
    const allEntries = await db.knowledgeLedgerEntry.findMany({
      where: { entityType, entityId },
      include: { field: true },
      orderBy: { createdAt: 'desc' },
    });

    // Group by field key
    const byField = new Map<string, Array<{
      confidence: number;
      source: string;
      createdAt: Date;
      supersededAt: Date | null;
    }>>();

    // Track current (non-superseded) entry per field
    const currentByField = new Map<string, { confidence: number; source: string }>();

    for (const entry of allEntries) {
      const key = entry.field.key;

      if (!byField.has(key)) byField.set(key, []);
      byField.get(key)!.push({
        confidence: Number(entry.confidence),
        source: entry.source,
        createdAt: entry.createdAt,
        supersededAt: entry.supersededAt,
      });

      if (!entry.supersededAt && !currentByField.has(key)) {
        currentByField.set(key, {
          confidence: Number(entry.confidence),
          source: entry.source,
        });
      }
    }

    const result: Record<string, {
      truthScore: number;
      confidence: number;
      source: string;
      assertions: number;
    }> = {};

    for (const [key, assertions] of byField) {
      const current = currentByField.get(key);
      if (!current) continue; // No current value — skip

      result[key] = {
        truthScore: computeTruthScore(assertions),
        confidence: current.confidence,
        source: current.source,
        assertions: assertions.length,
      };
    }

    return result;
  } catch (error) {
    const err = knowledgeError('KNOWLEDGE_348', { entityType, entityId, error: String(error) });
    console.error(`[${err.ref}] ${err.description}`, error);
    throw error;
  }
}
