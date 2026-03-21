// ===========================================
// @ordinatio/entities — SCORING TESTS
// ===========================================

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@prisma/client', () => ({
  Prisma: { JsonNull: '__json_null__', InputJsonValue: {} },
}));

import {
  SOURCE_RELIABILITY,
  computeRecencyFactor,
  computeTruthScore,
  computeComplexityScore,
  computeEntityTruthScores,
} from '../src/knowledge/scoring';

function createMockDb() {
  return {
    knowledgeLedgerEntry: {
      findMany: vi.fn(),
    },
  } as any;
}

const NOW = new Date('2026-03-01T00:00:00Z');
const ONE_DAY_AGO = new Date('2026-02-28T00:00:00Z');
const THIRTY_DAYS_AGO = new Date('2026-01-30T00:00:00Z');
const ONE_YEAR_AGO = new Date('2025-03-01T00:00:00Z');

// ----- SOURCE_RELIABILITY -----

describe('SOURCE_RELIABILITY', () => {
  it('has manual as highest reliability', () => {
    expect(SOURCE_RELIABILITY.manual).toBe(1.0);
  });

  it('has predicted as lowest reliability', () => {
    expect(SOURCE_RELIABILITY.predicted).toBe(0.3);
  });

  it('orders reliabilities: manual > note > email > agent > ai-batch > predicted', () => {
    expect(SOURCE_RELIABILITY.manual).toBeGreaterThan(SOURCE_RELIABILITY.note!);
    expect(SOURCE_RELIABILITY.note).toBeGreaterThan(SOURCE_RELIABILITY.email!);
    expect(SOURCE_RELIABILITY.email).toBeGreaterThan(SOURCE_RELIABILITY.agent!);
    expect(SOURCE_RELIABILITY.agent).toBeGreaterThan(SOURCE_RELIABILITY['ai-batch']!);
    expect(SOURCE_RELIABILITY['ai-batch']).toBeGreaterThan(SOURCE_RELIABILITY.predicted!);
  });
});

// ----- computeRecencyFactor -----

describe('computeRecencyFactor', () => {
  it('returns 1.0 for today', () => {
    const factor = computeRecencyFactor(NOW, NOW);
    expect(factor).toBeCloseTo(1.0, 5);
  });

  it('returns value between 0 and 1 for recent date', () => {
    const factor = computeRecencyFactor(THIRTY_DAYS_AGO, NOW);
    expect(factor).toBeGreaterThan(0);
    expect(factor).toBeLessThan(1);
  });

  it('returns very low value for old date', () => {
    const factor = computeRecencyFactor(ONE_YEAR_AGO, NOW);
    expect(factor).toBeLessThan(0.1);
  });

  it('returns 1.0 for future dates', () => {
    const tomorrow = new Date('2026-03-02T00:00:00Z');
    const factor = computeRecencyFactor(tomorrow, NOW);
    expect(factor).toBe(1.0);
  });
});

// ----- computeTruthScore -----

describe('computeTruthScore', () => {
  it('returns 0 for empty assertions', () => {
    expect(computeTruthScore([], NOW)).toBe(0);
  });

  it('returns high score for recent high-confidence manual assertion', () => {
    const score = computeTruthScore([
      { confidence: 1.0, source: 'manual', createdAt: NOW, supersededAt: null },
    ], NOW);
    expect(score).toBeGreaterThan(0.9);
  });

  it('returns lower score for old assertions', () => {
    const recentScore = computeTruthScore([
      { confidence: 1.0, source: 'manual', createdAt: NOW, supersededAt: null },
    ], NOW);

    const oldScore = computeTruthScore([
      { confidence: 1.0, source: 'manual', createdAt: ONE_YEAR_AGO, supersededAt: null },
    ], NOW);

    expect(recentScore).toBeGreaterThan(oldScore);
  });

  it('returns lower score for low-reliability sources (multi-assertion)', () => {
    // With multiple assertions at different times, reliability weights which recency dominates.
    // Manual (R=1.0) recent + old: recent dominates → higher weighted avg of recency.
    // Predicted (R=0.3) recent + old: recent has less relative weight → lower weighted avg.
    const manualScore = computeTruthScore([
      { confidence: 1.0, source: 'manual', createdAt: NOW, supersededAt: null },
      { confidence: 1.0, source: 'predicted', createdAt: ONE_YEAR_AGO, supersededAt: NOW },
    ], NOW);

    const predictedScore = computeTruthScore([
      { confidence: 1.0, source: 'predicted', createdAt: NOW, supersededAt: null },
      { confidence: 1.0, source: 'manual', createdAt: ONE_YEAR_AGO, supersededAt: NOW },
    ], NOW);

    // The one with the manual (high-reliability) recent assertion should score higher
    expect(manualScore).toBeGreaterThan(predictedScore);
  });

  it('handles multiple assertions (weighted average)', () => {
    const score = computeTruthScore([
      { confidence: 1.0, source: 'manual', createdAt: NOW, supersededAt: null },
      { confidence: 0.5, source: 'agent', createdAt: THIRTY_DAYS_AGO, supersededAt: NOW },
    ], NOW);

    expect(score).toBeGreaterThan(0);
    expect(score).toBeLessThanOrEqual(1);
  });

  it('uses default 0.5 reliability for unknown sources', () => {
    const score = computeTruthScore([
      { confidence: 1.0, source: 'unknown_source', createdAt: NOW, supersededAt: null },
    ], NOW);

    expect(score).toBeGreaterThan(0);
    expect(score).toBeLessThanOrEqual(1);
  });
});

