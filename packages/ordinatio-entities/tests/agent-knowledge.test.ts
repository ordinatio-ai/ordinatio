// ===========================================
// @ordinatio/entities — AGENT KNOWLEDGE TESTS
// ===========================================

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@prisma/client', () => ({
  Prisma: { JsonNull: '__json_null__', InputJsonValue: {} },
}));

import {
  queryKnowledge,
  createKnowledgeEntry,
  updateKnowledgeEntry,
  deleteKnowledgeEntry,
  ensureKnowledgeDefaults,
  resetKnowledgeDefaults,
  resetSeedCheck,
} from '../src/agent/knowledge';
import type { SeedDataProvider } from '../src/types';

function createMockDb() {
  return {
    agentKnowledge: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      createMany: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      deleteMany: vi.fn(),
      count: vi.fn(),
    },
    agentPreference: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    agentInteraction: {
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      count: vi.fn(),
    },
    agentSuggestion: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    $transaction: vi.fn(),
  } as any;
}

function makeSeedProvider(data?: any[]): SeedDataProvider {
  return {
    getKnowledgeSeedData: () =>
      data ?? [
        {
          entity: 'order-item',
          field: 'fabric',
          value: 'A754-21',
          label: 'Ariston A754-21',
          aliases: ['ariston navy'],
          category: 'fabric',
          metadata: null,
          sortOrder: 0,
          source: 'seed',
        },
      ],
  };
}

describe('queryKnowledge', () => {
  let db: ReturnType<typeof createMockDb>;

  beforeEach(() => {
    db = createMockDb();
    vi.restoreAllMocks();
    resetSeedCheck();
  });

  it('auto-seeds on first access when table is empty', async () => {
    db.agentKnowledge.count.mockResolvedValue(0);
    db.agentKnowledge.createMany.mockResolvedValue({ count: 1 });
    db.agentKnowledge.findMany.mockResolvedValue([]);

    await queryKnowledge(db, { entity: 'order-item', limit: 50 }, makeSeedProvider());

    expect(db.agentKnowledge.count).toHaveBeenCalled();
    expect(db.agentKnowledge.createMany).toHaveBeenCalled();
  });

  it('skips seeding when table is not empty', async () => {
    db.agentKnowledge.count.mockResolvedValue(5);
    db.agentKnowledge.findMany.mockResolvedValue([]);

    await queryKnowledge(db, { entity: 'order-item', limit: 50 }, makeSeedProvider());

    expect(db.agentKnowledge.count).toHaveBeenCalled();
    expect(db.agentKnowledge.createMany).not.toHaveBeenCalled();
  });

  it('only checks seed once per module lifecycle', async () => {
    db.agentKnowledge.count.mockResolvedValue(5);
    db.agentKnowledge.findMany.mockResolvedValue([]);

    await queryKnowledge(db, { entity: 'order-item', limit: 50 });
    await queryKnowledge(db, { entity: 'order-item', limit: 50 });

    expect(db.agentKnowledge.count).toHaveBeenCalledTimes(1);
  });

  it('returns all entries without search', async () => {
    const entries = [
      { id: '1', entity: 'order-item', field: 'fabric', value: 'A754-21', label: 'Ariston', aliases: [] },
      { id: '2', entity: 'order-item', field: 'fabric', value: 'B100-01', label: 'Caccioppoli', aliases: [] },
    ];
    db.agentKnowledge.count.mockResolvedValue(2);
    db.agentKnowledge.findMany.mockResolvedValue(entries);

    const result = await queryKnowledge(db, { entity: 'order-item', limit: 50 });

    expect(result).toHaveLength(2);
    expect(db.agentKnowledge.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ entity: 'order-item', isActive: true }),
        orderBy: [{ sortOrder: 'asc' }, { label: 'asc' }],
        take: 50,
      }),
    );
  });

  it('filters by field and category when provided', async () => {
    db.agentKnowledge.count.mockResolvedValue(2);
    db.agentKnowledge.findMany.mockResolvedValue([]);

    await queryKnowledge(db, { entity: 'order-item', field: 'fabric', category: 'suiting', limit: 10 });

    expect(db.agentKnowledge.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          entity: 'order-item',
          field: 'fabric',
          category: 'suiting',
          isActive: true,
        }),
      }),
    );
  });

  it('searches by value and label with insensitive mode', async () => {
    const directMatches = [
      { id: '1', entity: 'order-item', field: 'fabric', value: 'navy', label: 'Navy Blue', aliases: [] },
    ];
    db.agentKnowledge.count.mockResolvedValue(5);
    // First call: direct matches (value/label search)
    db.agentKnowledge.findMany
      .mockResolvedValueOnce(directMatches)
      // Second call: alias candidates
      .mockResolvedValueOnce([]);

    const result = await queryKnowledge(db, { entity: 'order-item', search: 'navy', limit: 50 });

    expect(result).toHaveLength(1);
    expect(result[0].value).toBe('navy');
    const firstCallArgs = db.agentKnowledge.findMany.mock.calls[0][0];
    expect(firstCallArgs.where.OR).toBeDefined();
  });

  it('includes alias matches in search results', async () => {
    const directMatches = [
      { id: '1', entity: 'order-item', value: 'A754-21', label: 'Ariston A754-21', aliases: [] },
    ];
    const aliasCandidates = [
      { id: '2', entity: 'order-item', value: 'B200-05', label: 'Other', aliases: ['ariston navy'] },
      { id: '3', entity: 'order-item', value: 'C300-01', label: 'No Match', aliases: ['red stripe'] },
    ];
    db.agentKnowledge.count.mockResolvedValue(5);
    db.agentKnowledge.findMany
      .mockResolvedValueOnce(directMatches)
      .mockResolvedValueOnce(aliasCandidates);

    const result = await queryKnowledge(db, { entity: 'order-item', search: 'ariston navy', limit: 50 });

    expect(result).toHaveLength(2);
    expect(result.map((r) => r.id)).toContain('1');
    expect(result.map((r) => r.id)).toContain('2');
  });

  it('respects limit when combining direct and alias matches', async () => {
    const directMatches = [
      { id: '1', entity: 'order-item', value: 'match1', label: 'M1', aliases: [] },
    ];
    const aliasCandidates = [
      { id: '2', entity: 'order-item', value: 'match2', label: 'M2', aliases: ['match'] },
      { id: '3', entity: 'order-item', value: 'match3', label: 'M3', aliases: ['match'] },
    ];
    db.agentKnowledge.count.mockResolvedValue(5);
    db.agentKnowledge.findMany
      .mockResolvedValueOnce(directMatches)
      .mockResolvedValueOnce(aliasCandidates);

    const result = await queryKnowledge(db, { entity: 'order-item', search: 'match', limit: 2 });

    expect(result).toHaveLength(2);
  });
});

