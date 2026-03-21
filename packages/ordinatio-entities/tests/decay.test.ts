// ===========================================
// @ordinatio/entities — DECAY TESTS
// ===========================================

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@prisma/client', () => ({
  Prisma: { JsonNull: '__json_null__', InputJsonValue: {} },
}));

import {
  computeDecayedConfidence,
  isStale,
  getStaleFields,
  formatStalenessWarnings,
} from '../src/knowledge/decay';

function createMockDb() {
  return {
    knowledgeLedgerEntry: {
      findMany: vi.fn(),
    },
  } as any;
}

const NOW = new Date('2026-03-01T00:00:00Z');

// ----- computeDecayedConfidence -----

describe('computeDecayedConfidence', () => {
  it('returns original confidence for brand-new entry', () => {
    const decayed = computeDecayedConfidence(1.0, NOW, 30, NOW);
    expect(decayed).toBeCloseTo(1.0, 5);
  });

  it('returns ~50% after exactly one half-life', () => {
    const thirtyDaysAgo = new Date('2026-01-30T00:00:00Z');
    const decayed = computeDecayedConfidence(1.0, thirtyDaysAgo, 30, NOW);
    expect(decayed).toBeCloseTo(0.5, 1);
  });

  it('returns ~25% after two half-lives', () => {
    const sixtyDaysAgo = new Date('2025-12-31T00:00:00Z');
    const decayed = computeDecayedConfidence(1.0, sixtyDaysAgo, 30, NOW);
    expect(decayed).toBeCloseTo(0.25, 1);
  });

  it('preserves proportional decay for non-1.0 confidence', () => {
    const thirtyDaysAgo = new Date('2026-01-30T00:00:00Z');
    const decayed = computeDecayedConfidence(0.8, thirtyDaysAgo, 30, NOW);
    expect(decayed).toBeCloseTo(0.4, 1);
  });

  it('returns original for negative halfLifeDays', () => {
    const result = computeDecayedConfidence(0.9, new Date('2025-01-01'), -1, NOW);
    expect(result).toBe(0.9);
  });

  it('returns original for future dates', () => {
    const tomorrow = new Date('2026-03-02T00:00:00Z');
    const decayed = computeDecayedConfidence(0.8, tomorrow, 30, NOW);
    expect(decayed).toBe(0.8);
  });
});

// ----- isStale -----

describe('isStale', () => {
  it('returns false for fresh high-confidence entry', () => {
    expect(isStale(1.0, NOW, 30, 0.3, NOW)).toBe(false);
  });

  it('returns true when decay drops below threshold', () => {
    const longAgo = new Date('2025-06-01T00:00:00Z');
    expect(isStale(1.0, longAgo, 30, 0.3, NOW)).toBe(true);
  });

  it('uses default threshold of 0.3', () => {
    const longAgo = new Date('2025-06-01T00:00:00Z');
    expect(isStale(1.0, longAgo, 30, undefined, NOW)).toBe(true);
  });

  it('returns false when decay is exactly at threshold', () => {
    // After exactly one half-life, confidence 0.6 → 0.3 (not < 0.3)
    const thirtyDaysAgo = new Date('2026-01-30T00:00:00Z');
    expect(isStale(0.6, thirtyDaysAgo, 30, 0.3, NOW)).toBe(false);
  });
});

// ----- getStaleFields -----

describe('getStaleFields', () => {
  let db: ReturnType<typeof createMockDb>;

  beforeEach(() => {
    db = createMockDb();
    vi.restoreAllMocks();
  });

  it('returns stale fields based on halfLifeDays', async () => {
    const longAgo = new Date('2025-06-01T00:00:00Z');
    db.knowledgeLedgerEntry.findMany.mockResolvedValue([
      {
        id: 'le-1', confidence: 1.0, source: 'manual', createdAt: longAgo,
        supersededAt: null,
        field: { key: 'preferred_contact_time', label: 'Preferred Contact Time', halfLifeDays: 30 },
      },
    ]);

    const result = await getStaleFields(db, 'contact', 'con-1');

    expect(result).toHaveLength(1);
    expect(result[0].fieldKey).toBe('preferred_contact_time');
    expect(result[0].decayedConfidence).toBeLessThan(0.3);
  });

  it('skips fields without halfLifeDays', async () => {
    db.knowledgeLedgerEntry.findMany.mockResolvedValue([
      {
        id: 'le-1', confidence: 1.0, source: 'manual', createdAt: new Date('2025-01-01'),
        supersededAt: null,
        field: { key: 'company', label: 'Company', halfLifeDays: null },
      },
    ]);

    const result = await getStaleFields(db, 'contact', 'con-1');
    expect(result).toHaveLength(0);
  });

  it('respects custom threshold', async () => {
    const thirtyDaysAgo = new Date('2026-01-30T00:00:00Z');
    db.knowledgeLedgerEntry.findMany.mockResolvedValue([
      {
        id: 'le-1', confidence: 1.0, source: 'manual', createdAt: thirtyDaysAgo,
        supersededAt: null,
        field: { key: 'timezone', label: 'Timezone', halfLifeDays: 30 },
      },
    ]);

    // With threshold 0.3, ~0.5 is not stale
    const notStale = await getStaleFields(db, 'contact', 'con-1', 0.3);
    expect(notStale).toHaveLength(0);

    // With threshold 0.6, ~0.5 IS stale
    const stale = await getStaleFields(db, 'contact', 'con-1', 0.6);
    expect(stale).toHaveLength(1);
  });

  it('throws and logs KNOWLEDGE_342 on DB error', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    db.knowledgeLedgerEntry.findMany.mockRejectedValue(new Error('db error'));

    await expect(getStaleFields(db, 'contact', 'con-1')).rejects.toThrow('db error');
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('KNOWLEDGE_342'),
      expect.any(Error),
    );
  });
});

// ----- formatStalenessWarnings -----

describe('formatStalenessWarnings', () => {
  it('formats warnings with human-readable messages', () => {
    const warnings = formatStalenessWarnings([
      { fieldKey: 'timezone', label: 'Timezone', decayedConfidence: 0.15, staleSinceDays: 90 },
    ]);

    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('Timezone');
    expect(warnings[0]).toContain('15%');
    expect(warnings[0]).toContain('90 days');
  });

  it('returns empty array for no stale fields', () => {
    expect(formatStalenessWarnings([])).toEqual([]);
  });
});
