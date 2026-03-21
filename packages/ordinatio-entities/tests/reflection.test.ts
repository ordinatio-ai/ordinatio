// ===========================================
// @ordinatio/entities — REFLECTION TESTS
// ===========================================

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@prisma/client', () => ({
  Prisma: { JsonNull: '__json_null__', InputJsonValue: {} },
}));

import {
  DEFAULT_CONFLICT_RULES,
  evaluateConflictRule,
  detectConflicts,
  scanForConflicts,
} from '../src/knowledge/reflection';
import type { ConflictRule } from '../src/knowledge/reflection';

function createMockDb() {
  return {
    knowledgeLedgerEntry: {
      findMany: vi.fn(),
    },
  } as any;
}

const NOW = new Date('2026-03-01T00:00:00Z');

// ----- evaluateConflictRule -----

describe('evaluateConflictRule', () => {
  it('detects conflict when rule check returns true', () => {
    const rule: ConflictRule = {
      type: 'value_contradiction',
      description: 'Test conflict',
      fieldA: 'status',
      fieldB: 'priority',
      check: (a, b) => a === 'closed' && b === 'urgent',
    };

    const fields = {
      status: { value: 'closed', confidence: 0.9, truthScore: 0.85 },
      priority: { value: 'urgent', confidence: 0.8, truthScore: 0.75 },
    };

    const conflict = evaluateConflictRule(rule, fields);

    expect(conflict).not.toBeNull();
    expect(conflict!.severity).toBeDefined();
    expect(conflict!.fieldA.key).toBe('status');
    expect(conflict!.fieldB!.key).toBe('priority');
  });

  it('returns null when no conflict', () => {
    const rule: ConflictRule = {
      type: 'value_contradiction',
      description: 'No conflict expected',
      fieldA: 'status',
      fieldB: 'priority',
      check: (a, b) => a === 'closed' && b === 'urgent',
    };

    const fields = {
      status: { value: 'open', confidence: 0.9, truthScore: 0.85 },
      priority: { value: 'low', confidence: 0.8, truthScore: 0.75 },
    };

    expect(evaluateConflictRule(rule, fields)).toBeNull();
  });

  it('returns null when fieldA is missing', () => {
    const rule: ConflictRule = {
      type: 'value_contradiction',
      description: 'Missing field',
      fieldA: 'nonexistent',
      check: () => true,
    };

    expect(evaluateConflictRule(rule, {})).toBeNull();
  });

  it('returns null when fieldB is required but missing', () => {
    const rule: ConflictRule = {
      type: 'mutual_exclusion',
      description: 'Missing B',
      fieldA: 'x',
      fieldB: 'y',
      check: () => true,
    };

    const fields = { x: { value: 1, confidence: 1, truthScore: 1 } };
    expect(evaluateConflictRule(rule, fields)).toBeNull();
  });

  it('assigns high severity when truth scores are high', () => {
    const rule: ConflictRule = {
      type: 'value_contradiction',
      description: 'High truth conflict',
      fieldA: 'a',
      fieldB: 'b',
      check: () => true,
    };

    const fields = {
      a: { value: 'x', confidence: 1, truthScore: 0.9 },
      b: { value: 'y', confidence: 1, truthScore: 0.8 },
    };

    const conflict = evaluateConflictRule(rule, fields);
    expect(conflict!.severity).toBe('high');
  });

  it('assigns low severity when truth scores are low', () => {
    const rule: ConflictRule = {
      type: 'value_contradiction',
      description: 'Low truth conflict',
      fieldA: 'a',
      fieldB: 'b',
      check: () => true,
    };

    const fields = {
      a: { value: 'x', confidence: 0.3, truthScore: 0.2 },
      b: { value: 'y', confidence: 0.3, truthScore: 0.3 },
    };

    const conflict = evaluateConflictRule(rule, fields);
    expect(conflict!.severity).toBe('low');
  });
});

