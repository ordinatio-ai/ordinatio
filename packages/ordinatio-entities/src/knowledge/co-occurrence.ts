// ===========================================
// @ordinatio/entities — CO-OCCURRENCE ANALYSIS
// ===========================================
// Builds statistical co-occurrence maps between entity fields.
// Foundation for ghost field predictions.
// ===========================================

import type { PrismaClient } from '../types';
import { knowledgeError } from '../errors';

/**
 * Analyze co-occurrence patterns across all entities of a type.
 * For each value of fieldKeyA, what values of fieldKeyB co-occur?
 *
 * Returns: Map<valueA, Map<valueB, { count, total, rate }>>
 */
export async function buildCoOccurrenceMap(
  db: PrismaClient,
  entityType: string,
  fieldKeyA: string,
  fieldKeyB: string,
  minOccurrences = 3,
): Promise<Map<string, Map<string, { count: number; total: number; rate: number }>>> {
  try {
    // Get field definition IDs
    const fieldDefs = await db.entityFieldDefinition.findMany({
      where: { entityType, key: { in: [fieldKeyA, fieldKeyB] }, isActive: true },
    });

    const defA = fieldDefs.find((d) => d.key === fieldKeyA);
    const defB = fieldDefs.find((d) => d.key === fieldKeyB);

    if (!defA || !defB) return new Map();

    // Get all current entries for field A
    const entriesA = await db.knowledgeLedgerEntry.findMany({
      where: { entityType, fieldId: defA.id, supersededAt: null },
      take: 1000,
    });

    // Get all current entries for field B
    const entriesB = await db.knowledgeLedgerEntry.findMany({
      where: { entityType, fieldId: defB.id, supersededAt: null },
      take: 1000,
    });

    // Index B by entityId
    const bByEntity = new Map<string, unknown>();
    for (const entry of entriesB) {
      bByEntity.set(entry.entityId, entry.value);
    }

    // Build co-occurrence counts
    const coOccurrence = new Map<string, Map<string, number>>();
    const totalPerA = new Map<string, number>();

    for (const entryA of entriesA) {
      const valA = String(entryA.value);
      const valB = bByEntity.get(entryA.entityId);
      if (valB === undefined) continue;

      const strB = String(valB);
      totalPerA.set(valA, (totalPerA.get(valA) ?? 0) + 1);

      if (!coOccurrence.has(valA)) coOccurrence.set(valA, new Map());
      const inner = coOccurrence.get(valA)!;
      inner.set(strB, (inner.get(strB) ?? 0) + 1);
    }

    // Convert to rates, filter by minOccurrences
    const result = new Map<string, Map<string, { count: number; total: number; rate: number }>>();

    for (const [valA, innerMap] of coOccurrence) {
      const total = totalPerA.get(valA) ?? 0;
      if (total < minOccurrences) continue;

      const rateMap = new Map<string, { count: number; total: number; rate: number }>();
      for (const [valB, count] of innerMap) {
        rateMap.set(valB, { count, total, rate: count / total });
      }
      result.set(valA, rateMap);
    }

    return result;
  } catch (error) {
    const err = knowledgeError('KNOWLEDGE_355', { entityType, fieldKeyA, fieldKeyB, error: String(error) });
    console.error(`[${err.ref}] ${err.description}`, error);
    throw error;
  }
}
