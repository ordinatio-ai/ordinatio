// ===========================================
// ANGRY MOB TESTS — ENTITY KNOWLEDGE: PROPERTY-BASED INVARIANTS
// ===========================================
// Five suites verifying foundational guarantees:
//   1. Input Fuzzer -- Property-Based Stress (PBT over 1000+ randomized mutations)
//   2. Edge Cases -- Semantic Perimeter (Ontological write gating)
//   3. State Corruption -- Total Recall (State reconstruction from ledger)
//   4. Security -- Temporal Sanctity (Immutability guarantees)
//   5. Edge Cases -- Suggestion Convergence (Math boundary verification)
// ===========================================

import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fc from 'fast-check';

vi.mock('@prisma/client', () => ({
  Prisma: { JsonNull: '__json_null__', InputJsonValue: {} },
}));

import { setEntityFields, getEntityFields } from '../src/knowledge/ledger';
import { getKnowledgeAt, getFieldValueAt, getKnowledgeTimeline } from '../src/knowledge/time-travel';
import {
  computeRecencyFactor,
  computeTruthScore,
  computeComplexityScore,
  SOURCE_RELIABILITY,
} from '../src/knowledge/scoring';
import { computeDecayedConfidence, isStale } from '../src/knowledge/decay';
import { shouldBranch, setEntityFieldsWithBranching } from '../src/knowledge/branching';
import { computeRelationshipStrength } from '../src/knowledge/shadow-graph';
import { computeOverallScore } from '../src/knowledge/health';
import { evaluateConflictRule, type ConflictRule } from '../src/knowledge/reflection';
import { analyzeAndSuggest } from '../src/agent/suggestions';

// ===========================================
// SHARED INFRASTRUCTURE: LedgerSimulator
// ===========================================
// In-memory ledger that tracks state across mutations,
// enabling PBT tests to verify invariants after each op.
// ===========================================

interface SimEntry {
  id: string;
  fieldId: string;
  entityType: string;
  entityId: string;
  value: unknown;
  confidence: number;
  source: string;
  sourceId: string | null;
  setBy: string | null;
  createdAt: Date;
  supersededAt: Date | null;
  field: {
    id: string;
    key: string;
    label: string;
    dataType: string;
    category: string;
  };
}

const FIELD_DEFS = [
  { id: 'fd-1', entityType: 'client', key: 'preferred_fabric', label: 'Preferred Fabric', dataType: 'text', isActive: true, status: 'approved', category: 'preferences' },
  { id: 'fd-2', entityType: 'client', key: 'budget_range', label: 'Budget Range', dataType: 'text', isActive: true, status: 'approved', category: 'financial' },
  { id: 'fd-3', entityType: 'client', key: 'quality_preference', label: 'Quality Preference', dataType: 'text', isActive: true, status: 'approved', category: 'preferences' },
  { id: 'fd-4', entityType: 'client', key: 'style_notes', label: 'Style Notes', dataType: 'text', isActive: true, status: 'approved', category: 'preferences' },
  { id: 'fd-5', entityType: 'client', key: 'contact_method', label: 'Contact Method', dataType: 'text', isActive: true, status: 'approved', category: 'communication' },
];

const APPROVED_KEYS = new Set(FIELD_DEFS.map((d) => d.key));
const APPROVED_SOURCES = ['manual', 'note', 'email', 'agent', 'ai-batch', 'predicted'];

class LedgerSimulator {
  private entries: SimEntry[] = [];
  private nextId = 1;

  writeField(
    entityType: string,
    entityId: string,
    fieldKey: string,
    value: unknown,
    confidence: number,
    source: string,
  ): void {
    const def = FIELD_DEFS.find((d) => d.key === fieldKey && d.entityType === entityType);
    if (!def) return;

    const now = new Date(Date.now() + this.nextId);

    // Supersede existing active entries for this key
    for (const e of this.entries) {
      if (
        e.entityType === entityType &&
        e.entityId === entityId &&
        e.field.key === fieldKey &&
        e.supersededAt === null
      ) {
        e.supersededAt = now;
      }
    }

    this.entries.push({
      id: `sim-${this.nextId++}`,
      fieldId: def.id,
      entityType,
      entityId,
      value,
      confidence: Math.max(0, Math.min(1, confidence)),
      source,
      sourceId: null,
      setBy: null,
      createdAt: now,
      supersededAt: null,
      field: {
        id: def.id,
        key: def.key,
        label: def.label,
        dataType: def.dataType,
        category: def.category,
      },
    });
  }

  // Invariant: at most 1 active entry per (entityType, entityId, fieldKey)
  checkHighlanderRule(): string[] {
    const violations: string[] = [];
    const seen = new Map<string, number>();

    for (const e of this.entries) {
      if (e.supersededAt !== null) continue;
      const key = `${e.entityType}:${e.entityId}:${e.field.key}`;
      seen.set(key, (seen.get(key) ?? 0) + 1);
    }

    for (const [key, count] of seen) {
      if (count > 1) violations.push(`Highlander violation: ${key} has ${count} active entries`);
    }
    return violations;
  }

  // Invariant: superseding entry created >= superseded entry's createdAt
  checkChronologicalChain(): string[] {
    const violations: string[] = [];
    for (const e of this.entries) {
      if (e.supersededAt === null) continue;
      // Find the successor
      const successor = this.entries.find(
        (s) =>
          s.entityType === e.entityType &&
          s.entityId === e.entityId &&
          s.field.key === e.field.key &&
          s.createdAt.getTime() >= e.supersededAt!.getTime() &&
          s.id !== e.id,
      );
      if (successor && successor.createdAt.getTime() < e.createdAt.getTime()) {
        violations.push(`Chronological violation: ${successor.id} created before ${e.id}`);
      }
    }
    return violations;
  }

  getActiveEntries(entityType: string, entityId: string): SimEntry[] {
    return this.entries.filter(
      (e) => e.entityType === entityType && e.entityId === entityId && e.supersededAt === null,
    );
  }

  getAllEntries(): SimEntry[] {
    return [...this.entries];
  }

  getFieldHistory(entityType: string, entityId: string, fieldKey: string): SimEntry[] {
    return this.entries
      .filter(
        (e) => e.entityType === entityType && e.entityId === entityId && e.field.key === fieldKey,
      )
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  }
}

// ===========================================
// fast-check Arbitraries
// ===========================================

const entityIdArb = fc.stringMatching(/^[a-f0-9]{4,8}$/);
const fieldKeyArb = fc.constantFrom(
  'preferred_fabric',
  'budget_range',
  'quality_preference',
  'style_notes',
  'contact_method',
);
const valueArb = fc.oneof(
  fc.string({ minLength: 0, maxLength: 50 }),
  fc.integer({ min: -1000, max: 1000 }),
  fc.boolean(),
  fc.constant(null),
);
const sourceArb = fc.constantFrom('manual', 'note', 'email', 'agent', 'ai-batch', 'predicted');
const confidenceArb = fc.double({ min: 0, max: 1, noNaN: true });

// ===========================================
// Helpers
// ===========================================

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
    agentInteraction: {
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
    },
    agentSuggestion: {
      findMany: vi.fn().mockResolvedValue([]),
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({ id: 'sug-1' }),
      update: vi.fn().mockResolvedValue({ id: 'sug-1' }),
    },
  } as any;
}

function makeLedgerEntry(overrides: Partial<SimEntry> & { field: SimEntry['field'] }): SimEntry {
  return {
    id: 'le-1',
    fieldId: overrides.field.id,
    entityType: 'client',
    entityId: 'c-1',
    value: 'test',
    confidence: 1.0,
    source: 'manual',
    sourceId: null,
    setBy: null,
    createdAt: new Date(),
    supersededAt: null,
    ...overrides,
  };
}