describe('createKnowledgeEntry', () => {
  let db: ReturnType<typeof createMockDb>;

  beforeEach(() => {
    db = createMockDb();
    vi.restoreAllMocks();
  });

  it('creates a new entry', async () => {
    db.agentKnowledge.findUnique.mockResolvedValue(null);
    const created = { id: 'new-1', entity: 'order-item', field: 'fabric', value: 'X100', label: 'Test' };
    db.agentKnowledge.create.mockResolvedValue(created);

    const result = await createKnowledgeEntry(db, {
      entity: 'order-item',
      field: 'fabric',
      value: 'X100',
      label: 'Test',
      aliases: ['test fabric'],
      sortOrder: 0,
    });

    expect(result).toEqual(created);
    expect(db.agentKnowledge.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          entity: 'order-item',
          field: 'fabric',
          value: 'X100',
          label: 'Test',
          aliases: ['test fabric'],
          source: 'manual',
        }),
      }),
    );
  });

  it('throws AGENTKNOW_403 on duplicate entity/field/value', async () => {
    db.agentKnowledge.findUnique.mockResolvedValue({ id: 'existing-1' });

    await expect(
      createKnowledgeEntry(db, {
        entity: 'order-item',
        field: 'fabric',
        value: 'X100',
        label: 'Test',
        aliases: [],
        sortOrder: 0,
      }),
    ).rejects.toMatchObject({ code: 'AGENTKNOW_403' });
  });
});

describe('updateKnowledgeEntry', () => {
  let db: ReturnType<typeof createMockDb>;

  beforeEach(() => {
    db = createMockDb();
    vi.restoreAllMocks();
  });

  it('updates an existing entry', async () => {
    db.agentKnowledge.findUnique.mockResolvedValue({ id: 'entry-1', label: 'Old Label' });
    const updated = { id: 'entry-1', label: 'New Label' };
    db.agentKnowledge.update.mockResolvedValue(updated);

    const result = await updateKnowledgeEntry(db, 'entry-1', { label: 'New Label' });

    expect(result).toEqual(updated);
    expect(db.agentKnowledge.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'entry-1' },
        data: expect.objectContaining({ label: 'New Label' }),
      }),
    );
  });

  it('throws AGENTKNOW_404 when entry not found', async () => {
    db.agentKnowledge.findUnique.mockResolvedValue(null);

    await expect(
      updateKnowledgeEntry(db, 'missing-id', { label: 'X' }),
    ).rejects.toMatchObject({ code: 'AGENTKNOW_404' });
  });

  it('only includes provided fields in update data', async () => {
    db.agentKnowledge.findUnique.mockResolvedValue({ id: 'entry-1' });
    db.agentKnowledge.update.mockResolvedValue({ id: 'entry-1' });

    await updateKnowledgeEntry(db, 'entry-1', { isActive: false });

    const updateCall = db.agentKnowledge.update.mock.calls[0][0];
    expect(updateCall.data).toEqual({ isActive: false });
    expect(updateCall.data).not.toHaveProperty('label');
    expect(updateCall.data).not.toHaveProperty('aliases');
  });
});