// ----- computeComplexityScore -----

describe('computeComplexityScore', () => {
  it('returns 0 when no fields available', () => {
    expect(computeComplexityScore(0, 0, 0, 0)).toBe(0);
  });

  it('returns 1.0 when fully filled', () => {
    expect(computeComplexityScore(10, 10, 3, 3)).toBe(1.0);
  });

  it('weights categories at 60% and fields at 40%', () => {
    // All categories covered, no fields
    const catOnly = computeComplexityScore(0, 10, 3, 3);
    expect(catOnly).toBeCloseTo(0.6, 5);

    // No categories, all fields
    const fieldOnly = computeComplexityScore(10, 10, 0, 3);
    expect(fieldOnly).toBeCloseTo(0.4, 5);
  });

  it('returns partial score for partially filled entity', () => {
    const score = computeComplexityScore(5, 10, 2, 4);
    expect(score).toBeGreaterThan(0);
    expect(score).toBeLessThan(1);
  });

  it('caps ratios at 1.0', () => {
    const score = computeComplexityScore(20, 10, 5, 3);
    expect(score).toBe(1.0);
  });
});

// ----- computeEntityTruthScores -----

describe('computeEntityTruthScores', () => {
  let db: ReturnType<typeof createMockDb>;

  beforeEach(() => {
    db = createMockDb();
    vi.restoreAllMocks();
  });

  it('returns truth scores grouped by field key', async () => {
    db.knowledgeLedgerEntry.findMany.mockResolvedValue([
      {
        id: 'le-1', value: 'navy', confidence: 0.9, source: 'manual',
        createdAt: NOW, supersededAt: null, field: { key: 'fav_color' },
      },
      {
        id: 'le-2', value: '180cm', confidence: 1.0, source: 'manual',
        createdAt: NOW, supersededAt: null, field: { key: 'height' },
      },
    ]);

    const scores = await computeEntityTruthScores(db, 'client', 'c-1');

    expect(scores).toHaveProperty('fav_color');
    expect(scores).toHaveProperty('height');
    expect(scores.fav_color.truthScore).toBeGreaterThan(0);
    expect(scores.fav_color.confidence).toBe(0.9);
    expect(scores.fav_color.source).toBe('manual');
    expect(scores.fav_color.assertions).toBe(1);
  });

  it('includes superseded entries in assertion count', async () => {
    db.knowledgeLedgerEntry.findMany.mockResolvedValue([
      {
        id: 'le-2', value: 'blue', confidence: 0.8, source: 'note',
        createdAt: NOW, supersededAt: null, field: { key: 'fav_color' },
      },
      {
        id: 'le-1', value: 'red', confidence: 0.7, source: 'manual',
        createdAt: THIRTY_DAYS_AGO, supersededAt: NOW, field: { key: 'fav_color' },
      },
    ]);

    const scores = await computeEntityTruthScores(db, 'client', 'c-1');

    expect(scores.fav_color.assertions).toBe(2);
    expect(scores.fav_color.confidence).toBe(0.8); // Current entry
    expect(scores.fav_color.source).toBe('note'); // Current entry
  });

  it('returns empty object when no entries exist', async () => {
    db.knowledgeLedgerEntry.findMany.mockResolvedValue([]);

    const scores = await computeEntityTruthScores(db, 'client', 'c-none');

    expect(scores).toEqual({});
  });
});
