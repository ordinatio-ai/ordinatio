// ===========================================
// @ordinatio/entities — KNOWLEDGE SEARCH
// ===========================================
// Search entities by field values + query logging.
// ===========================================

import type { PrismaClient } from '../types';
import { knowledgeError } from '../errors';
import type { LogSearchQueryInput } from './schemas';

export async function searchByFields(
  db: PrismaClient,
  entityType: string,
  filters: Record<string, unknown>,
  limit = 50,
) {
  try {
    const filterEntries = Object.entries(filters);
    let matchingEntityIds: string[] | null = null;

    for (const [key, value] of filterEntries) {
      const fieldDef = await db.entityFieldDefinition.findFirst({
        where: { entityType, key, isActive: true },
      });

      if (!fieldDef) continue;

      const entries = await db.knowledgeLedgerEntry.findMany({
        where: {
          fieldId: fieldDef.id,
          entityType,
          supersededAt: null,
          value: { equals: value as never },
        },
        select: { entityId: true },
        distinct: ['entityId'],
      });

      const ids = entries.map((e) => e.entityId);

      if (matchingEntityIds === null) {
        matchingEntityIds = ids;
      } else {
        const idSet = new Set(ids);
        matchingEntityIds = matchingEntityIds.filter((id) => idSet.has(id));
      }

      if (matchingEntityIds.length === 0) break;
    }

    const entityIds = (matchingEntityIds ?? []).slice(0, limit);
    return { entityIds, total: matchingEntityIds?.length ?? 0 };
  } catch (error) {
    const err = knowledgeError('KNOWLEDGE_305', { entityType, filters, error: String(error) });
    console.error(`[${err.ref}] ${err.description}`, error);
    throw error;
  }
}

export async function logSearchQuery(db: PrismaClient, input: LogSearchQueryInput) {
  try {
    const now = new Date();
    await db.searchQueryLog.create({
      data: {
        query: input.query,
        source: input.source,
        userId: input.userId ?? null,
        entityType: input.entityType ?? null,
        resultCount: input.resultCount ?? null,
        hourOfDay: now.getHours(),
        dayOfWeek: now.getDay(),
        monthOfYear: now.getMonth() + 1,
        weekOfYear: getWeekOfYear(now),
      },
    });
  } catch (error) {
    const err = knowledgeError('KNOWLEDGE_320', { input, error: String(error) });
    console.warn(`[${err.ref}] ${err.description}`);
  }
}

export function getWeekOfYear(date: Date): number {
  const start = new Date(date.getFullYear(), 0, 1);
  const diff = date.getTime() - start.getTime();
  const oneWeek = 7 * 24 * 60 * 60 * 1000;
  return Math.ceil((diff / oneWeek) + 1);
}
