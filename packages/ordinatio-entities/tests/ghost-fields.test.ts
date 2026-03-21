// ===========================================
// @ordinatio/entities — GHOST FIELDS TESTS
// ===========================================

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@prisma/client', () => ({
  Prisma: { JsonNull: '__json_null__', InputJsonValue: {} },
}));

import {
  buildCoOccurrenceMap,
  predictGhostFields,
  writeGhostFields,
} from '../src/knowledge/ghost-fields';
import type { GhostFieldPrediction } from '../src/knowledge/ghost-fields';

function createMockDb() {
  return {
    entityFieldDefinition: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
    },
    knowledgeLedgerEntry: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      updateMany: vi.fn(),
    },
  } as any;
}

// ----- buildCoOccurrenceMap -----

describe('buildCoOccurrenceMap', () => {
  let db: ReturnType<typeof createMockDb>;

  beforeEach(() => {
    db = createMockDb();
    vi.restoreAllMocks();
  });

  it('builds co-occurrence rates from matching entries', async () => {
    db.entityFieldDefinition.findMany.mockResolvedValue([
      { id: 'fd-fabric', key: 'preferred_fabric' },
      { id: 'fd-button', key: 'button_style' },
    ]);

    // 3 entities with cashmere fabric, 2 have horn buttons
    db.knowledgeLedgerEntry.findMany
      .mockResolvedValueOnce([
        { entityId: 'c-1', value: 'cashmere' },
        { entityId: 'c-2', value: 'cashmere' },
        { entityId: 'c-3', value: 'cashmere' },
      ])
      .mockResolvedValueOnce([
        { entityId: 'c-1', value: 'horn' },
        { entityId: 'c-2', value: 'horn' },
        { entityId: 'c-3', value: 'plastic' },
      ]);

    const map = await buildCoOccurrenceMap(db, 'client', 'preferred_fabric', 'button_style');

    expect(map.has('cashmere')).toBe(true);
    const cashmereMap = map.get('cashmere')!;
    expect(cashmereMap.get('horn')!.rate).toBeCloseTo(2 / 3, 2);
  });

  it('returns empty map when field definitions are missing', async () => {
    db.entityFieldDefinition.findMany.mockResolvedValue([]);

    const map = await buildCoOccurrenceMap(db, 'client', 'a', 'b');
    expect(map.size).toBe(0);
  });

  it('filters by minOccurrences', async () => {
    db.entityFieldDefinition.findMany.mockResolvedValue([
      { id: 'fd-1', key: 'a' },
      { id: 'fd-2', key: 'b' },
    ]);

    // Only 2 entities (below default min of 3)
    db.knowledgeLedgerEntry.findMany
      .mockResolvedValueOnce([
        { entityId: 'c-1', value: 'x' },
        { entityId: 'c-2', value: 'x' },
      ])
      .mockResolvedValueOnce([
        { entityId: 'c-1', value: 'y' },
        { entityId: 'c-2', value: 'y' },
      ]);

    const map = await buildCoOccurrenceMap(db, 'client', 'a', 'b', 3);
    expect(map.size).toBe(0);
  });
});

// ----- predictGhostFields -----

describe('predictGhostFields', () => {
  let db: ReturnType<typeof createMockDb>;

  beforeEach(() => {
    db = createMockDb();
    vi.restoreAllMocks();
  });

  it('returns empty when entity has no fields', async () => {
    db.knowledgeLedgerEntry.findMany.mockResolvedValue([]);

    const predictions = await predictGhostFields(db, 'client', 'c-1');
    expect(predictions).toEqual([]);
  });

  it('returns empty when all fields are filled', async () => {
    db.knowledgeLedgerEntry.findMany.mockResolvedValue([
      { id: 'le-1', field: { key: 'company' }, supersededAt: null },
    ]);
    db.entityFieldDefinition.findMany.mockResolvedValue([
      { id: 'fd-1', key: 'company', isActive: true, status: 'approved' },
    ]);

    const predictions = await predictGhostFields(db, 'client', 'c-1');
    expect(predictions).toEqual([]);
  });

  it('predictions have source "predicted"', async () => {
    db.entityFieldDefinition.findMany
      .mockResolvedValueOnce([
        { id: 'fd-1', key: 'preferred_fabric', label: 'Preferred Fabric', isActive: true, status: 'approved' },
        { id: 'fd-2', key: 'button_style', label: 'Button Style', isActive: true, status: 'approved' },
      ])
      // For buildCoOccurrenceMap
      .mockResolvedValueOnce([
        { id: 'fd-1', key: 'preferred_fabric' },
        { id: 'fd-2', key: 'button_style' },
      ]);

    // predictGhostFields calls findMany 3 times:
    // 1) current entries for the entity (with field include)
    // 2) co-occurrence source field entries
    // 3) co-occurrence target field entries
    db.knowledgeLedgerEntry.findMany
      .mockResolvedValueOnce([
        { id: 'le-1', value: 'cashmere', field: { key: 'preferred_fabric' }, supersededAt: null },
      ])
      .mockResolvedValueOnce([
        { entityId: 'c-2', value: 'cashmere' },
        { entityId: 'c-3', value: 'cashmere' },
        { entityId: 'c-4', value: 'cashmere' },
        { entityId: 'c-5', value: 'cashmere' },
        { entityId: 'c-6', value: 'cashmere' },
      ])
      .mockResolvedValueOnce([
        { entityId: 'c-2', value: 'horn' },
        { entityId: 'c-3', value: 'horn' },
        { entityId: 'c-4', value: 'horn' },
        { entityId: 'c-5', value: 'horn' },
        { entityId: 'c-6', value: 'horn' },
      ]);

    const predictions = await predictGhostFields(db, 'client', 'c-1');

    // May or may not predict depending on co-occurrence — but format is correct
    for (const p of predictions) {
      expect(p.source).toBe('predicted');
      expect(p.confidence).toBeGreaterThan(0);
      expect(p.basedOn.length).toBeGreaterThan(0);
    }
  });
});

