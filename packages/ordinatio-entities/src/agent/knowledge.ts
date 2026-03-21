// ===========================================
// @ordinatio/entities — AGENT KNOWLEDGE
// ===========================================
// CRUD + query for the agent knowledge base.
// Includes seed-on-first-access via ensureDefaults().
// ===========================================

import { Prisma } from '@prisma/client';
import type { PrismaClient, SeedDataProvider } from '../types';
import { agentKnowledgeError } from '../errors';
import type {
  QueryKnowledgeInput,
  CreateKnowledgeEntryInput,
  UpdateKnowledgeEntryInput,
} from './schemas';

let seedChecked = false;

/**
 * Query knowledge entries by entity, field, and optional NL search.
 * Auto-seeds on first access if table is empty.
 */
export async function queryKnowledge(
  db: PrismaClient,
  input: QueryKnowledgeInput,
  seedProvider?: SeedDataProvider,
) {
  if (!seedChecked) {
    await ensureKnowledgeDefaults(db, seedProvider);
    seedChecked = true;
  }

  const { entity, field, search, category, limit } = input;

  const where: Record<string, unknown> = {
    entity,
    isActive: true,
  };

  if (field) where.field = field;
  if (category) where.category = category;

  if (search) {
    const searchLower = search.toLowerCase();
    const terms = searchLower.split(/\s+/).filter(Boolean);

    const entries = await db.agentKnowledge.findMany({
      where: {
        ...where,
        OR: [
          { value: { contains: searchLower, mode: 'insensitive' } },
          { label: { contains: searchLower, mode: 'insensitive' } },
        ],
      },
      orderBy: [{ sortOrder: 'asc' }, { label: 'asc' }],
      take: limit,
    });

    const aliasEntries = await db.agentKnowledge.findMany({
      where: {
        ...where,
        id: { notIn: entries.map((e) => e.id) },
      },
      orderBy: [{ sortOrder: 'asc' }, { label: 'asc' }],
    });

    const aliasMatches = aliasEntries.filter((entry) =>
      entry.aliases.some((alias) =>
        terms.every((term) => alias.toLowerCase().includes(term)),
      ),
    );

    return [...entries, ...aliasMatches].slice(0, limit);
  }

  return db.agentKnowledge.findMany({
    where,
    orderBy: [{ sortOrder: 'asc' }, { label: 'asc' }],
    take: limit,
  });
}

export async function createKnowledgeEntry(db: PrismaClient, input: CreateKnowledgeEntryInput) {
  const existing = await db.agentKnowledge.findUnique({
    where: {
      entity_field_value: {
        entity: input.entity,
        field: input.field,
        value: input.value,
      },
    },
  });

  if (existing) {
    throw agentKnowledgeError('AGENTKNOW_403', {
      entity: input.entity,
      field: input.field,
      value: input.value,
    });
  }

  return db.agentKnowledge.create({
    data: {
      entity: input.entity,
      field: input.field,
      value: input.value,
      label: input.label,
      aliases: input.aliases,
      category: input.category ?? null,
      metadata: (input.metadata as Prisma.InputJsonValue) ?? Prisma.JsonNull,
      sortOrder: input.sortOrder,
      source: 'manual',
    },
  });
}

export async function updateKnowledgeEntry(
  db: PrismaClient,
  id: string,
  input: UpdateKnowledgeEntryInput,
) {
  const existing = await db.agentKnowledge.findUnique({ where: { id } });
  if (!existing) {
    throw agentKnowledgeError('AGENTKNOW_404', { id });
  }

  return db.agentKnowledge.update({
    where: { id },
    data: {
      ...(input.label !== undefined && { label: input.label }),
      ...(input.aliases !== undefined && { aliases: input.aliases }),
      ...(input.category !== undefined && { category: input.category }),
      ...(input.metadata !== undefined && { metadata: input.metadata as Prisma.InputJsonValue }),
      ...(input.sortOrder !== undefined && { sortOrder: input.sortOrder }),
      ...(input.isActive !== undefined && { isActive: input.isActive }),
    },
  });
}

export async function deleteKnowledgeEntry(db: PrismaClient, id: string) {
  const existing = await db.agentKnowledge.findUnique({ where: { id } });
  if (!existing) {
    throw agentKnowledgeError('AGENTKNOW_405', { id });
  }

  return db.agentKnowledge.delete({ where: { id } });
}

/**
 * Seeds the AgentKnowledge table with default data if empty.
 * Uses SeedDataProvider callback so package doesn't need app-specific data.
 */
export async function ensureKnowledgeDefaults(db: PrismaClient, seedProvider?: SeedDataProvider) {
  const count = await db.agentKnowledge.count();
  if (count > 0) return;

  const seedData = seedProvider?.getKnowledgeSeedData?.();
  if (!seedData || seedData.length === 0) return;

  try {
    await db.agentKnowledge.createMany({
      data: seedData.map((entry) => ({
        ...entry,
        metadata: entry.metadata === null ? Prisma.JsonNull : (entry.metadata as Prisma.InputJsonValue),
      })),
      skipDuplicates: true,
    });
  } catch (error) {
    console.error(
      '[AGENTKNOW_409] Failed to seed knowledge defaults:',
      error instanceof Error ? error.message : error,
    );
  }
}

/**
 * Reset knowledge to defaults: delete all seed entries and re-seed.
 */
export async function resetKnowledgeDefaults(db: PrismaClient, seedProvider?: SeedDataProvider) {
  const seedData = seedProvider?.getKnowledgeSeedData?.();
  if (!seedData || seedData.length === 0) {
    throw agentKnowledgeError('AGENTKNOW_410', { error: 'No seed data provider available' });
  }

  try {
    await db.$transaction(async (tx: PrismaClient) => {
      await tx.agentKnowledge.deleteMany({ where: { source: 'seed' } });
      await tx.agentKnowledge.createMany({
        data: seedData.map((entry) => ({
          ...entry,
          metadata: entry.metadata === null ? Prisma.JsonNull : (entry.metadata as Prisma.InputJsonValue),
        })),
        skipDuplicates: true,
      });
    });

    seedChecked = false;
  } catch (error) {
    throw agentKnowledgeError('AGENTKNOW_410', {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * Reset the seed-checked flag (for testing).
 */
export function resetSeedCheck() {
  seedChecked = false;
}