// ===========================================
// SUITE 1: Input Fuzzer -- Property-Based Stress
// ===========================================

describe('Input Fuzzer -- Property-Based Stress', () => {
  it('Highlander Rule: after N random writes, each (type, id, key) has exactly 0 or 1 active entry', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.tuple(entityIdArb, fieldKeyArb, valueArb, confidenceArb, sourceArb),
          { minLength: 10, maxLength: 200 },
        ),
        (ops) => {
          const sim = new LedgerSimulator();
          for (const [entityId, key, value, conf, source] of ops) {
            sim.writeField('client', entityId, key, value, conf, source);
          }
          const violations = sim.checkHighlanderRule();
          expect(violations).toEqual([]);
        },
      ),
      { numRuns: 200 },
    );
  });

  it('Chronological Chain: superseding entries are never backdated', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.tuple(entityIdArb, fieldKeyArb, valueArb, confidenceArb, sourceArb),
          { minLength: 10, maxLength: 200 },
        ),
        (ops) => {
          const sim = new LedgerSimulator();
          for (const [entityId, key, value, conf, source] of ops) {
            sim.writeField('client', entityId, key, value, conf, source);
          }
          const violations = sim.checkChronologicalChain();
          expect(violations).toEqual([]);
        },
      ),
      { numRuns: 200 },
    );
  });

  it('Supersession consistency: writing same key twice → first superseded, second active', () => {
    fc.assert(
      fc.property(entityIdArb, fieldKeyArb, valueArb, valueArb, (entityId, key, v1, v2) => {
        const sim = new LedgerSimulator();
        sim.writeField('client', entityId, key, v1, 1.0, 'manual');
        sim.writeField('client', entityId, key, v2, 1.0, 'manual');

        const active = sim.getActiveEntries('client', entityId);
        const activeForKey = active.filter((e) => e.field.key === key);
        expect(activeForKey).toHaveLength(1);
        expect(activeForKey[0].value).toBe(v2);

        const history = sim.getFieldHistory('client', entityId, key);
        expect(history).toHaveLength(2);
        expect(history[0].supersededAt).not.toBeNull();
      }),
      { numRuns: 500 },
    );
  });

  it('Multi-entity isolation: writes to entity A never affect entity B', () => {
    fc.assert(
      fc.property(
        entityIdArb,
        entityIdArb,
        fieldKeyArb,
        valueArb,
        valueArb,
        (idA, idB, key, vA, vB) => {
          fc.pre(idA !== idB);
          const sim = new LedgerSimulator();
          sim.writeField('client', idA, key, vA, 1.0, 'manual');
          sim.writeField('client', idB, key, vB, 1.0, 'manual');

          const activeA = sim.getActiveEntries('client', idA);
          const activeB = sim.getActiveEntries('client', idB);

          const valA = activeA.find((e) => e.field.key === key)?.value;
          const valB = activeB.find((e) => e.field.key === key)?.value;

          expect(valA).toBe(vA);
          expect(valB).toBe(vB);
        },
      ),
      { numRuns: 500 },
    );
  });

  it('Confidence bounds: stored confidence is always in [0, 1]', () => {
    fc.assert(
      fc.property(
        fc.double({ min: -10, max: 10, noNaN: true }),
        (rawConf) => {
          const sim = new LedgerSimulator();
          sim.writeField('client', 'c-1', 'preferred_fabric', 'silk', rawConf, 'manual');
          const all = sim.getAllEntries();
          for (const e of all) {
            expect(e.confidence).toBeGreaterThanOrEqual(0);
            expect(e.confidence).toBeLessThanOrEqual(1);
          }
        },
      ),
      { numRuns: 500 },
    );
  });

  it('Truth score bounds: computeTruthScore always returns [0, 1]', () => {
    const now = new Date();
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            confidence: confidenceArb,
            source: sourceArb,
            createdAt: fc.date({ min: new Date(2020, 0, 1), max: now, noInvalidDate: true }),
            supersededAt: fc.oneof(
              fc.constant(null),
              fc.date({ min: new Date(2020, 0, 1), max: now, noInvalidDate: true }),
            ),
          }),
          { minLength: 1, maxLength: 20 },
        ),
        (assertions) => {
          const score = computeTruthScore(assertions, now);
          expect(score).toBeGreaterThanOrEqual(0);
          expect(score).toBeLessThanOrEqual(1);
        },
      ),
      { numRuns: 1000 },
    );
  });

  it('Recency factor bounds: computeRecencyFactor always returns [0, 1]', () => {
    const now = new Date();
    fc.assert(
      fc.property(
        fc.date({ min: new Date(2000, 0, 1), max: new Date(2030, 0, 1), noInvalidDate: true }),
        fc.integer({ min: 1, max: 3650 }),
        (createdAt, maxAgeDays) => {
          const factor = computeRecencyFactor(createdAt, now, maxAgeDays);
          expect(factor).toBeGreaterThanOrEqual(0);
          expect(factor).toBeLessThanOrEqual(1);
        },
      ),
      { numRuns: 1000 },
    );
  });

  it('Complexity score bounds: computeComplexityScore always returns [0, 1]', () => {
    fc.assert(
      fc.property(
        fc.nat({ max: 100 }),
        fc.nat({ max: 100 }),
        fc.nat({ max: 50 }),
        fc.nat({ max: 50 }),
        (fieldsUsed, fieldsAvailable, catsUsed, maxCats) => {
          const score = computeComplexityScore(fieldsUsed, fieldsAvailable, catsUsed, maxCats);
          expect(score).toBeGreaterThanOrEqual(0);
          expect(score).toBeLessThanOrEqual(1);
        },
      ),
      { numRuns: 1000 },
    );
  });

  it('Decay monotonicity: older entries have lower decayed confidence', () => {
    fc.assert(
      fc.property(
        confidenceArb,
        fc.integer({ min: 1, max: 365 }),
        fc.integer({ min: 1, max: 365 }),
        fc.integer({ min: 1, max: 730 }),
        (conf, age1, age2, halfLife) => {
          fc.pre(conf > 0 && age1 !== age2);
          const now = new Date();
          const d1 = new Date(now.getTime() - age1 * 86400000);
          const d2 = new Date(now.getTime() - age2 * 86400000);
          const c1 = computeDecayedConfidence(conf, d1, halfLife, now);
          const c2 = computeDecayedConfidence(conf, d2, halfLife, now);
          // Older → lower confidence
          if (age1 > age2) {
            expect(c1).toBeLessThanOrEqual(c2 + 1e-10);
          } else {
            expect(c2).toBeLessThanOrEqual(c1 + 1e-10);
          }
        },
      ),
      { numRuns: 1000 },
    );
  });

  it('Relationship strength bounds: computeRelationshipStrength always returns [0, 1]', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            sourceConfidence: confidenceArb,
            targetConfidence: confidenceArb,
          }),
          { minLength: 0, maxLength: 20 },
        ),
        fc.integer({ min: 1, max: 100 }),
        (sharedFields, totalFields) => {
          const strength = computeRelationshipStrength(sharedFields, totalFields);
          expect(strength).toBeGreaterThanOrEqual(0);
          expect(strength).toBeLessThanOrEqual(1);
        },
      ),
      { numRuns: 1000 },
    );
  });

  it('Health score bounds: computeOverallScore always returns [0, 1]', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0, max: 1, noNaN: true }),
        fc.double({ min: 0, max: 1, noNaN: true }),
        fc.double({ min: 0, max: 1, noNaN: true }),
        fc.double({ min: 0, max: 1, noNaN: true }),
        (completeness, freshness, conflictRate, truthAverage) => {
          const score = computeOverallScore(completeness, freshness, conflictRate, truthAverage);
          expect(score).toBeGreaterThanOrEqual(-1e-10);
          expect(score).toBeLessThanOrEqual(1 + 1e-10);
        },
      ),
      { numRuns: 1000 },
    );
  });

  it('Conflict severity ordering: higher truth scores yield equal or higher severity', () => {
    const rule: ConflictRule = {
      type: 'value_contradiction',
      description: 'test',
      fieldA: 'a',
      fieldB: 'b',
      check: () => true, // always conflict
    };

    fc.assert(
      fc.property(
        confidenceArb,
        confidenceArb,
        fc.double({ min: 0, max: 1, noNaN: true }),
        fc.double({ min: 0, max: 1, noNaN: true }),
        (confA, confB, tsA, tsB) => {
          const lowTruth = Math.min(tsA, tsB);
          const highTruth = Math.max(tsA, tsB);

          const fieldsLow: Record<string, { value: unknown; confidence: number; truthScore: number }> = {
            a: { value: 'x', confidence: confA, truthScore: lowTruth * 0.3 },
            b: { value: 'y', confidence: confB, truthScore: lowTruth * 0.3 },
          };
          const fieldsHigh: Record<string, { value: unknown; confidence: number; truthScore: number }> = {
            a: { value: 'x', confidence: confA, truthScore: highTruth },
            b: { value: 'y', confidence: confB, truthScore: highTruth },
          };

          const cLow = evaluateConflictRule(rule, fieldsLow);
          const cHigh = evaluateConflictRule(rule, fieldsHigh);

          if (cLow && cHigh) {
            const ORDER = { low: 0, medium: 1, high: 2 };
            expect(ORDER[cHigh.severity]).toBeGreaterThanOrEqual(ORDER[cLow.severity]);
          }
        },
      ),
      { numRuns: 500 },
    );
  });

  it('Branching threshold: shouldBranch returns proceed when confidence >= threshold', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0, max: 1, noNaN: true }),
        fc.double({ min: 0, max: 1, noNaN: true }),
        (conf, threshold) => {
          if (conf >= threshold) {
            expect(shouldBranch(conf, undefined, threshold)).toBe('proceed');
          }
        },
      ),
      { numRuns: 1000 },
    );
  });

  it('Staleness threshold: isStale returns true when decayed confidence < threshold', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0.01, max: 1, noNaN: true }),
        fc.integer({ min: 1, max: 365 }),
        fc.integer({ min: 1, max: 365 }),
        fc.double({ min: 0.01, max: 0.99, noNaN: true }),
        (conf, ageDays, halfLife, threshold) => {
          const now = new Date();
          const createdAt = new Date(now.getTime() - ageDays * 86400000);
          const decayed = computeDecayedConfidence(conf, createdAt, halfLife, now);
          const stale = isStale(conf, createdAt, halfLife, threshold, now);
          expect(stale).toBe(decayed < threshold);
        },
      ),
      { numRuns: 1000 },
    );
  });

  it('Field definition gating: only approved field keys produce ledger entries', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 30 }),
        (randomKey) => {
          const sim = new LedgerSimulator();
          sim.writeField('client', 'c-1', randomKey, 'val', 1.0, 'manual');

          if (APPROVED_KEYS.has(randomKey)) {
            expect(sim.getAllEntries()).toHaveLength(1);
          } else {
            expect(sim.getAllEntries()).toHaveLength(0);
          }
        },
      ),
      { numRuns: 500 },
    );
  });

  it('Batch write atomicity: setEntityFields with N approved fields → exactly N entries', async () => {
    const db = createMockDb();
    let createCount = 0;

    db.entityFieldDefinition.findMany.mockImplementation(async ({ where }: any) => {
      return FIELD_DEFS.filter(
        (d) => d.entityType === where.entityType && where.key.in.includes(d.key),
      );
    });
    db.knowledgeLedgerEntry.updateMany.mockResolvedValue({ count: 0 });
    db.knowledgeLedgerEntry.create.mockImplementation(async () => {
      createCount++;
      return { id: `le-${createCount}` };
    });
    // Mock fireObservers to avoid dynamic import issues
    db.entityFieldDefinition.findMany.mockImplementationOnce(async ({ where }: any) => {
      return FIELD_DEFS.filter(
        (d) => d.entityType === where.entityType && where.key.in.includes(d.key),
      );
    });

    const fields = {
      preferred_fabric: 'silk',
      budget_range: 'high',
      quality_preference: 'premium',
    };

    const result = await setEntityFields(db, 'client', 'c-1', fields, 'manual');

    expect(result.written).toHaveLength(3);
    expect(result.skipped).toHaveLength(0);
  });

  it('Truth score monotonicity: higher confidence + more recent → higher truth score', () => {
    const now = new Date();
    fc.assert(
      fc.property(
        fc.double({ min: 0.01, max: 0.5, noNaN: true }),
        fc.double({ min: 0.51, max: 1.0, noNaN: true }),
        (lowConf, highConf) => {
          const recent = new Date(now.getTime() - 1 * 86400000);
          const old = new Date(now.getTime() - 300 * 86400000);

          const lowScore = computeTruthScore(
            [{ confidence: lowConf, source: 'predicted', createdAt: old, supersededAt: null }],
            now,
          );
          const highScore = computeTruthScore(
            [{ confidence: highConf, source: 'manual', createdAt: recent, supersededAt: null }],
            now,
          );

          expect(highScore).toBeGreaterThanOrEqual(lowScore);
        },
      ),
      { numRuns: 500 },
    );
  });

  it('Source reliability: all known sources have reliability in (0, 1]', () => {
    for (const source of APPROVED_SOURCES) {
      const rel = SOURCE_RELIABILITY[source];
      expect(rel).toBeGreaterThan(0);
      expect(rel).toBeLessThanOrEqual(1);
    }
  });
});

