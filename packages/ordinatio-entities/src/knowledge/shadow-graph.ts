// ===========================================
// @ordinatio/entities — SHADOW GRAPH (ENTITY LINKER)
// ===========================================
// Discovers implicit relationships between entities
// via shared field values. No schema changes.
// ===========================================

import type { PrismaClient } from '../types';
import { knowledgeError } from '../errors';

export interface EntityRelationship {
  sourceEntityType: string;
  sourceEntityId: string;
  targetEntityType: string;
  targetEntityId: string;
  sharedFields: Array<{
    fieldKey: string;
    value: unknown;
    sourceConfidence: number;
    targetConfidence: number;
  }>;
  strength: number; // 0-1
}

/**
 * Pure: compute relationship strength from shared fields.
 * strength = avg(srcConf × tgtConf) × (sharedCount / totalSourceFields)
 */
export function computeRelationshipStrength(
  sharedFields: Array<{ sourceConfidence: number; targetConfidence: number }>,
  totalFieldsOnSource: number,
): number {
  if (sharedFields.length === 0 || totalFieldsOnSource === 0) return 0;

  const avgConfProduct = sharedFields.reduce(
    (sum, f) => sum + f.sourceConfidence * f.targetConfidence,
    0,
  ) / sharedFields.length;

  const coverage = Math.min(sharedFields.length / totalFieldsOnSource, 1.0);

  return avgConfProduct * coverage;
}

/**
 * Find entities related to a given entity via shared field values.
 */
export async function findRelatedEntities(
  db: PrismaClient,
  entityType: string,
  entityId: string,
  options?: {
    targetEntityType?: string;
    minSharedFields?: number;
    minStrength?: number;
    limit?: number;
  },
): Promise<EntityRelationship[]> {
  try {
    const minShared = options?.minSharedFields ?? 1;
    const minStrength = options?.minStrength ?? 0;
    const limit = options?.limit ?? 20;

    // Get source entity's current fields
    const sourceEntries = await db.knowledgeLedgerEntry.findMany({
      where: { entityType, entityId, supersededAt: null },
      include: { field: true },
    });

    if (sourceEntries.length === 0) return [];

    // For each source field value, find other entities with the same value
    const relationships = new Map<string, EntityRelationship>();

    for (const sourceEntry of sourceEntries) {
      if (sourceEntry.value === null || sourceEntry.value === undefined) continue;

      const matchingEntries = await db.knowledgeLedgerEntry.findMany({
        where: {
          fieldId: sourceEntry.fieldId,
          value: { equals: sourceEntry.value } as never,
          supersededAt: null,
          NOT: {
            AND: [
              { entityType },
              { entityId },
            ],
          },
          ...(options?.targetEntityType ? { entityType: options.targetEntityType } : {}),
        },
        include: { field: true },
        take: 100, // Unbounded query guard
      });

      for (const match of matchingEntries) {
        const targetKey = `${match.entityType}:${match.entityId}`;

        if (!relationships.has(targetKey)) {
          relationships.set(targetKey, {
            sourceEntityType: entityType,
            sourceEntityId: entityId,
            targetEntityType: match.entityType,
            targetEntityId: match.entityId,
            sharedFields: [],
            strength: 0,
          });
        }

        relationships.get(targetKey)!.sharedFields.push({
          fieldKey: sourceEntry.field.key,
          value: sourceEntry.value,
          sourceConfidence: Number(sourceEntry.confidence),
          targetConfidence: Number(match.confidence),
        });
      }
    }

    // Compute strength and filter
    const results: EntityRelationship[] = [];

    for (const rel of relationships.values()) {
      if (rel.sharedFields.length < minShared) continue;

      rel.strength = computeRelationshipStrength(
        rel.sharedFields,
        sourceEntries.length,
      );

      if (rel.strength < minStrength) continue;

      results.push(rel);
    }

    // Sort by strength descending and limit
    results.sort((a, b) => b.strength - a.strength);
    return results.slice(0, limit);
  } catch (error) {
    const err = knowledgeError('KNOWLEDGE_345', { entityType, entityId, error: String(error) });
    console.error(`[${err.ref}] ${err.description}`, error);
    throw error;
  }
}

/**
 * Get all relationships for an entity (alias for findRelatedEntities with defaults).
 */
export async function getEntityRelationships(
  db: PrismaClient,
  entityType: string,
  entityId: string,
  limit = 20,
): Promise<EntityRelationship[]> {
  return findRelatedEntities(db, entityType, entityId, { limit });
}
