// ===========================================
// @ordinatio/entities — TIME-TRAVEL TESTS
// ===========================================

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@prisma/client', () => ({
  Prisma: { JsonNull: '__json_null__', InputJsonValue: {} },
}));

import {
  getKnowledgeAt,
  getFieldValueAt,
  getKnowledgeTimeline,
} from '../src/knowledge/time-travel';

function createMockDb() {
  return {
    knowledgeLedgerEntry: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
    },
    entityFieldDefinition: {
      findFirst: vi.fn(),
    },
  } as any;
}

const JAN_1 = new Date('2026-01-01T00:00:00Z');
const JAN_15 = new Date('2026-01-15T00:00:00Z');
const FEB_1 = new Date('2026-02-01T00:00:00Z');
const MAR_1 = new Date('2026-03-01T00:00:00Z');

// ----- getKnowledgeAt -----

describe('getKnowledgeAt', () => {
  let db: ReturnType<typeof createMockDb>;

  beforeEach(() => {
    db = createMockDb();
    vi.restoreAllMocks();
  });

  it('returns fields active at the given timestamp', async () => {
    db.knowledgeLedgerEntry.findMany.mockResolvedValue([
      {
        id: 'le-1', fieldId: 'fd-1', entityType: 'client', entityId: 'c-1',
        value: 'navy', confidence: 0.9, source: 'manual', createdAt: JAN_1, supersededAt: null,
        field: { key: 'fav_color', label: 'Favorite Color', dataType: 'text', category: 'preferences' },
      },
    ]);

    const result = await getKnowledgeAt(db, 'client', 'c-1', JAN_15);

    expect(result.fields).toHaveProperty('fav_color');
    expect(result.fields.fav_color.value).toBe('navy');
    expect(result.fields.fav_color.confidence).toBe(0.9);
    expect(result.fields.fav_color.source).toBe('manual');
    expect(result.fields.fav_color.setAt).toEqual(JAN_1);
  });

  it('queries with correct time-window filter', async () => {
    db.knowledgeLedgerEntry.findMany.mockResolvedValue([]);

    await getKnowledgeAt(db, 'client', 'c-1', JAN_15);

    expect(db.knowledgeLedgerEntry.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          entityType: 'client',
          entityId: 'c-1',
          createdAt: { lte: JAN_15 },
          OR: [
            { supersededAt: null },
            { supersededAt: { gt: JAN_15 } },
          ],
        }),
      }),
    );
  });

  it('takes most recent entry per field when multiple exist', async () => {
    db.knowledgeLedgerEntry.findMany.mockResolvedValue([
      {
        id: 'le-2', value: 'blue', confidence: 0.8, source: 'note', createdAt: JAN_15,
        supersededAt: null, field: { key: 'fav_color' },
      },
      {
        id: 'le-1', value: 'red', confidence: 0.7, source: 'manual', createdAt: JAN_1,
        supersededAt: JAN_15, field: { key: 'fav_color' },
      },
    ]);

    const result = await getKnowledgeAt(db, 'client', 'c-1', MAR_1);

    expect(result.fields.fav_color.value).toBe('blue');
    expect(result.fields.fav_color.confidence).toBe(0.8);
  });

  it('returns empty fields when no entries exist', async () => {
    db.knowledgeLedgerEntry.findMany.mockResolvedValue([]);

    const result = await getKnowledgeAt(db, 'client', 'c-none', JAN_15);

    expect(result.fields).toEqual({});
  });

  it('throws and logs KNOWLEDGE_340 on DB error', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    db.knowledgeLedgerEntry.findMany.mockRejectedValue(new Error('db down'));

    await expect(getKnowledgeAt(db, 'client', 'c-1', JAN_15)).rejects.toThrow('db down');
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('KNOWLEDGE_340'),
      expect.any(Error),
    );
  });
});

// ----- getFieldValueAt -----

describe('getFieldValueAt', () => {
  let db: ReturnType<typeof createMockDb>;

  beforeEach(() => {
    db = createMockDb();
    vi.restoreAllMocks();
  });

  it('returns field value at the given timestamp', async () => {
    db.entityFieldDefinition.findFirst.mockResolvedValue({ id: 'fd-1', key: 'height' });
    db.knowledgeLedgerEntry.findFirst.mockResolvedValue({
      id: 'le-1', value: '180cm', confidence: 0.95, source: 'manual', createdAt: JAN_1,
    });

    const result = await getFieldValueAt(db, 'client', 'c-1', 'height', JAN_15);

    expect(result).not.toBeNull();
    expect(result!.value).toBe('180cm');
    expect(result!.confidence).toBe(0.95);
  });

  it('returns null when field definition does not exist', async () => {
    db.entityFieldDefinition.findFirst.mockResolvedValue(null);

    const result = await getFieldValueAt(db, 'client', 'c-1', 'nonexistent', JAN_15);

    expect(result).toBeNull();
  });

  it('returns null when no entry exists at that time', async () => {
    db.entityFieldDefinition.findFirst.mockResolvedValue({ id: 'fd-1', key: 'height' });
    db.knowledgeLedgerEntry.findFirst.mockResolvedValue(null);

    const result = await getFieldValueAt(db, 'client', 'c-1', 'height', JAN_15);

    expect(result).toBeNull();
  });
});

// ----- getKnowledgeTimeline -----

describe('getKnowledgeTimeline', () => {
  let db: ReturnType<typeof createMockDb>;

  beforeEach(() => {
    db = createMockDb();
    vi.restoreAllMocks();
  });

  it('returns changes within date range ordered by createdAt asc', async () => {
    db.knowledgeLedgerEntry.findMany.mockResolvedValue([
      {
        id: 'le-1', value: 'red', confidence: 0.8, source: 'manual',
        createdAt: JAN_1, supersededAt: JAN_15, field: { key: 'fav_color' },
      },
      {
        id: 'le-2', value: 'blue', confidence: 0.9, source: 'note',
        createdAt: JAN_15, supersededAt: null, field: { key: 'fav_color' },
      },
    ]);

    const result = await getKnowledgeTimeline(db, 'client', 'c-1', JAN_1, FEB_1);

    expect(result).toHaveLength(2);
    expect(result[0].fieldKey).toBe('fav_color');
    expect(result[0].value).toBe('red');
    expect(result[1].value).toBe('blue');
  });

  it('throws when from > to (invalid date range)', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await expect(
      getKnowledgeTimeline(db, 'client', 'c-1', MAR_1, JAN_1),
    ).rejects.toThrow();

    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('KNOWLEDGE_341'),
    );
  });

  it('respects limit parameter', async () => {
    db.knowledgeLedgerEntry.findMany.mockResolvedValue([]);

    await getKnowledgeTimeline(db, 'client', 'c-1', JAN_1, MAR_1, 5);

    expect(db.knowledgeLedgerEntry.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 5 }),
    );
  });

  it('returns empty array when no changes in range', async () => {
    db.knowledgeLedgerEntry.findMany.mockResolvedValue([]);

    const result = await getKnowledgeTimeline(db, 'client', 'c-1', JAN_1, FEB_1);

    expect(result).toEqual([]);
  });
});
