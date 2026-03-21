// ===========================================
// @ordinatio/entities — OBSERVER TESTS
// ===========================================

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@prisma/client', () => ({
  Prisma: { JsonNull: '__json_null__', InputJsonValue: {} },
}));

import {
  evaluateConstraint,
  checkConstraints,
  fireObservers,
} from '../src/knowledge/observer';
import type { FieldConstraint, ObserverCallbacks } from '../src/types';

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

// ----- evaluateConstraint -----

describe('evaluateConstraint', () => {
  it('detects not_in violation', () => {
    const constraint: FieldConstraint = {
      targetField: 'status',
      operator: 'not_in',
      values: ['deleted', 'archived'],
      message: 'Status should not be deleted or archived',
      severity: 'error',
    };

    const violation = evaluateConstraint(constraint, { status: 'deleted' });
    expect(violation).not.toBeNull();
    expect(violation!.message).toContain('Status should not be');
  });

  it('returns null for not_in when value is allowed', () => {
    const constraint: FieldConstraint = {
      targetField: 'status',
      operator: 'not_in',
      values: ['deleted', 'archived'],
      message: 'Bad status',
      severity: 'error',
    };

    expect(evaluateConstraint(constraint, { status: 'active' })).toBeNull();
  });

  it('detects in violation (value not in allowed set)', () => {
    const constraint: FieldConstraint = {
      targetField: 'priority',
      operator: 'in',
      values: ['low', 'medium', 'high'],
      message: 'Invalid priority',
      severity: 'warning',
    };

    const violation = evaluateConstraint(constraint, { priority: 'critical' });
    expect(violation).not.toBeNull();
  });

  it('detects not_equal violation', () => {
    const constraint: FieldConstraint = {
      targetField: 'type',
      operator: 'not_equal',
      value: 'internal',
      message: 'Type should not be internal',
      severity: 'warning',
    };

    const violation = evaluateConstraint(constraint, { type: 'internal' });
    expect(violation).not.toBeNull();
  });

  it('detects less_than violation', () => {
    const constraint: FieldConstraint = {
      targetField: 'budget',
      operator: 'less_than',
      value: 1000,
      message: 'Budget too high',
      severity: 'warning',
    };

    const violation = evaluateConstraint(constraint, { budget: 1500 });
    expect(violation).not.toBeNull();
  });

  it('detects greater_than violation', () => {
    const constraint: FieldConstraint = {
      targetField: 'count',
      operator: 'greater_than',
      value: 10,
      message: 'Count too low',
      severity: 'warning',
    };

    const violation = evaluateConstraint(constraint, { count: 5 });
    expect(violation).not.toBeNull();
  });

  it('detects regex violation', () => {
    const constraint: FieldConstraint = {
      targetField: 'email',
      operator: 'regex',
      pattern: '^[^@]+@[^@]+\\.[^@]+$',
      message: 'Invalid email format',
      severity: 'error',
    };

    const violation = evaluateConstraint(constraint, { email: 'not-an-email' });
    expect(violation).not.toBeNull();
  });

  it('returns null when target field is missing', () => {
    const constraint: FieldConstraint = {
      targetField: 'missing',
      operator: 'not_equal',
      value: 'x',
      message: 'Test',
      severity: 'warning',
    };

    expect(evaluateConstraint(constraint, {})).toBeNull();
  });

  it('returns null for invalid regex pattern', () => {
    const constraint: FieldConstraint = {
      targetField: 'name',
      operator: 'regex',
      pattern: '[invalid((',
      message: 'Bad regex',
      severity: 'warning',
    };

    expect(evaluateConstraint(constraint, { name: 'test' })).toBeNull();
  });
});

// ----- checkConstraints -----

