// ===========================================
// @ordinatio/entities — HEALTH TESTS
// ===========================================

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@prisma/client', () => ({
  Prisma: { JsonNull: '__json_null__', InputJsonValue: {} },
}));

import {
  computeOverallScore,
  computeEntityHealth,
  getEntityTypeHealth,
} from '../src/knowledge/health';

function createMockDb() {
  return {
    entityFieldDefinition: {
      findMany: vi.fn(),
    },
    knowledgeLedgerEntry: {
      findMany: vi.fn(),
    },
  } as any;
}

const NOW = new Date('2026-03-01T00:00:00Z');

// ----- computeOverallScore -----

describe('computeOverallScore', () => {
  it('returns weighted composite score', () => {
    const score = computeOverallScore(1.0, 1.0, 0, 1.0);
    // 0.4*1 + 0.3*1 + 0.2*(1-0) + 0.1*1 = 0.4 + 0.3 + 0.2 + 0.1 = 1.0
    expect(score).toBeCloseTo(1.0, 5);
  });

  it('handles zero across all inputs', () => {
    const score = computeOverallScore(0, 0, 0, 0);
    // 0.4*0 + 0.3*0 + 0.2*(1-0) + 0.1*0 = 0.2
    expect(score).toBeCloseTo(0.2, 5);
  });

  it('penalizes high conflict rate', () => {
    const noConflict = computeOverallScore(0.8, 0.8, 0, 0.8);
    const highConflict = computeOverallScore(0.8, 0.8, 1.0, 0.8);
    expect(noConflict).toBeGreaterThan(highConflict);
  });

  it('weights completeness highest (0.4)', () => {
    // Completeness at 1, everything else at 0
    const compOnly = computeOverallScore(1.0, 0, 0, 0);
    // 0.4*1 + 0.3*0 + 0.2*(1-0) + 0.1*0 = 0.6
    expect(compOnly).toBeCloseTo(0.6, 5);
  });

  it('returns values in 0-1 range for valid inputs', () => {
    for (let i = 0; i <= 10; i++) {
      const v = i / 10;
      const score = computeOverallScore(v, v, v, v);
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(1);
    }
  });
});

// ----- computeEntityHealth -----

describe('computeEntityHealth', () => {
  let db: ReturnType<typeof createMockDb>;

  beforeEach(() => {
    db = createMockDb();
    vi.restoreAllMocks();
  });

  it('returns health report with all components', async () => {
    db.entityFieldDefinition.findMany.mockResolvedValue([
      { id: 'fd-1', key: 'company', isActive: true, status: 'approved' },
      { id: 'fd-2', key: 'title', isActive: true, status: 'approved' },
    ]);

    db.knowledgeLedgerEntry.findMany
      // Current entries
      .mockResolvedValueOnce([
        {
          id: 'le-1', fieldId: 'fd-1', value: 'Acme', confidence: 0.9,
          source: 'manual', createdAt: NOW, supersededAt: null,
          field: { key: 'company', halfLifeDays: null },
        },
      ])
      // All entries (for truth scoring)
      .mockResolvedValueOnce([
        {
          id: 'le-1', fieldId: 'fd-1', value: 'Acme', confidence: 0.9,
          source: 'manual', createdAt: NOW, supersededAt: null,
          field: { key: 'company' },
        },
      ])
      // For detectConflicts
      .mockResolvedValueOnce([
        {
          id: 'le-1', fieldId: 'fd-1', value: 'Acme', confidence: 0.9,
          source: 'manual', createdAt: NOW, supersededAt: null,
          field: { key: 'company' },
        },
      ]);

    const report = await computeEntityHealth(db, 'contact', 'con-1');

    expect(report.entityType).toBe('contact');
    expect(report.entityId).toBe('con-1');
    expect(report.completeness).toBe(0.5); // 1 of 2 fields filled
    expect(report.freshness).toBeGreaterThan(0);
    expect(report.conflictRate).toBeGreaterThanOrEqual(0);
    expect(report.truthAverage).toBeGreaterThan(0);
    expect(report.overallScore).toBeGreaterThan(0);
    expect(report.overallScore).toBeLessThanOrEqual(1);
    expect(report.filledFieldCount).toBe(1);
    expect(report.totalFieldCount).toBe(2);
  });

  it('returns zero scores for entity with no data', async () => {
    db.entityFieldDefinition.findMany.mockResolvedValue([
      { id: 'fd-1', key: 'company', isActive: true, status: 'approved' },
    ]);
    db.knowledgeLedgerEntry.findMany.mockResolvedValue([]);

    const report = await computeEntityHealth(db, 'contact', 'con-empty');

    expect(report.completeness).toBe(0);
    expect(report.freshness).toBe(0);
    expect(report.filledFieldCount).toBe(0);
  });

  it('adds warnings for low completeness', async () => {
    db.entityFieldDefinition.findMany.mockResolvedValue([
      { id: 'fd-1', key: 'a', isActive: true, status: 'approved' },
      { id: 'fd-2', key: 'b', isActive: true, status: 'approved' },
      { id: 'fd-3', key: 'c', isActive: true, status: 'approved' },
      { id: 'fd-4', key: 'd', isActive: true, status: 'approved' },
    ]);
    db.knowledgeLedgerEntry.findMany.mockResolvedValue([]);

    const report = await computeEntityHealth(db, 'contact', 'con-1');

    expect(report.warnings).toContain('Entity has very few fields filled');
  });

  it('throws and logs KNOWLEDGE_360 on DB error', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    db.entityFieldDefinition.findMany.mockRejectedValue(new Error('db error'));

    await expect(computeEntityHealth(db, 'contact', 'con-1')).rejects.toThrow('db error');
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('KNOWLEDGE_360'),
      expect.any(Error),
    );
  });
});