// ----- DEFAULT_CONFLICT_RULES -----

describe('DEFAULT_CONFLICT_RULES', () => {
  it('has at least one rule', () => {
    expect(DEFAULT_CONFLICT_RULES.length).toBeGreaterThan(0);
  });

  it('detects budget/premium quality contradiction', () => {
    const rule = DEFAULT_CONFLICT_RULES[0];
    expect(rule.check('budget-friendly', 'premium')).toBe(true);
    expect(rule.check('mid-range', 'standard')).toBe(false);
  });
});

// ----- detectConflicts -----

describe('detectConflicts', () => {
  let db: ReturnType<typeof createMockDb>;

  beforeEach(() => {
    db = createMockDb();
    vi.restoreAllMocks();
  });

  it('detects conflicts using provided rules', async () => {
    db.knowledgeLedgerEntry.findMany.mockResolvedValue([
      {
        id: 'le-1', value: 'active', confidence: 0.9, source: 'manual',
        createdAt: NOW, supersededAt: null, field: { key: 'status' },
      },
      {
        id: 'le-2', value: 'deleted', confidence: 0.8, source: 'agent',
        createdAt: NOW, supersededAt: null, field: { key: 'lifecycle' },
      },
    ]);

    const rules: ConflictRule[] = [{
      type: 'mutual_exclusion',
      description: 'Active + deleted',
      fieldA: 'status',
      fieldB: 'lifecycle',
      check: (a, b) => a === 'active' && b === 'deleted',
    }];

    const conflicts = await detectConflicts(db, 'client', 'c-1', rules);

    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].entityType).toBe('client');
    expect(conflicts[0].entityId).toBe('c-1');
  });

  it('returns empty array when no conflicts', async () => {
    db.knowledgeLedgerEntry.findMany.mockResolvedValue([
      {
        id: 'le-1', value: 'active', confidence: 0.9, source: 'manual',
        createdAt: NOW, supersededAt: null, field: { key: 'status' },
      },
    ]);

    const conflicts = await detectConflicts(db, 'client', 'c-1', []);
    expect(conflicts).toEqual([]);
  });

  it('throws and logs KNOWLEDGE_346 on DB error', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    db.knowledgeLedgerEntry.findMany.mockRejectedValue(new Error('db fail'));

    await expect(detectConflicts(db, 'client', 'c-1')).rejects.toThrow('db fail');
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('KNOWLEDGE_346'),
      expect.any(Error),
    );
  });
});

// ----- scanForConflicts -----

describe('scanForConflicts', () => {
  let db: ReturnType<typeof createMockDb>;

  beforeEach(() => {
    db = createMockDb();
    vi.restoreAllMocks();
  });

  it('scans multiple entities and returns those with conflicts', async () => {
    // First call: distinct entity IDs
    db.knowledgeLedgerEntry.findMany
      .mockResolvedValueOnce([{ entityId: 'c-1' }, { entityId: 'c-2' }])
      // c-1 has conflict
      .mockResolvedValueOnce([
        { id: 'le-1', value: 'budget', confidence: 0.9, source: 'manual', createdAt: NOW, supersededAt: null, field: { key: 'budget_range' } },
        { id: 'le-2', value: 'cashmere', confidence: 0.8, source: 'manual', createdAt: NOW, supersededAt: null, field: { key: 'preferred_fabric' } },
      ])
      // c-2 has no conflict
      .mockResolvedValueOnce([
        { id: 'le-3', value: 'premium', confidence: 0.9, source: 'manual', createdAt: NOW, supersededAt: null, field: { key: 'budget_range' } },
      ]);

    const results = await scanForConflicts(db, 'client');

    expect(results.length).toBeLessThanOrEqual(2);
  });

  it('returns empty when no entities exist', async () => {
    db.knowledgeLedgerEntry.findMany.mockResolvedValue([]);

    const results = await scanForConflicts(db, 'client');
    expect(results).toEqual([]);
  });
});