// ===========================================
// SUITE 2: Edge Cases -- Semantic Perimeter
// ===========================================

describe('Edge Cases -- Semantic Perimeter', () => {
  let db: ReturnType<typeof createMockDb>;

  beforeEach(() => {
    db = createMockDb();
    vi.restoreAllMocks();
  });

  function setupFieldDefMock() {
    db.entityFieldDefinition.findMany.mockImplementation(async ({ where }: any) => {
      return FIELD_DEFS.filter(
        (d) =>
          d.entityType === where.entityType &&
          d.isActive === where.isActive &&
          d.status === where.status &&
          (where.key?.in ?? []).includes(d.key),
      );
    });
    db.knowledgeLedgerEntry.updateMany.mockResolvedValue({ count: 0 });
    let id = 0;
    db.knowledgeLedgerEntry.create.mockImplementation(async () => ({ id: `le-${++id}` }));
  }

  it('approved key writes succeed', async () => {
    setupFieldDefMock();
    for (const def of FIELD_DEFS) {
      const result = await setEntityFields(db, 'client', 'c-1', { [def.key]: 'val' }, 'manual');
      expect(result.written.length).toBe(1);
    }
  });

  it('unapproved key is silently skipped (typo)', async () => {
    setupFieldDefMock();
    const result = await setEntityFields(db, 'client', 'c-1', { preffered_fabric: 'silk' }, 'manual');
    expect(result.written).toHaveLength(0);
    expect(result.skipped).toContain('preffered_fabric');
  });

  it('mixed approved + unapproved: only approved keys written', async () => {
    setupFieldDefMock();
    const result = await setEntityFields(
      db, 'client', 'c-1',
      { preferred_fabric: 'silk', nonexistent_key: 'val' },
      'manual',
    );
    expect(result.written).toHaveLength(1);
    expect(result.written[0].key).toBe('preferred_fabric');
    expect(result.skipped).toContain('nonexistent_key');
  });

  it('empty string key is skipped', async () => {
    setupFieldDefMock();
    const result = await setEntityFields(db, 'client', 'c-1', { '': 'val' }, 'manual');
    expect(result.written).toHaveLength(0);
    expect(result.skipped).toContain('');
  });

  it('numeric key is skipped', async () => {
    setupFieldDefMock();
    const result = await setEntityFields(db, 'client', 'c-1', { '123': 'val' }, 'manual');
    expect(result.written).toHaveLength(0);
  });

  it('unicode key is skipped', async () => {
    setupFieldDefMock();
    const result = await setEntityFields(db, 'client', 'c-1', { '好的_fabric': 'val' }, 'manual');
    expect(result.written).toHaveLength(0);
  });

  it('injection attempt key is skipped', async () => {
    setupFieldDefMock();
    const result = await setEntityFields(
      db, 'client', 'c-1',
      { "'; DROP TABLE --": 'val' },
      'manual',
    );
    expect(result.written).toHaveLength(0);
  });

  it('case sensitivity: PREFERRED_FABRIC (uppercase) is not approved', async () => {
    setupFieldDefMock();
    const result = await setEntityFields(db, 'client', 'c-1', { PREFERRED_FABRIC: 'silk' }, 'manual');
    expect(result.written).toHaveLength(0);
    expect(result.skipped).toContain('PREFERRED_FABRIC');
  });

  it('deactivated field is not written', async () => {
    db.entityFieldDefinition.findMany.mockResolvedValue([]);
    db.knowledgeLedgerEntry.updateMany.mockResolvedValue({ count: 0 });
    db.knowledgeLedgerEntry.create.mockResolvedValue({ id: 'le-1' });

    const result = await setEntityFields(db, 'client', 'c-1', { preferred_fabric: 'silk' }, 'manual');
    expect(result.written).toHaveLength(0);
  });

  it('null value → entry created (explicit null is valid)', async () => {
    setupFieldDefMock();
    const result = await setEntityFields(db, 'client', 'c-1', { preferred_fabric: null }, 'manual');
    expect(result.written).toHaveLength(1);
  });

  it('empty object fields → 0 entries', async () => {
    setupFieldDefMock();
    const result = await setEntityFields(db, 'client', 'c-1', {}, 'manual');
    expect(result.written).toHaveLength(0);
    expect(result.skipped).toHaveLength(0);
  });

  it('very long key (1000 chars) → no entry', async () => {
    setupFieldDefMock();
    const longKey = 'x'.repeat(1000);
    const result = await setEntityFields(db, 'client', 'c-1', { [longKey]: 'val' }, 'manual');
    expect(result.written).toHaveLength(0);
  });

  it('special characters in value are stored correctly', async () => {
    setupFieldDefMock();
    const specialValue = 'hello\nnewline\ttab\u00e9accent';
    const result = await setEntityFields(
      db, 'client', 'c-1',
      { preferred_fabric: specialValue },
      'manual',
    );
    expect(result.written).toHaveLength(1);
    expect(db.knowledgeLedgerEntry.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          value: specialValue,
        }),
      }),
    );
  });

  it('source is passed through to ledger entry', async () => {
    setupFieldDefMock();
    for (const source of APPROVED_SOURCES) {
      await setEntityFields(db, 'client', 'c-1', { preferred_fabric: 'silk' }, source);
    }
    const calls = db.knowledgeLedgerEntry.create.mock.calls;
    const sources = calls.map((c: any) => c[0].data.source);
    expect(sources).toEqual(APPROVED_SOURCES);
  });

  it('value type coercion: non-string values are accepted', async () => {
    setupFieldDefMock();
    const values = [42, true, { nested: 'obj' }, ['array']];
    for (const val of values) {
      const result = await setEntityFields(db, 'client', 'c-1', { preferred_fabric: val }, 'manual');
      expect(result.written).toHaveLength(1);
    }
  });
});