// ----- getEntityTypeHealth -----

describe('getEntityTypeHealth', () => {
  let db: ReturnType<typeof createMockDb>;

  beforeEach(() => {
    db = createMockDb();
    vi.restoreAllMocks();
  });

  it('returns summary with zero entities', async () => {
    db.knowledgeLedgerEntry.findMany.mockResolvedValue([]);

    const summary = await getEntityTypeHealth(db, 'contact');

    expect(summary.entityCount).toBe(0);
    expect(summary.avgOverallScore).toBe(0);
    expect(summary.worstEntities).toEqual([]);
    expect(summary.bestEntities).toEqual([]);
  });

  it('aggregates health across multiple entities', async () => {
    // Distinct entity IDs
    db.knowledgeLedgerEntry.findMany.mockResolvedValueOnce([
      { entityId: 'con-1' },
      { entityId: 'con-2' },
    ]);

    // For con-1 health computation
    db.entityFieldDefinition.findMany.mockResolvedValue([
      { id: 'fd-1', key: 'company', isActive: true, status: 'approved' },
    ]);

    // con-1: current entries
    db.knowledgeLedgerEntry.findMany
      .mockResolvedValueOnce([
        {
          id: 'le-1', value: 'Acme', confidence: 0.9, source: 'manual',
          createdAt: NOW, supersededAt: null, field: { key: 'company', halfLifeDays: null },
        },
      ])
      .mockResolvedValueOnce([
        { id: 'le-1', value: 'Acme', confidence: 0.9, source: 'manual', createdAt: NOW, supersededAt: null, field: { key: 'company' } },
      ])
      .mockResolvedValueOnce([
        { id: 'le-1', value: 'Acme', confidence: 0.9, source: 'manual', createdAt: NOW, supersededAt: null, field: { key: 'company' } },
      ])
      // con-2: empty
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    const summary = await getEntityTypeHealth(db, 'contact');

    expect(summary.entityCount).toBe(2);
    expect(summary.avgOverallScore).toBeGreaterThanOrEqual(0);
    expect(summary.worstEntities.length).toBeGreaterThanOrEqual(1);
    expect(summary.bestEntities.length).toBeGreaterThanOrEqual(1);
  });

  it('throws and logs KNOWLEDGE_361 on DB error', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    db.knowledgeLedgerEntry.findMany.mockRejectedValue(new Error('scan fail'));

    await expect(getEntityTypeHealth(db, 'contact')).rejects.toThrow('scan fail');
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('KNOWLEDGE_361'),
      expect.any(Error),
    );
  });
});