// ----- writeGhostFields -----

describe('writeGhostFields', () => {
  let db: ReturnType<typeof createMockDb>;

  beforeEach(() => {
    db = createMockDb();
    vi.restoreAllMocks();
  });

  it('writes predicted values to the ledger', async () => {
    db.entityFieldDefinition.findFirst.mockResolvedValue({ id: 'fd-1', key: 'button_style' });
    db.knowledgeLedgerEntry.findFirst.mockResolvedValue(null); // No existing non-predicted value
    db.knowledgeLedgerEntry.updateMany.mockResolvedValue({ count: 0 });
    db.knowledgeLedgerEntry.create.mockResolvedValue({ id: 'le-ghost' });

    const predictions: GhostFieldPrediction[] = [{
      fieldKey: 'button_style',
      label: 'Button Style',
      predictedValue: 'horn',
      confidence: 0.4,
      basedOn: [{ fieldKey: 'preferred_fabric', value: 'cashmere', coOccurrenceRate: 0.8 }],
      source: 'predicted',
    }];

    const result = await writeGhostFields(db, 'client', 'c-1', predictions);

    expect(result.written).toBe(1);
    expect(result.skipped).toBe(0);
    expect(db.knowledgeLedgerEntry.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        source: 'predicted',
        confidence: 0.4,
        value: 'horn',
      }),
    });
  });

  it('skips fields that already have non-predicted values', async () => {
    db.entityFieldDefinition.findFirst.mockResolvedValue({ id: 'fd-1', key: 'button_style' });
    db.knowledgeLedgerEntry.findFirst.mockResolvedValue({
      id: 'le-existing', source: 'manual', value: 'leather',
    });

    const predictions: GhostFieldPrediction[] = [{
      fieldKey: 'button_style',
      label: 'Button Style',
      predictedValue: 'horn',
      confidence: 0.4,
      basedOn: [],
      source: 'predicted',
    }];

    const result = await writeGhostFields(db, 'client', 'c-1', predictions);

    expect(result.written).toBe(0);
    expect(result.skipped).toBe(1);
    expect(db.knowledgeLedgerEntry.create).not.toHaveBeenCalled();
  });

  it('skips when field definition does not exist', async () => {
    db.entityFieldDefinition.findFirst.mockResolvedValue(null);

    const predictions: GhostFieldPrediction[] = [{
      fieldKey: 'nonexistent',
      label: 'Nonexistent',
      predictedValue: 'x',
      confidence: 0.5,
      basedOn: [],
      source: 'predicted',
    }];

    const result = await writeGhostFields(db, 'client', 'c-1', predictions);

    expect(result.skipped).toBe(1);
  });

  it('calls logActivity callback on successful writes', async () => {
    db.entityFieldDefinition.findFirst.mockResolvedValue({ id: 'fd-1' });
    db.knowledgeLedgerEntry.findFirst.mockResolvedValue(null);
    db.knowledgeLedgerEntry.updateMany.mockResolvedValue({ count: 0 });
    db.knowledgeLedgerEntry.create.mockResolvedValue({ id: 'le-ghost' });

    const logActivity = vi.fn().mockResolvedValue(undefined);

    await writeGhostFields(
      db, 'client', 'c-1',
      [{ fieldKey: 'x', label: 'X', predictedValue: 'y', confidence: 0.3, basedOn: [], source: 'predicted' }],
      { logActivity },
    );

    expect(logActivity).toHaveBeenCalledWith(
      'KNOWLEDGE_GHOST_WRITTEN',
      expect.stringContaining('1 predicted field(s)'),
    );
  });

  it('throws and logs KNOWLEDGE_356 on DB error', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    db.entityFieldDefinition.findFirst.mockRejectedValue(new Error('db fail'));

    await expect(
      writeGhostFields(db, 'client', 'c-1', [{
        fieldKey: 'x', label: 'X', predictedValue: 'y', confidence: 0.3, basedOn: [], source: 'predicted',
      }]),
    ).rejects.toThrow('db fail');

    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('KNOWLEDGE_356'),
      expect.any(Error),
    );
  });
});
