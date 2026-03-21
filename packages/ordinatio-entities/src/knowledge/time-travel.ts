// ===========================================
// @ordinatio/entities — TIME-TRAVEL SIMULATION
// ===========================================
// Reconstruct entity knowledge state at any point in time.
// Uses existing createdAt and supersededAt — zero schema changes.
// ===========================================

import type { PrismaClient } from '../types';
import { knowledgeError } from '../errors';

/**
 * Reconstruct entity state at a point in time.
 * Finds entries that were active at `timestamp`:
 *   createdAt <= timestamp AND (supersededAt IS NULL OR supersededAt > timestamp)
 * Groups by field key, takes most recent entry per field.
 */
export async function getKnowledgeAt(
  db: PrismaClient,
  entityType: string,
  entityId: string,
  timestamp: Date,
): Promise<{
  fields: Record<string, { value: unknown; confidence: number; source: string; setAt: Date }>;
}> {
  try {
    const entries = await db.knowledgeLedgerEntry.findMany({
      where: {
        entityType,
        entityId,
        createdAt: { lte: timestamp },
        OR: [
          { supersededAt: null },
          { supersededAt: { gt: timestamp } },
        ],
      },
      include: { field: true },
      orderBy: { createdAt: 'desc' },
    });

    const fields: Record<string, { value: unknown; confidence: number; source: string; setAt: Date }> = {};

    for (const entry of entries) {
      const key = entry.field.key;
      // Take the most recent entry per field (ordered by createdAt desc)
      if (!fields[key]) {
        fields[key] = {
          value: entry.value,
          confidence: Number(entry.confidence),
          source: entry.source,
          setAt: entry.createdAt,
        };
      }
    }

    return { fields };
  } catch (error) {
    const err = knowledgeError('KNOWLEDGE_340', { entityType, entityId, timestamp: timestamp.toISOString(), error: String(error) });
    console.error(`[${err.ref}] ${err.description}`, error);
    throw error;
  }
}

/**
 * Single field value at a point in time.
 */
export async function getFieldValueAt(
  db: PrismaClient,
  entityType: string,
  entityId: string,
  fieldKey: string,
  timestamp: Date,
): Promise<{ value: unknown; confidence: number; source: string; setAt: Date } | null> {
  try {
    const fieldDef = await db.entityFieldDefinition.findFirst({
      where: { entityType, key: fieldKey },
    });

    if (!fieldDef) return null;

    const entry = await db.knowledgeLedgerEntry.findFirst({
      where: {
        fieldId: fieldDef.id,
        entityType,
        entityId,
        createdAt: { lte: timestamp },
        OR: [
          { supersededAt: null },
          { supersededAt: { gt: timestamp } },
        ],
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!entry) return null;

    return {
      value: entry.value,
      confidence: Number(entry.confidence),
      source: entry.source,
      setAt: entry.createdAt,
    };
  } catch (error) {
    const err = knowledgeError('KNOWLEDGE_340', { entityType, entityId, fieldKey, timestamp: timestamp.toISOString(), error: String(error) });
    console.error(`[${err.ref}] ${err.description}`, error);
    throw error;
  }
}

/**
 * Timeline of all changes within a date range.
 */
export async function getKnowledgeTimeline(
  db: PrismaClient,
  entityType: string,
  entityId: string,
  from: Date,
  to: Date,
  limit = 100,
): Promise<Array<{
  fieldKey: string;
  value: unknown;
  confidence: number;
  source: string;
  createdAt: Date;
  supersededAt: Date | null;
}>> {
  if (from > to) {
    const err = knowledgeError('KNOWLEDGE_341', { entityType, entityId, from: from.toISOString(), to: to.toISOString() });
    console.error(`[${err.ref}] ${err.description}`);
    throw new Error(err.description);
  }

  try {
    const entries = await db.knowledgeLedgerEntry.findMany({
      where: {
        entityType,
        entityId,
        createdAt: { gte: from, lte: to },
      },
      include: { field: true },
      orderBy: { createdAt: 'asc' },
      take: limit,
    });

    return entries.map((entry) => ({
      fieldKey: entry.field.key,
      value: entry.value,
      confidence: Number(entry.confidence),
      source: entry.source,
      createdAt: entry.createdAt,
      supersededAt: entry.supersededAt,
    }));
  } catch (error) {
    const err = knowledgeError('KNOWLEDGE_340', { entityType, entityId, error: String(error) });
    console.error(`[${err.ref}] ${err.description}`, error);
    throw error;
  }
}
