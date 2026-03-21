// ===========================================
// @ordinatio/entities — ENTITY HEALTH DASHBOARD
// ===========================================
// Capstone: aggregates completeness, freshness,
// conflict rate, truth average into a single score.
// ===========================================

import type { PrismaClient, EntityHealthReport, EntityTypeHealthSummary } from '../types';
import { knowledgeError } from '../errors';
import { computeTruthScore, computeRecencyFactor } from './scoring';
import { computeDecayedConfidence } from './decay';
import { detectConflicts } from './reflection';
import type { ConflictRule } from './reflection';

/**
 * Pure: compute overall score from components.
 * 0.4 × completeness + 0.3 × freshness + 0.2 × (1 - conflictRate) + 0.1 × truthAverage
 */
export function computeOverallScore(
  completeness: number,
  freshness: number,
  conflictRate: number,
  truthAverage: number,
): number {
  return (
    0.4 * completeness +
    0.3 * freshness +
    0.2 * (1 - conflictRate) +
    0.1 * truthAverage
  );
}

/**
 * Compute health for one entity.
 */
export async function computeEntityHealth(
  db: PrismaClient,
  entityType: string,
  entityId: string,
  conflictRules?: ConflictRule[],
): Promise<EntityHealthReport> {
  try {
    // Get all approved field definitions for this entity type
    const fieldDefs = await db.entityFieldDefinition.findMany({
      where: { entityType, isActive: true, status: 'approved' },
    });

    const totalFieldCount = fieldDefs.length;

    // Get current (non-superseded) entries
    const currentEntries = await db.knowledgeLedgerEntry.findMany({
      where: { entityType, entityId, supersededAt: null },
      include: { field: true },
    });

    const filledFieldCount = currentEntries.length;

    // Completeness
    const completeness = totalFieldCount > 0
      ? Math.min(filledFieldCount / totalFieldCount, 1.0)
      : 0;

    // Freshness: average recency factor across all fields
    const now = new Date();
    let freshnessSum = 0;
    let staleFieldCount = 0;

    for (const entry of currentEntries) {
      const halfLife = (entry.field as any).halfLifeDays;
      if (halfLife != null) {
        const decayed = computeDecayedConfidence(Number(entry.confidence), entry.createdAt, halfLife, now);
        freshnessSum += decayed / Number(entry.confidence || 1);
        if (decayed < 0.3) staleFieldCount++;
      } else {
        freshnessSum += computeRecencyFactor(entry.createdAt, now);
      }
    }

    const freshness = currentEntries.length > 0
      ? freshnessSum / currentEntries.length
      : 0;

    // Truth scores
    const allEntries = await db.knowledgeLedgerEntry.findMany({
      where: { entityType, entityId },
      include: { field: true },
      orderBy: { createdAt: 'desc' },
    });

    const entriesByField = new Map<string, Array<{
      confidence: number;
      source: string;
      createdAt: Date;
      supersededAt: Date | null;
    }>>();

    for (const entry of allEntries) {
      const key = entry.field.key;
      if (!entriesByField.has(key)) entriesByField.set(key, []);
      entriesByField.get(key)!.push({
        confidence: Number(entry.confidence),
        source: entry.source,
        createdAt: entry.createdAt,
        supersededAt: entry.supersededAt,
      });
    }

    let truthSum = 0;
    let truthCount = 0;

    for (const assertions of entriesByField.values()) {
      const score = computeTruthScore(assertions, now);
      truthSum += score;
      truthCount++;
    }

    const truthAverage = truthCount > 0 ? truthSum / truthCount : 0;

    // Conflict detection
    const conflicts = await detectConflicts(db, entityType, entityId, conflictRules);
    const conflictCount = conflicts.length;
    const conflictRate = filledFieldCount > 0
      ? Math.min(conflictCount / filledFieldCount, 1.0)
      : 0;

    // Overall score
    const overallScore = computeOverallScore(completeness, freshness, conflictRate, truthAverage);

    // Warnings
    const warnings: string[] = [];
    if (completeness < 0.3) warnings.push('Entity has very few fields filled');
    if (freshness < 0.3) warnings.push('Many fields are stale — data may be outdated');
    if (conflictCount > 0) warnings.push(`${conflictCount} contradiction(s) detected`);
    if (staleFieldCount > 0) warnings.push(`${staleFieldCount} field(s) have decayed below threshold`);

    return {
      entityType,
      entityId,
      completeness,
      freshness,
      conflictRate,
      truthAverage,
      overallScore,
      staleFieldCount,
      conflictCount,
      filledFieldCount,
      totalFieldCount,
      warnings,
    };
  } catch (error) {
    const err = knowledgeError('KNOWLEDGE_360', { entityType, entityId, error: String(error) });
    console.error(`[${err.ref}] ${err.description}`, error);
    throw error;
  }
}

/**
 * Aggregate health across all entities of a type.
 */
export async function getEntityTypeHealth(
  db: PrismaClient,
  entityType: string,
  options?: { limit?: number; worstN?: number; bestN?: number },
): Promise<EntityTypeHealthSummary> {
  try {
    const limit = options?.limit ?? 200;
    const worstN = options?.worstN ?? 5;
    const bestN = options?.bestN ?? 5;

    // Get distinct entity IDs
    const distinctEntries = await db.knowledgeLedgerEntry.findMany({
      where: { entityType, supersededAt: null },
      select: { entityId: true },
      distinct: ['entityId'],
      take: limit,
    });

    const entityCount = distinctEntries.length;
    if (entityCount === 0) {
      return {
        entityType,
        entityCount: 0,
        avgCompleteness: 0,
        avgFreshness: 0,
        avgConflictRate: 0,
        avgOverallScore: 0,
        worstEntities: [],
        bestEntities: [],
      };
    }

    const reports: EntityHealthReport[] = [];

    for (const { entityId } of distinctEntries) {
      const report = await computeEntityHealth(db, entityType, entityId);
      reports.push(report);
    }

    // Averages
    const avgCompleteness = reports.reduce((s, r) => s + r.completeness, 0) / entityCount;
    const avgFreshness = reports.reduce((s, r) => s + r.freshness, 0) / entityCount;
    const avgConflictRate = reports.reduce((s, r) => s + r.conflictRate, 0) / entityCount;
    const avgOverallScore = reports.reduce((s, r) => s + r.overallScore, 0) / entityCount;

    // Sort for worst/best
    const sorted = [...reports].sort((a, b) => a.overallScore - b.overallScore);

    return {
      entityType,
      entityCount,
      avgCompleteness,
      avgFreshness,
      avgConflictRate,
      avgOverallScore,
      worstEntities: sorted.slice(0, worstN).map((r) => ({
        entityId: r.entityId,
        overallScore: r.overallScore,
      })),
      bestEntities: sorted.slice(-bestN).reverse().map((r) => ({
        entityId: r.entityId,
        overallScore: r.overallScore,
      })),
    };
  } catch (error) {
    const err = knowledgeError('KNOWLEDGE_361', { entityType, error: String(error) });
    console.error(`[${err.ref}] ${err.description}`, error);
    throw error;
  }
}
