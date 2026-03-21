// ===========================================
// AGENT MEMORY SERVICE
// ===========================================
// Core CRUD for the agent memory system.
// Accepts AgentDb + AgentCallbacks instead of
// importing Prisma directly. Tags are the
// universal retrieval key.
// ===========================================

import type { AgentDb, AgentCallbacks, CreateMemoryInput, RecallFilters } from '../types';

// ---- Types ----

export interface MemoryWithTags {
  id: string;
  summary: string;
  detail: string | null;
  layer: string;
  role: string;
  source: string;
  clientId: string | null;
  orderId: string | null;
  expiresAt: Date | null;
  createdBy: string;
  accessCount: number;
  lastAccessedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  tags: Array<{ tag: { id: string; name: string; color: string } }>;
}

// ---- Create ----

export async function createMemory(
  db: AgentDb,
  input: CreateMemoryInput,
  callbacks?: AgentCallbacks,
): Promise<Record<string, unknown>> {
  const expiresAt = input.layer === 'TEMPORARY' && input.expiresAt
    ? input.expiresAt
    : null;

  const memory = await db.$transaction(async (tx) => {
    // 1. Create the memory
    const mem = await tx.agentMemory.create({
      data: {
        summary: input.summary,
        detail: input.detail ?? null,
        layer: input.layer,
        role: input.role,
        source: input.source,
        clientId: input.clientId ?? null,
        orderId: input.orderId ?? null,
        expiresAt,
        createdBy: input.createdBy,
      },
    });

    // 2. Resolve and attach tags
    if (input.tags && input.tags.length > 0) {
      for (const tagName of input.tags) {
        let tag = await tx.tag.findUnique({ where: { name: tagName } });
        if (!tag) {
          tag = await tx.tag.create({
            data: { name: tagName, color: '#6B7280' },
          });
        }
        await tx.memoryTag.create({
          data: { memoryId: (mem as Record<string, unknown>).id as string, tagId: tag.id },
        });
      }
    }

    return mem;
  });

  // 3. Log activity (non-blocking, best-effort)
  if (callbacks?.logActivity) {
    try {
      await callbacks.logActivity(
        'agent.memory_created',
        `Agent memory created: ${input.summary.slice(0, 80)}`,
        { layer: input.layer, role: input.role, source: input.source },
      );
    } catch {
      // Activity logging is passive
    }
  }

  return memory as Record<string, unknown>;
}

// ---- Recall ----

export async function recallMemories(
  db: AgentDb,
  filters: RecallFilters,
): Promise<Record<string, unknown>[]> {
  // Build where clause
  const where: Record<string, unknown> = {};
  const andConditions: unknown[] = [];

  // Role filter: match exact role OR global ('*')
  if (filters.role) {
    where.OR = [{ role: filters.role }, { role: '*' }];
  }

  if (filters.layer) {
    where.layer = filters.layer;
  }

  if (filters.clientId) {
    where.clientId = filters.clientId;
  }

  if (filters.orderId) {
    where.orderId = filters.orderId;
  }

  // Exclude expired by default
  andConditions.push({
    OR: [
      { expiresAt: null },
      { expiresAt: { gt: new Date() } },
    ],
  });

  // Tag filter
  if (filters.tags && filters.tags.length > 0) {
    where.tags = {
      some: {
        tag: { name: { in: filters.tags } },
      },
    };
  }

  if (andConditions.length > 0) {
    where.AND = andConditions;
  }

  const memories = await db.agentMemory.findMany({
    where,
    include: { tags: { include: { tag: true } } },
    orderBy: [
      { layer: 'asc' },
      { createdAt: 'desc' },
    ],
    take: filters.limit ?? 50,
  });

  // Update access counts (non-blocking)
  if (memories.length > 0) {
    db.agentMemory.updateMany({
      where: { id: { in: memories.map((m) => (m as Record<string, unknown>).id) } },
      data: {
        accessCount: { increment: 1 },
        lastAccessedAt: new Date(),
      },
    }).catch(() => {
      // Non-critical — access tracking is best-effort
    });
  }

  return memories;
}

// ---- Get Single ----

export async function getMemory(
  db: AgentDb,
  id: string,
): Promise<Record<string, unknown> | null> {
  return db.agentMemory.findUnique({
    where: { id },
    include: { tags: { include: { tag: true } } },
  });
}

// ---- Delete ----

export async function deleteMemory(
  db: AgentDb,
  id: string,
): Promise<boolean> {
  const existing = await db.agentMemory.findUnique({ where: { id } });
  if (!existing) return false;

  await db.agentMemory.delete({ where: { id } });
  return true;
}

// ---- Expire Stale ----

export async function expireStaleMemories(
  db: AgentDb,
  callbacks?: AgentCallbacks,
): Promise<number> {
  const result = await db.agentMemory.deleteMany({
    where: {
      layer: 'TEMPORARY',
      expiresAt: { lte: new Date() },
    },
  });

  if (result.count > 0 && callbacks?.logActivity) {
    try {
      await callbacks.logActivity(
        'agent.memory_expired',
        `${result.count} temporary memories expired`,
        { count: result.count },
      );
    } catch {
      // Activity logging is passive
    }
  }

  return result.count;
}
