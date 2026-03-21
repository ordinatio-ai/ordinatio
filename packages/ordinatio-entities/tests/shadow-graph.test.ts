// ===========================================
// @ordinatio/entities — SHADOW GRAPH TESTS
// ===========================================

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@prisma/client', () => ({
  Prisma: { JsonNull: '__json_null__', InputJsonValue: {} },
}));

import {
  computeRelationshipStrength,
  findRelatedEntities,
  getEntityRelationships,
} from '../src/knowledge/shadow-graph';

function createMockDb() {
  return {
    knowledgeLedgerEntry: {
      findMany: vi.fn(),
    },
  } as any;
}

// ----- computeRelationshipStrength -----

describe('computeRelationshipStrength', () => {
  it('returns 0 for empty shared fields', () => {
    expect(computeRelationshipStrength([], 10)).toBe(0);
  });

  it('returns 0 for zero total source fields', () => {
    expect(computeRelationshipStrength([{ sourceConfidence: 1, targetConfidence: 1 }], 0)).toBe(0);
  });

  it('returns high strength for many shared high-confidence fields', () => {
    const fields = [
      { sourceConfidence: 1.0, targetConfidence: 1.0 },
      { sourceConfidence: 0.9, targetConfidence: 0.9 },
      { sourceConfidence: 0.8, targetConfidence: 0.8 },
    ];
    const strength = computeRelationshipStrength(fields, 3);
    expect(strength).toBeGreaterThan(0.5);
  });

  it('returns low strength when shared fields are fraction of total', () => {
    const fields = [{ sourceConfidence: 1.0, targetConfidence: 1.0 }];
    const strength = computeRelationshipStrength(fields, 10);
    expect(strength).toBeLessThan(0.15);
  });

  it('factors in confidence of both source and target', () => {
    const highConf = computeRelationshipStrength(
      [{ sourceConfidence: 1.0, targetConfidence: 1.0 }], 1,
    );
    const lowConf = computeRelationshipStrength(
      [{ sourceConfidence: 0.3, targetConfidence: 0.3 }], 1,
    );
    expect(highConf).toBeGreaterThan(lowConf);
  });
});

// ----- findRelatedEntities -----

describe('findRelatedEntities', () => {
  let db: ReturnType<typeof createMockDb>;

  beforeEach(() => {
    db = createMockDb();
    vi.restoreAllMocks();
  });

  it('finds entities with matching field values', async () => {
    // Source entity has company = 'Acme'
    db.knowledgeLedgerEntry.findMany
      .mockResolvedValueOnce([
        {
          id: 'le-1', fieldId: 'fd-company', entityType: 'contact', entityId: 'con-1',
          value: 'Acme Corp', confidence: 0.9, supersededAt: null,
          field: { key: 'company' },
        },
      ])
      // Matching entities with same value
      .mockResolvedValueOnce([
        {
          id: 'le-2', fieldId: 'fd-company', entityType: 'contact', entityId: 'con-2',
          value: 'Acme Corp', confidence: 0.8, supersededAt: null,
          field: { key: 'company' },
        },
      ]);

    const result = await findRelatedEntities(db, 'contact', 'con-1');

    expect(result).toHaveLength(1);
    expect(result[0].targetEntityId).toBe('con-2');
    expect(result[0].sharedFields).toHaveLength(1);
    expect(result[0].sharedFields[0].fieldKey).toBe('company');
    expect(result[0].strength).toBeGreaterThan(0);
  });

  it('returns empty array when entity has no fields', async () => {
    db.knowledgeLedgerEntry.findMany.mockResolvedValue([]);

    const result = await findRelatedEntities(db, 'contact', 'con-1');

    expect(result).toEqual([]);
  });

  it('filters by minSharedFields', async () => {
    db.knowledgeLedgerEntry.findMany
      .mockResolvedValueOnce([
        {
          id: 'le-1', fieldId: 'fd-1', entityType: 'contact', entityId: 'con-1',
          value: 'Acme', confidence: 0.9, supersededAt: null, field: { key: 'company' },
        },
      ])
      .mockResolvedValueOnce([
        {
          id: 'le-2', fieldId: 'fd-1', entityType: 'contact', entityId: 'con-2',
          value: 'Acme', confidence: 0.8, supersededAt: null, field: { key: 'company' },
        },
      ]);

    // Require 2 shared fields — should return nothing (only 1 shared)
    const result = await findRelatedEntities(db, 'contact', 'con-1', { minSharedFields: 2 });

    expect(result).toHaveLength(0);
  });

  it('sorts results by strength descending', async () => {
    db.knowledgeLedgerEntry.findMany
      .mockResolvedValueOnce([
        {
          id: 'le-1', fieldId: 'fd-1', entityType: 'contact', entityId: 'con-1',
          value: 'Acme', confidence: 0.9, supersededAt: null, field: { key: 'company' },
        },
        {
          id: 'le-2', fieldId: 'fd-2', entityType: 'contact', entityId: 'con-1',
          value: 'Finance', confidence: 0.8, supersededAt: null, field: { key: 'industry' },
        },
      ])
      // company matches: con-2 (high conf) and con-3 (low conf)
      .mockResolvedValueOnce([
        {
          id: 'le-3', fieldId: 'fd-1', entityType: 'contact', entityId: 'con-2',
          value: 'Acme', confidence: 0.9, supersededAt: null, field: { key: 'company' },
        },
        {
          id: 'le-4', fieldId: 'fd-1', entityType: 'contact', entityId: 'con-3',
          value: 'Acme', confidence: 0.3, supersededAt: null, field: { key: 'company' },
        },
      ])
      // industry matches: con-2 also matches industry
      .mockResolvedValueOnce([
        {
          id: 'le-5', fieldId: 'fd-2', entityType: 'contact', entityId: 'con-2',
          value: 'Finance', confidence: 0.8, supersededAt: null, field: { key: 'industry' },
        },
      ]);

    const result = await findRelatedEntities(db, 'contact', 'con-1');

    expect(result.length).toBeGreaterThanOrEqual(1);
    // con-2 should be first (shares 2 fields with high confidence)
    expect(result[0].targetEntityId).toBe('con-2');
  });

  it('throws and logs KNOWLEDGE_345 on DB error', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    db.knowledgeLedgerEntry.findMany.mockRejectedValue(new Error('db down'));

    await expect(
      findRelatedEntities(db, 'contact', 'con-1'),
    ).rejects.toThrow('db down');

    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('KNOWLEDGE_345'),
      expect.any(Error),
    );
  });
});

// ----- getEntityRelationships -----

describe('getEntityRelationships', () => {
  let db: ReturnType<typeof createMockDb>;

  beforeEach(() => {
    db = createMockDb();
    vi.restoreAllMocks();
  });

  it('delegates to findRelatedEntities with limit', async () => {
    db.knowledgeLedgerEntry.findMany.mockResolvedValue([]);

    const result = await getEntityRelationships(db, 'contact', 'con-1', 5);

    expect(result).toEqual([]);
  });
});