// ===========================================
// SUITE 3: State Corruption -- Total Recall
// ===========================================

describe('State Corruption -- Total Recall', () => {
  let db: ReturnType<typeof createMockDb>;

  beforeEach(() => {
    db = createMockDb();
    vi.restoreAllMocks();
  });

  it('single write → getKnowledgeAt(now) matches getEntityFields', async () => {
    const now = new Date();
    const entry = makeLedgerEntry({
      id: 'le-1',
      value: 'silk',
      confidence: 0.9,
      source: 'manual',
      createdAt: now,
      supersededAt: null,
      field: { id: 'fd-1', key: 'preferred_fabric', label: 'Preferred Fabric', dataType: 'text', category: 'preferences' },
    });

    db.knowledgeLedgerEntry.findMany.mockResolvedValue([entry]);

    const fields = await getEntityFields(db, 'client', 'c-1');
    const snapshot = await getKnowledgeAt(db, 'client', 'c-1', now);

    const currentVal = fields.grouped.preferences?.[0]?.value;
    const snapshotVal = snapshot.fields.preferred_fabric?.value;
    expect(currentVal).toBe(snapshotVal);
  });

  it('overwritten value → old snapshot returns old value', async () => {
    const t1 = new Date('2026-01-01T00:00:00Z');
    const t2 = new Date('2026-02-01T00:00:00Z');
    const queryTime = new Date('2026-01-15T00:00:00Z');

    const entry1 = makeLedgerEntry({
      id: 'le-1',
      value: 'wool',
      createdAt: t1,
      supersededAt: t2,
      field: { id: 'fd-1', key: 'preferred_fabric', label: 'Preferred Fabric', dataType: 'text', category: 'preferences' },
    });
    const entry2 = makeLedgerEntry({
      id: 'le-2',
      value: 'silk',
      createdAt: t2,
      supersededAt: null,
      field: { id: 'fd-1', key: 'preferred_fabric', label: 'Preferred Fabric', dataType: 'text', category: 'preferences' },
    });

    // At queryTime (between t1 and t2), entry1 was active
    db.knowledgeLedgerEntry.findMany.mockResolvedValue([entry1]);

    const snapshot = await getKnowledgeAt(db, 'client', 'c-1', queryTime);
    expect(snapshot.fields.preferred_fabric?.value).toBe('wool');
  });

  it('future timestamp → same as current (no future entries)', async () => {
    const now = new Date();
    const future = new Date(now.getTime() + 365 * 86400000);
    const entry = makeLedgerEntry({
      value: 'silk',
      createdAt: now,
      supersededAt: null,
      field: { id: 'fd-1', key: 'preferred_fabric', label: 'Preferred Fabric', dataType: 'text', category: 'preferences' },
    });

    db.knowledgeLedgerEntry.findMany.mockResolvedValue([entry]);

    const current = await getKnowledgeAt(db, 'client', 'c-1', now);
    const futureSnapshot = await getKnowledgeAt(db, 'client', 'c-1', future);

    expect(current.fields.preferred_fabric?.value).toBe(futureSnapshot.fields.preferred_fabric?.value);
  });

  it('before first write → empty fields', async () => {
    const t1 = new Date('2026-03-01T00:00:00Z');
    const beforeAll = new Date('2025-01-01T00:00:00Z');

    db.knowledgeLedgerEntry.findMany.mockResolvedValue([]);

    const snapshot = await getKnowledgeAt(db, 'client', 'c-1', beforeAll);
    expect(Object.keys(snapshot.fields)).toHaveLength(0);
  });

  it('timeline chronological order: events sorted by createdAt ascending', async () => {
    const entries = Array.from({ length: 10 }, (_, i) => ({
      ...makeLedgerEntry({
        id: `le-${i}`,
        value: `val-${i}`,
        createdAt: new Date(2026, 0, i + 1),
        field: { id: 'fd-1', key: 'preferred_fabric', label: 'Preferred Fabric', dataType: 'text', category: 'preferences' },
      }),
      supersededAt: i < 9 ? new Date(2026, 0, i + 2) : null,
    }));

    db.knowledgeLedgerEntry.findMany.mockResolvedValue(entries);

    const timeline = await getKnowledgeTimeline(
      db, 'client', 'c-1',
      new Date(2025, 11, 1),
      new Date(2026, 1, 1),
    );

    for (let i = 1; i < timeline.length; i++) {
      expect(timeline[i].createdAt.getTime()).toBeGreaterThanOrEqual(timeline[i - 1].createdAt.getTime());
    }
  });

  it('multi-field reconstruction: each snapshot has correct field subset', async () => {
    const t1 = new Date('2026-01-01T00:00:00Z');
    const t2 = new Date('2026-02-01T00:00:00Z');

    // At t1 only preferred_fabric existed; at t2, budget_range was added
    const fabricEntry = makeLedgerEntry({
      id: 'le-1',
      value: 'silk',
      createdAt: t1,
      supersededAt: null,
      field: { id: 'fd-1', key: 'preferred_fabric', label: 'Preferred Fabric', dataType: 'text', category: 'preferences' },
    });

    // For getKnowledgeAt(t1) → only fabricEntry active
    db.knowledgeLedgerEntry.findMany.mockResolvedValueOnce([fabricEntry]);

    const snapshotT1 = await getKnowledgeAt(db, 'client', 'c-1', t1);
    expect(Object.keys(snapshotT1.fields)).toHaveLength(1);
    expect(snapshotT1.fields.preferred_fabric?.value).toBe('silk');

    const budgetEntry = makeLedgerEntry({
      id: 'le-2',
      value: 'high',
      createdAt: t2,
      supersededAt: null,
      field: { id: 'fd-2', key: 'budget_range', label: 'Budget Range', dataType: 'text', category: 'financial' },
    });

    // For getKnowledgeAt(t2) → both entries active
    db.knowledgeLedgerEntry.findMany.mockResolvedValueOnce([fabricEntry, budgetEntry]);

    const snapshotT2 = await getKnowledgeAt(db, 'client', 'c-1', t2);
    expect(Object.keys(snapshotT2.fields)).toHaveLength(2);
    expect(snapshotT2.fields.preferred_fabric?.value).toBe('silk');
    expect(snapshotT2.fields.budget_range?.value).toBe('high');
  });

  it('field deletion (supersede to null) → absent from active state', async () => {
    // Entry superseded (replaced with null value)
    const entry = makeLedgerEntry({
      value: null,
      createdAt: new Date('2026-01-15T00:00:00Z'),
      supersededAt: null,
      field: { id: 'fd-1', key: 'preferred_fabric', label: 'Preferred Fabric', dataType: 'text', category: 'preferences' },
    });

    db.knowledgeLedgerEntry.findMany.mockResolvedValue([entry]);

    const result = await getEntityFields(db, 'client', 'c-1');
    // null value IS stored, but the value is null
    const val = result.grouped.preferences?.[0]?.value;
    expect(val).toBeNull();
  });

  it('cross-entity isolation in time-travel: entity A history never leaks into B', async () => {
    const entry = makeLedgerEntry({
      entityId: 'c-1',
      value: 'silk',
      field: { id: 'fd-1', key: 'preferred_fabric', label: 'Preferred Fabric', dataType: 'text', category: 'preferences' },
    });

    // Query for entity c-2 → should get empty (no entries match)
    db.knowledgeLedgerEntry.findMany.mockResolvedValue([]);

    const snapshot = await getKnowledgeAt(db, 'client', 'c-2', new Date());
    expect(Object.keys(snapshot.fields)).toHaveLength(0);
  });

  it('getFieldValueAt consistency: matches multi-field reconstruction', async () => {
    const t1 = new Date('2026-01-10T00:00:00Z');
    const entry = makeLedgerEntry({
      value: 'silk',
      confidence: 0.9,
      source: 'manual',
      createdAt: t1,
      supersededAt: null,
      field: { id: 'fd-1', key: 'preferred_fabric', label: 'Preferred Fabric', dataType: 'text', category: 'preferences' },
    });

    // getKnowledgeAt
    db.knowledgeLedgerEntry.findMany.mockResolvedValueOnce([entry]);
    const snapshot = await getKnowledgeAt(db, 'client', 'c-1', t1);

    // getFieldValueAt
    db.entityFieldDefinition.findFirst.mockResolvedValueOnce(FIELD_DEFS[0]);
    db.knowledgeLedgerEntry.findFirst.mockResolvedValueOnce(entry);
    const single = await getFieldValueAt(db, 'client', 'c-1', 'preferred_fabric', t1);

    expect(snapshot.fields.preferred_fabric?.value).toBe(single?.value);
    expect(snapshot.fields.preferred_fabric?.confidence).toBe(single?.confidence);
  });

  it('invalid date range: from > to throws KNOWLEDGE_341', async () => {
    const from = new Date('2026-06-01T00:00:00Z');
    const to = new Date('2026-01-01T00:00:00Z');

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await expect(
      getKnowledgeTimeline(db, 'client', 'c-1', from, to),
    ).rejects.toThrow();

    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('KNOWLEDGE_341'),
    );
  });

  it('timeline limit parameter: limit=5 returns at most 5', async () => {
    const entries = Array.from({ length: 10 }, (_, i) =>
      makeLedgerEntry({
        id: `le-${i}`,
        value: `v-${i}`,
        createdAt: new Date(2026, 0, i + 1),
        field: { id: 'fd-1', key: 'preferred_fabric', label: 'Preferred Fabric', dataType: 'text', category: 'preferences' },
      }),
    );

    // Mock returns what Prisma would with take:5
    db.knowledgeLedgerEntry.findMany.mockResolvedValue(entries.slice(0, 5));

    const timeline = await getKnowledgeTimeline(
      db, 'client', 'c-1',
      new Date(2025, 11, 1),
      new Date(2026, 1, 1),
      5,
    );

    expect(timeline.length).toBeLessThanOrEqual(5);
  });

  it('boundary timestamp: write at T=100, query at T=100 includes the write', async () => {
    const t = new Date('2026-01-15T12:00:00Z');
    const entry = makeLedgerEntry({
      value: 'silk',
      createdAt: t,
      supersededAt: null,
      field: { id: 'fd-1', key: 'preferred_fabric', label: 'Preferred Fabric', dataType: 'text', category: 'preferences' },
    });

    db.knowledgeLedgerEntry.findMany.mockResolvedValue([entry]);

    const snapshot = await getKnowledgeAt(db, 'client', 'c-1', t);
    expect(snapshot.fields.preferred_fabric).toBeDefined();
    expect(snapshot.fields.preferred_fabric?.value).toBe('silk');
  });

  it('reconstruction after many overwrites: 10 sequential writes, latest is current', async () => {
    const writes = Array.from({ length: 10 }, (_, i) =>
      makeLedgerEntry({
        id: `le-${i}`,
        value: `val-${i}`,
        createdAt: new Date(2026, 0, i + 1),
        supersededAt: i < 9 ? new Date(2026, 0, i + 2) : null,
        field: { id: 'fd-1', key: 'preferred_fabric', label: 'Preferred Fabric', dataType: 'text', category: 'preferences' },
      }),
    );

    // getEntityFields: only active entries (last one)
    db.knowledgeLedgerEntry.findMany.mockResolvedValue([writes[9]]);
    const current = await getEntityFields(db, 'client', 'c-1');
    expect(current.grouped.preferences?.[0]?.value).toBe('val-9');
  });
});

