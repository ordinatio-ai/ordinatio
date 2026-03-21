// ===========================================
// @ordinatio/entities — KNOWLEDGE LEDGER
// ===========================================
// Immutable append-only ledger for entity field values.
// Old values are superseded, never deleted.
// ===========================================

import type { PrismaClient, MutationCallbacks, ObserverCallbacks } from '../types';
import { knowledgeError } from '../errors';

export async function getEntityFields(db: PrismaClient, entityType: string, entityId: string) {
  try {
    const entries = await db.knowledgeLedgerEntry.findMany({
      where: {
        entityType,
        entityId,
        supersededAt: null,
      },
      include: {
        field: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    const grouped: Record<string, Array<{
      fieldId: string;
      key: string;
      label: string;
      dataType: string;
      category: string;
      value: unknown;
      confidence: number;
      source: string;
      updatedAt: Date;
    }>> = {};

    for (const entry of entries) {
      const cat = entry.field.category;
      if (!grouped[cat]) grouped[cat] = [];
      grouped[cat].push({
        fieldId: entry.fieldId,
        key: entry.field.key,
        label: entry.field.label,
        dataType: entry.field.dataType,
        category: cat,
        value: entry.value,
        confidence: Number(entry.confidence),
        source: entry.source,
        updatedAt: entry.createdAt,
      });
    }

    return { entries, grouped };
  } catch (error) {
    const err = knowledgeError('KNOWLEDGE_310', { entityType, entityId, error: String(error) });
    console.error(`[${err.ref}] ${err.description}`, error);
    throw error;
  }
}

export async function setEntityFields(
  db: PrismaClient,
  entityType: string,
  entityId: string,
  fields: Record<string, unknown>,
  source: string,
  sourceId?: string,
  confidence: number = 1.0,
  setBy?: string,
  callbacks?: MutationCallbacks,
) {
  try {
    const fieldKeys = Object.keys(fields);
    const fieldDefs = await db.entityFieldDefinition.findMany({
      where: {
        entityType,
        key: { in: fieldKeys },
        isActive: true,
        status: 'approved',
      },
    });

    const defMap = new Map(fieldDefs.map((d) => [d.key, d]));
    const results: Array<{ key: string; entryId: string }> = [];
    const skipped: string[] = [];

    for (const [key, value] of Object.entries(fields)) {
      const def = defMap.get(key);
      if (!def) {
        skipped.push(key);
        continue;
      }

      await db.knowledgeLedgerEntry.updateMany({
        where: {
          fieldId: def.id,
          entityType,
          entityId,
          supersededAt: null,
        },
        data: { supersededAt: new Date() },
      });

      const entry = await db.knowledgeLedgerEntry.create({
        data: {
          fieldId: def.id,
          entityType,
          entityId,
          value: value as never,
          confidence,
          source,
          sourceId: sourceId ?? null,
          setBy: setBy ?? null,
        },
      });

      results.push({ key, entryId: entry.id });
    }

    if (skipped.length > 0) {
      const err = knowledgeError('KNOWLEDGE_313', { entityType, entityId, skippedKeys: skipped });
      console.warn(`[${err.ref}] ${err.description}`, skipped);
    }

    if (results.length > 0) {
      try {
        await callbacks?.logActivity?.(
          'KNOWLEDGE_VALUE_SET',
          `${results.length} knowledge field(s) set on ${entityType} ${entityId}`,
          entityType === 'client' ? { clientId: entityId } : undefined,
        );
      } catch {
        // Best-effort
      }

      // Fire constraint observers (best-effort)
      try {
        const { fireObservers } = await import('./observer');
        await fireObservers(db, entityType, entityId, results.map(r => r.key), callbacks as ObserverCallbacks);
      } catch {
        // Best-effort — observers failing should never block writes
      }
    }

    return { written: results, skipped };
  } catch (error) {
    const err = knowledgeError('KNOWLEDGE_311', { entityType, entityId, error: String(error) });
    console.error(`[${err.ref}] ${err.description}`, error);
    throw error;
  }
}

export async function getFieldHistory(
  db: PrismaClient,
  entityType: string,
  entityId: string,
  fieldId?: string,
  limit = 50,
) {
  try {
    const entries = await db.knowledgeLedgerEntry.findMany({
      where: {
        entityType,
        entityId,
        ...(fieldId ? { fieldId } : {}),
      },
      include: { field: true },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    return entries;
  } catch (error) {
    const err = knowledgeError('KNOWLEDGE_312', { entityType, entityId, fieldId, error: String(error) });
    console.error(`[${err.ref}] ${err.description}`, error);
    throw error;
  }
}
