// ===========================================
// @ordinatio/entities — KNOWLEDGE SEARCH TESTS
// ===========================================

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  searchByFields,
  logSearchQuery,
  getWeekOfYear,
} from '../src/knowledge/search';

function createMockDb() {
  return {
    entityFieldDefinition: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      count: vi.fn(),
    },
    knowledgeLedgerEntry: {
      findMany: vi.fn(),
      create: vi.fn(),
      updateMany: vi.fn(),
    },
    searchQueryLog: {
      create: vi.fn(),
    },
  } as any;
}

describe('searchByFields', () => {
  let db: ReturnType<typeof createMockDb>;

  beforeEach(() => {
    db = createMockDb();
    vi.restoreAllMocks();
  });

  it('returns matching entity IDs for a single filter', async () => {
    const fieldDef = { id: 'fd-1', key: 'city', entityType: 'client', isActive: true };
    db.entityFieldDefinition.findFirst.mockResolvedValue(fieldDef);
    db.knowledgeLedgerEntry.findMany.mockResolvedValue([
      { entityId: 'c-1' },
      { entityId: 'c-2' },
    ]);

    const result = await searchByFields(db, 'client', { city: 'Detroit' });

    expect(result.entityIds).toEqual(['c-1', 'c-2']);
    expect(result.total).toBe(2);
  });

  it('intersects results across multiple filters', async () => {
    // First filter: city = Detroit matches c-1, c-2, c-3
    db.entityFieldDefinition.findFirst
      .mockResolvedValueOnce({ id: 'fd-city', key: 'city', entityType: 'client', isActive: true })
      .mockResolvedValueOnce({ id: 'fd-style', key: 'style', entityType: 'client', isActive: true });

    db.knowledgeLedgerEntry.findMany
      .mockResolvedValueOnce([{ entityId: 'c-1' }, { entityId: 'c-2' }, { entityId: 'c-3' }])
      .mockResolvedValueOnce([{ entityId: 'c-2' }, { entityId: 'c-3' }, { entityId: 'c-4' }]);

    const result = await searchByFields(db, 'client', { city: 'Detroit', style: 'classic' });

    expect(result.entityIds).toEqual(['c-2', 'c-3']);
    expect(result.total).toBe(2);
  });

  it('returns empty when no entities match all filters', async () => {
    db.entityFieldDefinition.findFirst
      .mockResolvedValueOnce({ id: 'fd-a', key: 'a', entityType: 'client', isActive: true })
      .mockResolvedValueOnce({ id: 'fd-b', key: 'b', entityType: 'client', isActive: true });

    db.knowledgeLedgerEntry.findMany
      .mockResolvedValueOnce([{ entityId: 'c-1' }])
      .mockResolvedValueOnce([{ entityId: 'c-2' }]);

    const result = await searchByFields(db, 'client', { a: 'x', b: 'y' });

    expect(result.entityIds).toEqual([]);
    expect(result.total).toBe(0);
  });

  it('skips unknown field keys gracefully', async () => {
    db.entityFieldDefinition.findFirst.mockResolvedValue(null);

    const result = await searchByFields(db, 'client', { nonexistent: 'value' });

    expect(result.entityIds).toEqual([]);
    expect(result.total).toBe(0);
    expect(db.knowledgeLedgerEntry.findMany).not.toHaveBeenCalled();
  });

  it('respects the limit parameter', async () => {
    const fieldDef = { id: 'fd-x', key: 'x', entityType: 'client', isActive: true };
    db.entityFieldDefinition.findFirst.mockResolvedValue(fieldDef);
    db.knowledgeLedgerEntry.findMany.mockResolvedValue(
      Array.from({ length: 20 }, (_, i) => ({ entityId: `c-${i}` })),
    );

    const result = await searchByFields(db, 'client', { x: 'val' }, 5);

    expect(result.entityIds).toHaveLength(5);
    expect(result.total).toBe(20);
  });

  it('queries only non-superseded ledger entries', async () => {
    const fieldDef = { id: 'fd-q', key: 'q', entityType: 'client', isActive: true };
    db.entityFieldDefinition.findFirst.mockResolvedValue(fieldDef);
    db.knowledgeLedgerEntry.findMany.mockResolvedValue([]);

    await searchByFields(db, 'client', { q: 'test' });

    expect(db.knowledgeLedgerEntry.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          supersededAt: null,
          value: { equals: 'test' },
        }),
      }),
    );
  });

  it('short-circuits when intersection becomes empty', async () => {
    db.entityFieldDefinition.findFirst
      .mockResolvedValueOnce({ id: 'fd-1', key: 'a', entityType: 'client', isActive: true })
      .mockResolvedValueOnce({ id: 'fd-2', key: 'b', entityType: 'client', isActive: true });

    db.knowledgeLedgerEntry.findMany
      .mockResolvedValueOnce([{ entityId: 'c-1' }])
      .mockResolvedValueOnce([{ entityId: 'c-99' }]);

    const result = await searchByFields(db, 'client', { a: 'x', b: 'y' });

    expect(result.entityIds).toEqual([]);
    // The third filter should NOT be queried because intersection is already empty
  });

  it('throws and logs error when DB call fails', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const dbError = new Error('search failed');
    db.entityFieldDefinition.findFirst.mockRejectedValue(dbError);

    await expect(searchByFields(db, 'client', { x: 'v' })).rejects.toThrow('search failed');
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('KNOWLEDGE_305'),
      dbError,
    );
  });
});