describe('checkConstraints', () => {
  let db: ReturnType<typeof createMockDb>;

  beforeEach(() => {
    db = createMockDb();
    vi.restoreAllMocks();
  });

  it('returns violations when constraints are breached', async () => {
    db.entityFieldDefinition.findMany.mockResolvedValue([{
      id: 'fd-1',
      key: 'budget_style',
      entityType: 'client',
      constraints: [
        {
          targetField: 'preferred_fabric',
          operator: 'not_in',
          values: ['cashmere', 'silk'],
          message: 'Budget clients should not prefer luxury fabrics',
          severity: 'warning',
        },
      ],
    }]);

    db.knowledgeLedgerEntry.findMany.mockResolvedValue([
      {
        id: 'le-1', value: 'cashmere', supersededAt: null,
        field: { key: 'preferred_fabric' },
      },
    ]);

    const violations = await checkConstraints(db, 'client', 'c-1');
    expect(violations).toHaveLength(1);
    expect(violations[0].fieldKey).toBe('preferred_fabric');
  });

  it('returns empty when no field defs have constraints', async () => {
    db.entityFieldDefinition.findMany.mockResolvedValue([]);

    const violations = await checkConstraints(db, 'client', 'c-1');
    expect(violations).toEqual([]);
  });

  it('throws and logs KNOWLEDGE_350 on DB error', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    db.entityFieldDefinition.findMany.mockRejectedValue(new Error('db error'));

    await expect(checkConstraints(db, 'client', 'c-1')).rejects.toThrow('db error');
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('KNOWLEDGE_350'),
      expect.any(Error),
    );
  });
});

// ----- fireObservers -----

describe('fireObservers', () => {
  let db: ReturnType<typeof createMockDb>;

  beforeEach(() => {
    db = createMockDb();
    vi.restoreAllMocks();
  });

  it('calls onConstraintViolation callback when violations exist', async () => {
    db.entityFieldDefinition.findMany.mockResolvedValue([{
      id: 'fd-1', constraints: [
        { targetField: 'x', operator: 'not_equal', value: 'bad', message: 'No bad', severity: 'error' },
      ],
    }]);
    db.knowledgeLedgerEntry.findMany.mockResolvedValue([
      { id: 'le-1', value: 'bad', supersededAt: null, field: { key: 'x' } },
    ]);

    const onConstraintViolation = vi.fn().mockResolvedValue(undefined);
    const callbacks: ObserverCallbacks = { onConstraintViolation };

    const violations = await fireObservers(db, 'client', 'c-1', ['x'], callbacks);

    expect(violations).toHaveLength(1);
    expect(onConstraintViolation).toHaveBeenCalledWith('client', 'c-1', expect.any(Array));
  });

  it('emits KNOWLEDGE_DISSONANCE event on violations', async () => {
    db.entityFieldDefinition.findMany.mockResolvedValue([{
      id: 'fd-1', constraints: [
        { targetField: 'x', operator: 'not_equal', value: 'bad', message: 'No bad', severity: 'error' },
      ],
    }]);
    db.knowledgeLedgerEntry.findMany.mockResolvedValue([
      { id: 'le-1', value: 'bad', supersededAt: null, field: { key: 'x' } },
    ]);

    const emitEvent = vi.fn().mockResolvedValue(undefined);
    const callbacks: ObserverCallbacks = { emitEvent };

    await fireObservers(db, 'client', 'c-1', ['x'], callbacks);

    expect(emitEvent).toHaveBeenCalledWith('KNOWLEDGE_DISSONANCE', expect.objectContaining({
      entityType: 'client',
      entityId: 'c-1',
      violations: expect.any(Array),
    }));
  });

  it('does not fail when callback throws', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    db.entityFieldDefinition.findMany.mockResolvedValue([{
      id: 'fd-1', constraints: [
        { targetField: 'x', operator: 'not_equal', value: 'bad', message: 'No bad', severity: 'error' },
      ],
    }]);
    db.knowledgeLedgerEntry.findMany.mockResolvedValue([
      { id: 'le-1', value: 'bad', supersededAt: null, field: { key: 'x' } },
    ]);

    const callbacks: ObserverCallbacks = {
      onConstraintViolation: vi.fn().mockRejectedValue(new Error('fail')),
    };

    const violations = await fireObservers(db, 'client', 'c-1', ['x'], callbacks);
    expect(violations).toHaveLength(1); // Still returns violations
  });

  it('returns empty when no constraints exist', async () => {
    db.entityFieldDefinition.findMany.mockResolvedValue([]);

    const violations = await fireObservers(db, 'client', 'c-1', ['x']);
    expect(violations).toEqual([]);
  });
});
