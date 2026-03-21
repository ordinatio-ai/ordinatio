// ===========================================
// @ordinatio/entities — GHOST FIELDS (PREDICTIVE STATE)
// ===========================================
// Predicts missing field values from co-occurrence patterns.
// Uses source='predicted' with low confidence.
// ===========================================

import type { PrismaClient, MutationCallbacks } from '../types';
import { knowledgeError } from '../errors';
import { buildCoOccurrenceMap } from './co-occurrence';

export { buildCoOccurrenceMap } from './co-occurrence';

export interface GhostFieldPrediction {
  fieldKey: string;
  label: string;
  predictedValue: unknown;
  confidence: number;
  basedOn: Array<{ fieldKey: string; value: unknown; coOccurrenceRate: number }>;
  source: 'predicted';
}

/**
 * Predict missing fields based on co-occurrence patterns.
 * Finds fields the entity doesn't have yet, predicts values from correlated fields.
 */
export async function predictGhostFields(
  db: PrismaClient,
  entityType: string,
  entityId: string,
  options?: { minConfidence?: number; maxPredictions?: number },
): Promise<GhostFieldPrediction[]> {
  try {
    const minConfidence = options?.minConfidence ?? 0.3;
    const maxPredictions = options?.maxPredictions ?? 10;

    // Get entity's current fields
    const currentEntries = await db.knowledgeLedgerEntry.findMany({
      where: { entityType, entityId, supersededAt: null },
      include: { field: true },
    });

    if (currentEntries.length === 0) return [];

    const currentKeys = new Set(currentEntries.map((e) => e.field.key));

    // Get all field definitions for this entity type
    const allFields = await db.entityFieldDefinition.findMany({
      where: { entityType, isActive: true, status: 'approved' },
    });

    // Fields the entity is missing
    const missingFields = allFields.filter((f) => !currentKeys.has(f.key));
    if (missingFields.length === 0) return [];

    const predictions: GhostFieldPrediction[] = [];

    for (const missingField of missingFields) {
      if (predictions.length >= maxPredictions) break;

      // For each existing field, check co-occurrence with missing field
      for (const currentEntry of currentEntries) {
        const coMap = await buildCoOccurrenceMap(
          db, entityType, currentEntry.field.key, missingField.key, 3,
        );

        const currentValStr = String(currentEntry.value);
        const rates = coMap.get(currentValStr);
        if (!rates) continue;

        // Find the highest co-occurrence rate
        let bestValue: string | undefined;
        let bestRate = 0;

        for (const [val, data] of rates) {
          if (data.rate > bestRate) {
            bestRate = data.rate;
            bestValue = val;
          }
        }

        if (bestValue && bestRate >= minConfidence) {
          // Check if we already predicted this field
          const existing = predictions.find((p) => p.fieldKey === missingField.key);
          if (existing) {
            // Keep the one with higher confidence
            if (bestRate > existing.confidence) {
              existing.predictedValue = bestValue;
              existing.confidence = bestRate;
              existing.basedOn = [{
                fieldKey: currentEntry.field.key,
                value: currentEntry.value,
                coOccurrenceRate: bestRate,
              }];
            }
          } else {
            predictions.push({
              fieldKey: missingField.key,
              label: missingField.label,
              predictedValue: bestValue,
              confidence: bestRate,
              basedOn: [{
                fieldKey: currentEntry.field.key,
                value: currentEntry.value,
                coOccurrenceRate: bestRate,
              }],
              source: 'predicted',
            });
          }
        }
      }
    }

    return predictions;
  } catch (error) {
    const err = knowledgeError('KNOWLEDGE_355', { entityType, entityId, error: String(error) });
    console.error(`[${err.ref}] ${err.description}`, error);
    throw error;
  }
}

/**
 * Write predictions to ledger with source='predicted', low confidence.
 * Skips fields that already have a non-predicted value.
 */
export async function writeGhostFields(
  db: PrismaClient,
  entityType: string,
  entityId: string,
  predictions: GhostFieldPrediction[],
  callbacks?: MutationCallbacks,
): Promise<{ written: number; skipped: number }> {
  try {
    let written = 0;
    let skipped = 0;

    for (const prediction of predictions) {
      // Check if field already has a non-predicted current value
      const fieldDef = await db.entityFieldDefinition.findFirst({
        where: { entityType, key: prediction.fieldKey, isActive: true },
      });

      if (!fieldDef) {
        skipped++;
        continue;
      }

      const existing = await db.knowledgeLedgerEntry.findFirst({
        where: {
          fieldId: fieldDef.id,
          entityType,
          entityId,
          supersededAt: null,
          NOT: { source: 'predicted' },
        },
      });

      if (existing) {
        skipped++;
        continue;
      }

      // Supersede any existing predicted value
      await db.knowledgeLedgerEntry.updateMany({
        where: {
          fieldId: fieldDef.id,
          entityType,
          entityId,
          supersededAt: null,
        },
        data: { supersededAt: new Date() },
      });

      await db.knowledgeLedgerEntry.create({
        data: {
          fieldId: fieldDef.id,
          entityType,
          entityId,
          value: prediction.predictedValue as never,
          confidence: prediction.confidence,
          source: 'predicted',
          sourceId: null,
          setBy: null,
        },
      });

      written++;
    }

    if (written > 0) {
      try {
        await callbacks?.logActivity?.(
          'KNOWLEDGE_GHOST_WRITTEN',
          `${written} predicted field(s) written for ${entityType} ${entityId}`,
        );
      } catch {
        // Best-effort
      }
    }

    return { written, skipped };
  } catch (error) {
    const err = knowledgeError('KNOWLEDGE_356', { entityType, entityId, error: String(error) });
    console.error(`[${err.ref}] ${err.description}`, error);
    throw error;
  }
}