describe('deleteKnowledgeEntry', () => {
  let db: ReturnType<typeof createMockDb>;

  beforeEach(() => {
    db = createMockDb();
    vi.restoreAllMocks();
  });

  it('deletes an existing entry', async () => {
    db.agentKnowledge.findUnique.mockResolvedValue({ id: 'entry-1' });
    db.agentKnowledge.delete.mockResolvedValue({ id: 'entry-1' });

    const result = await deleteKnowledgeEntry(db, 'entry-1');

    expect(result).toEqual({ id: 'entry-1' });
    expect(db.agentKnowledge.delete).toHaveBeenCalledWith({ where: { id: 'entry-1' } });
  });

  it('throws AGENTKNOW_405 when entry not found', async () => {
    db.agentKnowledge.findUnique.mockResolvedValue(null);

    await expect(
      deleteKnowledgeEntry(db, 'missing-id'),
    ).rejects.toMatchObject({ code: 'AGENTKNOW_405' });
  });
});

describe('ensureKnowledgeDefaults', () => {
  let db: ReturnType<typeof createMockDb>;

  beforeEach(() => {
    db = createMockDb();
    vi.restoreAllMocks();
    resetSeedCheck();
  });

  it('seeds when table is empty and provider returns data', async () => {
    db.agentKnowledge.count.mockResolvedValue(0);
    db.agentKnowledge.createMany.mockResolvedValue({ count: 1 });

    await ensureKnowledgeDefaults(db, makeSeedProvider());

    expect(db.agentKnowledge.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        skipDuplicates: true,
      }),
    );
  });

  it('skips seeding when table already has data', async () => {
    db.agentKnowledge.count.mockResolvedValue(10);

    await ensureKnowledgeDefaults(db, makeSeedProvider());

    expect(db.agentKnowledge.createMany).not.toHaveBeenCalled();
  });

  it('handles missing seedProvider gracefully', async () => {
    db.agentKnowledge.count.mockResolvedValue(0);

    await ensureKnowledgeDefaults(db, undefined);

    expect(db.agentKnowledge.createMany).not.toHaveBeenCalled();
  });

  it('handles seedProvider returning empty array', async () => {
    db.agentKnowledge.count.mockResolvedValue(0);

    await ensureKnowledgeDefaults(db, { getKnowledgeSeedData: () => [] });

    expect(db.agentKnowledge.createMany).not.toHaveBeenCalled();
  });

  it('logs error on createMany failure without throwing', async () => {
    db.agentKnowledge.count.mockResolvedValue(0);
    db.agentKnowledge.createMany.mockRejectedValue(new Error('DB error'));
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await ensureKnowledgeDefaults(db, makeSeedProvider());

    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('AGENTKNOW_409'),
      expect.any(String),
    );
    consoleSpy.mockRestore();
  });
});

describe('resetKnowledgeDefaults', () => {
  let db: ReturnType<typeof createMockDb>;

  beforeEach(() => {
    db = createMockDb();
    vi.restoreAllMocks();
    resetSeedCheck();
  });

  it('deletes seed entries and re-seeds inside a transaction', async () => {
    const txDb = createMockDb();
    txDb.agentKnowledge.deleteMany.mockResolvedValue({ count: 5 });
    txDb.agentKnowledge.createMany.mockResolvedValue({ count: 1 });
    db.$transaction.mockImplementation(async (fn: (tx: any) => Promise<void>) => {
      await fn(txDb);
    });

    await resetKnowledgeDefaults(db, makeSeedProvider());

    expect(txDb.agentKnowledge.deleteMany).toHaveBeenCalledWith({ where: { source: 'seed' } });
    expect(txDb.agentKnowledge.createMany).toHaveBeenCalled();
  });

  it('throws AGENTKNOW_410 when no seed provider available', async () => {
    await expect(
      resetKnowledgeDefaults(db, undefined),
    ).rejects.toMatchObject({ code: 'AGENTKNOW_410' });
  });

  it('throws AGENTKNOW_410 when seed data is empty', async () => {
    await expect(
      resetKnowledgeDefaults(db, { getKnowledgeSeedData: () => [] }),
    ).rejects.toMatchObject({ code: 'AGENTKNOW_410' });
  });

  it('throws AGENTKNOW_410 when transaction fails', async () => {
    db.$transaction.mockRejectedValue(new Error('Transaction failed'));

    await expect(
      resetKnowledgeDefaults(db, makeSeedProvider()),
    ).rejects.toMatchObject({ code: 'AGENTKNOW_410' });
  });
});