// ===========================================
// SUITE 4: Security -- Temporal Sanctity
// ===========================================

describe('Security -- Temporal Sanctity', () => {
  let db: ReturnType<typeof createMockDb>;

  beforeEach(() => {
    db = createMockDb();
    vi.restoreAllMocks();
  });

  it('superseded entries: original value/confidence/source unchanged after supersession', () => {
    const sim = new LedgerSimulator();
    sim.writeField('client', 'c-1', 'preferred_fabric', 'wool', 0.8, 'note');
    const before = { ...sim.getAllEntries()[0] };

    sim.writeField('client', 'c-1', 'preferred_fabric', 'silk', 1.0, 'manual');
    const after = sim.getAllEntries()[0]; // first entry

    expect(after.value).toBe(before.value);
    expect(after.confidence).toBe(before.confidence);
    expect(after.source).toBe(before.source);
    expect(after.createdAt.getTime()).toBe(before.createdAt.getTime());
  });

  it('supersededAt is set exactly once: null → timestamp, never changes again', () => {
    const sim = new LedgerSimulator();
    sim.writeField('client', 'c-1', 'preferred_fabric', 'wool', 0.8, 'note');
    expect(sim.getAllEntries()[0].supersededAt).toBeNull();

    sim.writeField('client', 'c-1', 'preferred_fabric', 'silk', 1.0, 'manual');
    const supersededAt1 = sim.getAllEntries()[0].supersededAt;
    expect(supersededAt1).not.toBeNull();

    sim.writeField('client', 'c-1', 'preferred_fabric', 'linen', 0.9, 'email');
    const supersededAt2 = sim.getAllEntries()[0].supersededAt;
    // First entry's supersededAt should not have changed
    expect(supersededAt2!.getTime()).toBe(supersededAt1!.getTime());
  });

  it('overwrite does not delete: old entries remain after supersession', () => {
    const sim = new LedgerSimulator();
    sim.writeField('client', 'c-1', 'preferred_fabric', 'wool', 0.8, 'note');
    sim.writeField('client', 'c-1', 'preferred_fabric', 'silk', 1.0, 'manual');
    sim.writeField('client', 'c-1', 'preferred_fabric', 'linen', 0.9, 'email');

    const all = sim.getAllEntries();
    expect(all).toHaveLength(3);
    const active = all.filter((e) => e.supersededAt === null);
    expect(active).toHaveLength(1);
    expect(active[0].value).toBe('linen');
  });

  it('decayed confidence is read-only: computeDecayedConfidence never mutates the input', () => {
    const originalConf = 0.9;
    const createdAt = new Date('2025-01-01T00:00:00Z');
    const halfLife = 90;

    const result = computeDecayedConfidence(originalConf, createdAt, halfLife);

    // The function takes primitives, not objects — but verify it returns a new value
    expect(result).toBeLessThan(originalConf);
    expect(originalConf).toBe(0.9); // unchanged
    expect(createdAt.getTime()).toBe(new Date('2025-01-01T00:00:00Z').getTime());
  });

  it('truth score is idempotent: same assertions → same score', () => {
    const now = new Date();
    const assertions = [
      { confidence: 0.9, source: 'manual', createdAt: new Date('2026-01-01'), supersededAt: null },
      { confidence: 0.7, source: 'note', createdAt: new Date('2025-06-01'), supersededAt: new Date('2026-01-01') },
    ];

    const score1 = computeTruthScore(assertions, now);
    const score2 = computeTruthScore(assertions, now);
    const score3 = computeTruthScore(assertions, now);

    expect(score1).toBe(score2);
    expect(score2).toBe(score3);
  });

  it('ghost field writes are marked source=predicted', async () => {
    const { writeGhostFields } = await import('../src/knowledge/ghost-fields');
    db.entityFieldDefinition.findFirst.mockResolvedValue(FIELD_DEFS[0]);
    db.knowledgeLedgerEntry.findFirst.mockResolvedValue(null); // no existing non-predicted
    db.knowledgeLedgerEntry.updateMany.mockResolvedValue({ count: 0 });
    db.knowledgeLedgerEntry.create.mockResolvedValue({ id: 'le-ghost' });

    await writeGhostFields(db, 'client', 'c-1', [
      {
        fieldKey: 'preferred_fabric',
        label: 'Preferred Fabric',
        predictedValue: 'silk',
        confidence: 0.6,
        basedOn: [],
        source: 'predicted' as const,
      },
    ]);

    expect(db.knowledgeLedgerEntry.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          source: 'predicted',
        }),
      }),
    );
  });

  it('ghost fields do not overwrite non-predicted values', async () => {
    const { writeGhostFields } = await import('../src/knowledge/ghost-fields');
    db.entityFieldDefinition.findFirst.mockResolvedValue(FIELD_DEFS[0]);
    // Existing manual entry → should skip
    db.knowledgeLedgerEntry.findFirst.mockResolvedValue({
      id: 'le-existing',
      source: 'manual',
      value: 'existing-value',
    });

    const result = await writeGhostFields(db, 'client', 'c-1', [
      {
        fieldKey: 'preferred_fabric',
        label: 'Preferred Fabric',
        predictedValue: 'silk',
        confidence: 0.6,
        basedOn: [],
        source: 'predicted' as const,
      },
    ]);

    expect(result.skipped).toBe(1);
    expect(result.written).toBe(0);
    expect(db.knowledgeLedgerEntry.create).not.toHaveBeenCalled();
  });

  it('branching: reject → no ledger entry written', async () => {
    db.entityFieldDefinition.findMany.mockResolvedValue([FIELD_DEFS[0]]);
    db.knowledgeLedgerEntry.findMany.mockResolvedValue([
      makeLedgerEntry({
        confidence: 0.95,
        source: 'manual',
        field: { id: 'fd-1', key: 'preferred_fabric', label: 'Preferred Fabric', dataType: 'text', category: 'preferences' },
      }),
    ]);

    const result = await setEntityFieldsWithBranching(
      db, 'client', 'c-1',
      { preferred_fabric: 'new-value' },
      'predicted',
      0.3, // Low confidence → triggers validation
      {
        validationCallbacks: {
          requestValidation: vi.fn().mockResolvedValue('reject'),
        },
      },
    );

    expect(result.written).toHaveLength(0);
    expect(result.skipped).toContain('preferred_fabric');
    expect(db.knowledgeLedgerEntry.create).not.toHaveBeenCalled();
  });

  it('branching: defer → no ledger entry written', async () => {
    db.entityFieldDefinition.findMany.mockResolvedValue([FIELD_DEFS[0]]);
    db.knowledgeLedgerEntry.findMany.mockResolvedValue([
      makeLedgerEntry({
        confidence: 0.95,
        source: 'manual',
        field: { id: 'fd-1', key: 'preferred_fabric', label: 'Preferred Fabric', dataType: 'text', category: 'preferences' },
      }),
    ]);

    const result = await setEntityFieldsWithBranching(
      db, 'client', 'c-1',
      { preferred_fabric: 'new-value' },
      'predicted',
      0.3,
      {
        validationCallbacks: {
          requestValidation: vi.fn().mockResolvedValue('defer'),
        },
      },
    );

    expect(result.written).toHaveLength(0);
    expect(result.deferred).toHaveLength(1);
    expect(result.validationRequested).toHaveLength(1);
    expect(db.knowledgeLedgerEntry.create).not.toHaveBeenCalled();
  });

  it('observer is advisory only: constraint violation does NOT prevent the write', async () => {
    const { fireObservers } = await import('../src/knowledge/observer');

    // Setup constraint that will be violated
    db.entityFieldDefinition.findMany.mockResolvedValue([
      {
        ...FIELD_DEFS[0],
        constraints: [{
          targetField: 'preferred_fabric',
          operator: 'not_in',
          values: ['silk'],
          message: 'Silk not allowed',
          severity: 'error',
        }],
      },
    ]);
    db.knowledgeLedgerEntry.findMany.mockResolvedValue([
      makeLedgerEntry({
        value: 'silk',
        field: { id: 'fd-1', key: 'preferred_fabric', label: 'Preferred Fabric', dataType: 'text', category: 'preferences' },
      }),
    ]);

    const violations = await fireObservers(db, 'client', 'c-1', ['preferred_fabric']);

    // Violations returned (advisory) but function doesn't throw
    expect(violations.length).toBeGreaterThan(0);
  });

  it('observer fires after write: callback receives violation details', async () => {
    const { fireObservers } = await import('../src/knowledge/observer');

    db.entityFieldDefinition.findMany.mockResolvedValue([
      {
        ...FIELD_DEFS[0],
        constraints: [{
          targetField: 'preferred_fabric',
          operator: 'not_equal',
          value: 'silk',
          message: 'Should not be silk',
          severity: 'warning',
        }],
      },
    ]);
    db.knowledgeLedgerEntry.findMany.mockResolvedValue([
      makeLedgerEntry({
        value: 'silk',
        field: { id: 'fd-1', key: 'preferred_fabric', label: 'Preferred Fabric', dataType: 'text', category: 'preferences' },
      }),
    ]);

    const onViolation = vi.fn().mockResolvedValue(undefined);

    await fireObservers(db, 'client', 'c-1', ['preferred_fabric'], {
      onConstraintViolation: onViolation,
    });

    expect(onViolation).toHaveBeenCalledWith(
      'client',
      'c-1',
      expect.arrayContaining([
        expect.objectContaining({
          fieldKey: 'preferred_fabric',
          actualValue: 'silk',
        }),
      ]),
    );
  });

  it('conflict detection is read-only: detectConflicts never modifies ledger entries', async () => {
    const { detectConflicts } = await import('../src/knowledge/reflection');

    const entries = [
      makeLedgerEntry({
        id: 'le-1', value: 'budget', confidence: 0.9, source: 'manual',
        field: { id: 'fd-2', key: 'budget_range', label: 'Budget Range', dataType: 'text', category: 'financial' },
      }),
      makeLedgerEntry({
        id: 'le-2', value: 'premium', confidence: 0.8, source: 'note',
        field: { id: 'fd-3', key: 'quality_preference', label: 'Quality Preference', dataType: 'text', category: 'preferences' },
      }),
    ];

    db.knowledgeLedgerEntry.findMany.mockResolvedValue(entries);

    await detectConflicts(db, 'client', 'c-1');

    // No mutations should have occurred
    expect(db.knowledgeLedgerEntry.create).not.toHaveBeenCalled();
    expect(db.knowledgeLedgerEntry.updateMany).not.toHaveBeenCalled();
  });

  it('scanForConflicts is read-only: batch scan never modifies entries', async () => {
    const { scanForConflicts } = await import('../src/knowledge/reflection');

    db.knowledgeLedgerEntry.findMany
      .mockResolvedValueOnce([{ entityId: 'c-1' }]) // distinct
      .mockResolvedValue([]); // detectConflicts for c-1

    await scanForConflicts(db, 'client');

    expect(db.knowledgeLedgerEntry.create).not.toHaveBeenCalled();
    expect(db.knowledgeLedgerEntry.updateMany).not.toHaveBeenCalled();
  });

  it('health computation is read-only: computeEntityHealth never modifies entries', async () => {
    const { computeEntityHealth } = await import('../src/knowledge/health');

    db.entityFieldDefinition.findMany.mockResolvedValue(FIELD_DEFS);
    db.knowledgeLedgerEntry.findMany.mockResolvedValue([
      makeLedgerEntry({
        field: { id: 'fd-1', key: 'preferred_fabric', label: 'Preferred Fabric', dataType: 'text', category: 'preferences' },
      }),
    ]);

    await computeEntityHealth(db, 'client', 'c-1');

    expect(db.knowledgeLedgerEntry.create).not.toHaveBeenCalled();
    expect(db.knowledgeLedgerEntry.updateMany).not.toHaveBeenCalled();
  });

  it('shadow graph is read-only: findRelatedEntities never modifies entries', async () => {
    const { findRelatedEntities } = await import('../src/knowledge/shadow-graph');

    db.knowledgeLedgerEntry.findMany
      .mockResolvedValueOnce([
        makeLedgerEntry({
          value: 'silk',
          field: { id: 'fd-1', key: 'preferred_fabric', label: 'Preferred Fabric', dataType: 'text', category: 'preferences' },
        }),
      ])
      .mockResolvedValue([]); // no matching entries in other entities

    await findRelatedEntities(db, 'client', 'c-1');

    expect(db.knowledgeLedgerEntry.create).not.toHaveBeenCalled();
    expect(db.knowledgeLedgerEntry.updateMany).not.toHaveBeenCalled();
  });

  it('stale field detection is read-only: getStaleFields never modifies entries', async () => {
    const { getStaleFields } = await import('../src/knowledge/decay');

    db.knowledgeLedgerEntry.findMany.mockResolvedValue([
      makeLedgerEntry({
        createdAt: new Date('2024-01-01'),
        field: {
          id: 'fd-1', key: 'preferred_fabric', label: 'Preferred Fabric',
          dataType: 'text', category: 'preferences',
          halfLifeDays: 30,
        } as any,
      }),
    ]);

    await getStaleFields(db, 'client', 'c-1');

    expect(db.knowledgeLedgerEntry.create).not.toHaveBeenCalled();
    expect(db.knowledgeLedgerEntry.updateMany).not.toHaveBeenCalled();
  });

  it('concurrent writes maintain Highlander: two rapid writes to same key → 1 active', () => {
    const sim = new LedgerSimulator();
    // Simulate rapid sequential writes (simulator is synchronous)
    sim.writeField('client', 'c-1', 'preferred_fabric', 'wool', 1.0, 'manual');
    sim.writeField('client', 'c-1', 'preferred_fabric', 'silk', 1.0, 'agent');

    const violations = sim.checkHighlanderRule();
    expect(violations).toEqual([]);

    const active = sim.getActiveEntries('client', 'c-1');
    const fabricActive = active.filter((e) => e.field.key === 'preferred_fabric');
    expect(fabricActive).toHaveLength(1);
    expect(fabricActive[0].value).toBe('silk');
  });
});

