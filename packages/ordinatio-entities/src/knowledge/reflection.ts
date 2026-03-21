// ===========================================
// @ordinatio/entities — RECURSIVE REFLECTION
// ===========================================
// Contradiction detection across entity knowledge.
// Uses Truth Score for severity ranking.
// ===========================================

import type { PrismaClient } from '../types';
import { knowledgeError } from '../errors';
import { computeTruthScore } from './scoring';

export interface ConflictRule {
  type: 'mutual_exclusion' | 'range_violation' | 'temporal_impossibility' | 'value_contradiction';
  description: string;
  fieldA: string;
  fieldB?: string;
  check: (valueA: unknown, valueB?: unknown) => boolean; // true = CONFLICT
}

export interface DetectedConflict {
  rule: ConflictRule;
  entityType: string;
  entityId: string;
  fieldA: { key: string; value: unknown; confidence: number; truthScore: number };
  fieldB?: { key: string; value: unknown; confidence: number; truthScore: number };
  severity: 'low' | 'medium' | 'high';
  suggestion: string;
}

/**
 * Default conflict rules — minimal starter set.
 * App provides domain-specific rules via the `rules` parameter.
 */
export const DEFAULT_CONFLICT_RULES: ConflictRule[] = [
  {
    type: 'value_contradiction',
    description: 'Budget range contradicts premium preference',
    fieldA: 'budget_range',
    fieldB: 'quality_preference',
    check: (budgetVal, qualityVal) => {
      const budget = String(budgetVal).toLowerCase();
      const quality = String(qualityVal).toLowerCase();
      const isLowBudget = budget.includes('budget') || budget.includes('economy') || budget.includes('under');
      const isPremium = quality.includes('premium') || quality.includes('luxury') || quality.includes('high-end');
      return isLowBudget && isPremium;
    },
  },
];

/**
 * Pure: evaluate a single rule against field values.
 */
export function evaluateConflictRule(
  rule: ConflictRule,
  fields: Record<string, { value: unknown; confidence: number; truthScore: number }>,
): DetectedConflict | null {
  const fieldA = fields[rule.fieldA];
  if (!fieldA) return null;

  const fieldB = rule.fieldB ? fields[rule.fieldB] : undefined;
  if (rule.fieldB && !fieldB) return null;

  const isConflict = rule.check(fieldA.value, fieldB?.value);
  if (!isConflict) return null;

  // Severity based on truth scores
  const minTruth = Math.min(fieldA.truthScore, fieldB?.truthScore ?? fieldA.truthScore);
  const severity: 'low' | 'medium' | 'high' =
    minTruth > 0.7 ? 'high' : minTruth > 0.4 ? 'medium' : 'low';

  return {
    rule,
    entityType: '',
    entityId: '',
    fieldA: { key: rule.fieldA, ...fieldA },
    fieldB: fieldB ? { key: rule.fieldB!, ...fieldB } : undefined,
    severity,
    suggestion: rule.fieldB
      ? `Review "${rule.fieldA}" and "${rule.fieldB}" — ${rule.description}`
      : `Review "${rule.fieldA}" — ${rule.description}`,
  };
}

/**
 * Check entity for contradictions using provided rules.
 */
export async function detectConflicts(
  db: PrismaClient,
  entityType: string,
  entityId: string,
  rules?: ConflictRule[],
): Promise<DetectedConflict[]> {
  try {
    const activeRules = rules ?? DEFAULT_CONFLICT_RULES;

    // Get current fields with their history for truth scoring
    const allEntries = await db.knowledgeLedgerEntry.findMany({
      where: { entityType, entityId },
      include: { field: true },
      orderBy: { createdAt: 'desc' },
    });

    // Group by field key for truth score computation
    const entriesByField = new Map<string, Array<{
      confidence: number;
      source: string;
      createdAt: Date;
      supersededAt: Date | null;
    }>>();

    const currentByField = new Map<string, { value: unknown; confidence: number }>();

    for (const entry of allEntries) {
      const key = entry.field.key;
      if (!entriesByField.has(key)) entriesByField.set(key, []);
      entriesByField.get(key)!.push({
        confidence: Number(entry.confidence),
        source: entry.source,
        createdAt: entry.createdAt,
        supersededAt: entry.supersededAt,
      });
      if (!entry.supersededAt && !currentByField.has(key)) {
        currentByField.set(key, { value: entry.value, confidence: Number(entry.confidence) });
      }
    }

    // Build fields map with truth scores
    const fields: Record<string, { value: unknown; confidence: number; truthScore: number }> = {};

    for (const [key, current] of currentByField) {
      const assertions = entriesByField.get(key) ?? [];
      fields[key] = {
        value: current.value,
        confidence: current.confidence,
        truthScore: computeTruthScore(assertions),
      };
    }

    // Evaluate rules
    const conflicts: DetectedConflict[] = [];

    for (const rule of activeRules) {
      const conflict = evaluateConflictRule(rule, fields);
      if (conflict) {
        conflict.entityType = entityType;
        conflict.entityId = entityId;
        conflicts.push(conflict);
      }
    }

    return conflicts;
  } catch (error) {
    const err = knowledgeError('KNOWLEDGE_346', { entityType, entityId, error: String(error) });
    console.error(`[${err.ref}] ${err.description}`, error);
    throw error;
  }
}

/**
 * Batch scan across all entities of a type for contradictions.
 */
export async function scanForConflicts(
  db: PrismaClient,
  entityType: string,
  rules?: ConflictRule[],
  limit = 100,
): Promise<Array<{ entityId: string; conflicts: DetectedConflict[] }>> {
  try {
    // Get distinct entity IDs
    const distinctEntries = await db.knowledgeLedgerEntry.findMany({
      where: { entityType, supersededAt: null },
      select: { entityId: true },
      distinct: ['entityId'],
      take: limit,
    });

    const results: Array<{ entityId: string; conflicts: DetectedConflict[] }> = [];

    for (const { entityId } of distinctEntries) {
      const conflicts = await detectConflicts(db, entityType, entityId, rules);
      if (conflicts.length > 0) {
        results.push({ entityId, conflicts });
      }
    }

    return results;
  } catch (error) {
    const err = knowledgeError('KNOWLEDGE_347', { entityType, error: String(error) });
    console.error(`[${err.ref}] ${err.description}`, error);
    throw error;
  }
}