describe('logSearchQuery', () => {
  let db: ReturnType<typeof createMockDb>;

  beforeEach(() => {
    db = createMockDb();
    vi.restoreAllMocks();
  });

  it('creates a search query log entry with temporal fields', async () => {
    db.searchQueryLog.create.mockResolvedValue({ id: 'sq-1' });

    await logSearchQuery(db, {
      query: 'detroit clients',
      source: 'search_bar' as const,
      userId: 'u-1',
      entityType: 'client' as const,
      resultCount: 5,
    });

    expect(db.searchQueryLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        query: 'detroit clients',
        source: 'search_bar',
        userId: 'u-1',
        entityType: 'client',
        resultCount: 5,
        hourOfDay: expect.any(Number),
        dayOfWeek: expect.any(Number),
        monthOfYear: expect.any(Number),
        weekOfYear: expect.any(Number),
      }),
    });
  });

  it('handles optional fields as null', async () => {
    db.searchQueryLog.create.mockResolvedValue({ id: 'sq-2' });

    await logSearchQuery(db, {
      query: 'wool fabric',
      source: 'agent_chat' as const,
    });

    expect(db.searchQueryLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        query: 'wool fabric',
        source: 'agent_chat',
        userId: null,
        entityType: null,
        resultCount: null,
      }),
    });
  });

  it('does not throw when DB create fails (best-effort)', async () => {
    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    db.searchQueryLog.create.mockRejectedValue(new Error('disk full'));

    await expect(
      logSearchQuery(db, { query: 'test', source: 'api' as const }),
    ).resolves.toBeUndefined();

    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('KNOWLEDGE_320'),
    );
  });
});

describe('getWeekOfYear', () => {
  it('returns 1 for January 1st', () => {
    const jan1 = new Date(2026, 0, 1);
    expect(getWeekOfYear(jan1)).toBe(1);
  });

  it('returns a higher week number for later dates', () => {
    const march6 = new Date(2026, 2, 6);
    const weekNum = getWeekOfYear(march6);
    expect(weekNum).toBeGreaterThan(9);
    expect(weekNum).toBeLessThanOrEqual(11);
  });

  it('returns 52 or 53 for December 31st', () => {
    const dec31 = new Date(2026, 11, 31);
    const weekNum = getWeekOfYear(dec31);
    expect(weekNum).toBeGreaterThanOrEqual(52);
    expect(weekNum).toBeLessThanOrEqual(54);
  });

  it('returns consistent values for the same date', () => {
    const date = new Date(2026, 5, 15);
    expect(getWeekOfYear(date)).toBe(getWeekOfYear(date));
  });
});