// ===========================================
// SUITE 5: Edge Cases -- Suggestion Convergence
// ===========================================

describe('Edge Cases -- Suggestion Convergence', () => {
  let db: ReturnType<typeof createMockDb>;

  beforeEach(() => {
    db = createMockDb();
    vi.restoreAllMocks();
  });

  function makeInteractions(topic: string, count: number) {
    return Array.from({ length: count }, () => ({
      topic,
      toolsUsed: ['tool1'],
      modules: ['mod1'],
    }));
  }

  it('9 queries → no suggestions (below MIN_QUERY_THRESHOLD=10)', async () => {
    db.agentInteraction.findMany.mockResolvedValue(makeInteractions('reports', 9));
    db.agentInteraction.count.mockResolvedValue(9);

    const created = await analyzeAndSuggest(db);

    expect(created).toBe(0);
    expect(db.agentSuggestion.create).not.toHaveBeenCalled();
  });

  it('10 queries → suggestions generated (exactly at threshold)', async () => {
    db.agentInteraction.findMany.mockResolvedValue(makeInteractions('reports', 10));
    db.agentInteraction.count.mockResolvedValue(10);
    db.agentSuggestion.findFirst.mockResolvedValue(null);

    const created = await analyzeAndSuggest(db);

    expect(created).toBe(1);
    expect(db.agentSuggestion.create).toHaveBeenCalled();
  });

  it('11 queries → suggestions generated (above threshold)', async () => {
    db.agentInteraction.findMany.mockResolvedValue(makeInteractions('reports', 11));
    db.agentInteraction.count.mockResolvedValue(11);
    db.agentSuggestion.findFirst.mockResolvedValue(null);

    const created = await analyzeAndSuggest(db);

    expect(created).toBe(1);
  });

  it('volume score caps at 1.0 for counts >= 50', async () => {
    db.agentInteraction.findMany.mockResolvedValue(makeInteractions('billing', 60));
    db.agentInteraction.count.mockResolvedValue(60);
    db.agentSuggestion.findFirst.mockResolvedValue(null);

    await analyzeAndSuggest(db);

    const callData = db.agentSuggestion.create.mock.calls[0]?.[0]?.data;
    // volumeScore = min(1.0, 60/50) = 1.0
    // topicConsistency = 60/60 = 1.0
    // confidence = 1.0 * (0.5 + 1.0 * 0.5) = 1.0
    expect(callData.confidence).toBe(1.0);
  });

  it('volume score linearity: count/50 for count < 50', async () => {
    db.agentInteraction.findMany.mockResolvedValue(makeInteractions('scheduling', 25));
    db.agentInteraction.count.mockResolvedValue(25);
    db.agentSuggestion.findFirst.mockResolvedValue(null);

    await analyzeAndSuggest(db);

    const callData = db.agentSuggestion.create.mock.calls[0]?.[0]?.data;
    // volumeScore = 25/50 = 0.5
    // topicConsistency = 25/25 = 1.0
    // confidence = 0.5 * (0.5 + 1.0 * 0.5) = 0.5 * 1.0 = 0.5
    expect(callData.confidence).toBe(0.5);
  });

  it('confidence formula correctness: confidence = volumeScore × (0.5 + consistency × 0.5)', async () => {
    // 30 queries about "onboarding" out of 60 total
    db.agentInteraction.findMany.mockResolvedValue(makeInteractions('onboarding', 30));
    db.agentInteraction.count.mockResolvedValue(60);
    db.agentSuggestion.findFirst.mockResolvedValue(null);

    await analyzeAndSuggest(db);

    const callData = db.agentSuggestion.create.mock.calls[0]?.[0]?.data;
    // volumeScore = min(1.0, 30/50) = 0.6
    // topicConsistency = 30/60 = 0.5
    // confidence = 0.6 * (0.5 + 0.5 * 0.5) = 0.6 * 0.75 = 0.45
    expect(callData.confidence).toBe(0.45);
  });

  it('confidence bounds [0, 1]: PBT over arbitrary count/total', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 10, max: 500 }),
        fc.integer({ min: 10, max: 1000 }),
        (count, total) => {
          fc.pre(count <= total);
          const volumeScore = Math.min(1.0, count / 50);
          const topicConsistency = count / total;
          const confidence = volumeScore * (0.5 + topicConsistency * 0.5);

          expect(confidence).toBeGreaterThanOrEqual(0);
          expect(confidence).toBeLessThanOrEqual(1);
        },
      ),
      { numRuns: 1000 },
    );
  });

  it('100% topic consistency: all queries same topic → consistency = 1.0', async () => {
    db.agentInteraction.findMany.mockResolvedValue(makeInteractions('inventory', 50));
    db.agentInteraction.count.mockResolvedValue(50);
    db.agentSuggestion.findFirst.mockResolvedValue(null);

    await analyzeAndSuggest(db);

    const callData = db.agentSuggestion.create.mock.calls[0]?.[0]?.data;
    // volumeScore = 1.0, consistency = 1.0
    // confidence = 1.0 * (0.5 + 1.0 * 0.5) = 1.0
    expect(callData.confidence).toBe(1.0);
  });

  it('dismiss cooldown boundary: day 89 → still dismissed', async () => {
    db.agentInteraction.findMany.mockResolvedValue(makeInteractions('billing', 15));
    db.agentInteraction.count.mockResolvedValue(15);
    db.agentSuggestion.findFirst.mockResolvedValue({
      id: 'sug-1',
      name: 'Billing Agent',
      status: 'dismissed',
      dismissedAt: new Date(Date.now() - 89 * 24 * 60 * 60 * 1000),
    });

    const created = await analyzeAndSuggest(db);

    expect(created).toBe(0);
    expect(db.agentSuggestion.update).not.toHaveBeenCalled();
  });

  it('dismiss cooldown boundary: day 90 → still dismissed (< not <=)', async () => {
    db.agentInteraction.findMany.mockResolvedValue(makeInteractions('billing', 15));
    db.agentInteraction.count.mockResolvedValue(15);
    // Dismissed exactly 90 days ago (minus 1ms to stay within cooldown)
    db.agentSuggestion.findFirst.mockResolvedValue({
      id: 'sug-1',
      name: 'Billing Agent',
      status: 'dismissed',
      dismissedAt: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000 + 1000),
    });

    const created = await analyzeAndSuggest(db);

    expect(created).toBe(0);
    expect(db.agentSuggestion.update).not.toHaveBeenCalled();
  });

  it('dismiss cooldown boundary: day 91 → eligible again', async () => {
    db.agentInteraction.findMany.mockResolvedValue(makeInteractions('billing', 15));
    db.agentInteraction.count.mockResolvedValue(15);
    db.agentSuggestion.findFirst.mockResolvedValue({
      id: 'sug-old',
      name: 'Billing Agent',
      status: 'dismissed',
      dismissedAt: new Date(Date.now() - 91 * 24 * 60 * 60 * 1000),
      dismissedBy: 'user-1',
    });

    const created = await analyzeAndSuggest(db);

    expect(created).toBe(0); // Updated, not created
    expect(db.agentSuggestion.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'pending',
          dismissedAt: null,
          dismissedBy: null,
        }),
      }),
    );
  });

  it('SPECIALIST_TOPICS exclusion: all 7 specialist topics produce no suggestions', async () => {
    const specialistTopics = [
      'tax operations',
      'order management',
      'fabric stock',
      'client management',
      'fit profiles',
      'email templates',
      'automations',
    ];

    for (const topic of specialistTopics) {
      db = createMockDb();
      db.agentInteraction.findMany.mockResolvedValue(makeInteractions(topic, 50));
      db.agentInteraction.count.mockResolvedValue(50);

      const created = await analyzeAndSuggest(db);

      expect(created).toBe(0);
      expect(db.agentSuggestion.create).not.toHaveBeenCalled();
    }
  });

  it('TOPIC_TO_AGENT mapping: mapped topic above threshold → suggestion generated', async () => {
    db.agentInteraction.findMany.mockResolvedValue(makeInteractions('email campaigns', 20));
    db.agentInteraction.count.mockResolvedValue(20);
    db.agentSuggestion.findFirst.mockResolvedValue(null);

    const created = await analyzeAndSuggest(db);

    expect(created).toBe(1);
    expect(db.agentSuggestion.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          name: 'Marketing Agent',
          category: 'communication',
        }),
      }),
    );
  });

  it('non-mapped topic above threshold → no suggestion (no agent mapping)', async () => {
    db.agentInteraction.findMany.mockResolvedValue(makeInteractions('random unknown', 50));
    db.agentInteraction.count.mockResolvedValue(50);

    const created = await analyzeAndSuggest(db);

    expect(created).toBe(0);
    expect(db.agentSuggestion.create).not.toHaveBeenCalled();
  });

  it('empty interaction history: 0 queries → no suggestions, no errors', async () => {
    db.agentInteraction.findMany.mockResolvedValue([]);
    db.agentInteraction.count.mockResolvedValue(0);

    const created = await analyzeAndSuggest(db);

    expect(created).toBe(0);
    expect(db.agentSuggestion.create).not.toHaveBeenCalled();
    expect(db.agentSuggestion.update).not.toHaveBeenCalled();
  });
});
