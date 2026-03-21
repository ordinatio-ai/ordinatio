// ===========================================
// @ordinatio/entities — BRANCHING TESTS
// ===========================================

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@prisma/client', () => ({
  Prisma: { JsonNull: '__json_null__', InputJsonValue: {} },
}));

import {
  shouldBranch,
  setEntityFieldsWithBranching,
} from '../src/knowledge/branching';

function createMockDb() {
  return {
    entityFieldDefinition: {
      findMany: vi.fn(),
    },
    knowledgeLedgerEntry: {
      findMany: vi.fn(),
      create: vi.fn(),
      updateMany: vi.fn(),
    },
  } as any;
}

// ----- shouldBranch -----

describe('shouldBranch', () => {
  it('proceeds when confidence >= threshold', () => {
    expect(shouldBranch(0.8, 0.9, 0.7)).toBe('proceed');
  });

  it('proceeds when confidence is below threshold but no existing value', () => {
    expect(shouldBranch(0.5, undefined, 0.7)).toBe('proceed');
  });

  it('validates when confidence is below threshold and existing is higher', () => {
    expect(shouldBranch(0.4, 0.9, 0.7)).toBe('validate');
  });

  it('proceeds when confidence is below threshold but existing is lower', () => {
    expect(shouldBranch(0.5, 0.3, 0.7)).toBe('proceed');
  });

  it('uses default threshold of 0.7', () => {
    expect(shouldBranch(0.6, 0.9)).toBe('validate');
    expect(shouldBranch(0.7, 0.9)).toBe('proceed');
  });
});

// ----- setEntityFieldsWithBranching -----

describe('setEntityFieldsWithBranching', () => {
  let db: ReturnType<typeof createMockDb>;

  beforeEach(() => {
    db = createMockDb();
    vi.restoreAllMocks();
  });

  it('writes high-confidence fields directly', async () => {
    db.entityFieldDefinition.findMany.mockResolvedValue([
      { id: 'fd-1', key: 'company', entityType: 'contact', isActive: true, status: 'approved' },
    ]);
    db.knowledgeLedgerEntry.findMany.mockResolvedValue([]);
    db.knowledgeLedgerEntry.updateMany.mockResolvedValue({ count: 0 });
    db.knowledgeLedgerEntry.create.mockResolvedValue({ id: 'le-new' });

    const result = await setEntityFieldsWithBranching(
      db, 'contact', 'con-1', { company: 'Acme' }, 'manual', 0.9,
    );

    expect(result.written).toHaveLength(1);
    expect(result.written[0].key).toBe('company');
    expect(result.deferred).toHaveLength(0);
    expect(result.validationRequested).toHaveLength(0);
  });

  it('defers low-confidence writes with no validator', async () => {
    db.entityFieldDefinition.findMany.mockResolvedValue([
      { id: 'fd-1', key: 'industry', entityType: 'contact', isActive: true, status: 'approved' },
    ]);
    db.knowledgeLedgerEntry.findMany.mockResolvedValue([
      { id: 'le-1', fieldId: 'fd-1', confidence: 0.9, value: 'Finance', field: { key: 'industry' } },
    ]);

    const result = await setEntityFieldsWithBranching(
      db, 'contact', 'con-1', { industry: 'Tech' }, 'agent', 0.3,
    );

    expect(result.written).toHaveLength(0);
    expect(result.deferred).toHaveLength(1);
    expect(result.deferred[0].key).toBe('industry');
    expect(result.validationRequested).toHaveLength(1);
  });

  it('calls requestValidation callback and writes on accept', async () => {
    db.entityFieldDefinition.findMany.mockResolvedValue([
      { id: 'fd-1', key: 'title', entityType: 'contact', isActive: true, status: 'approved' },
    ]);
    db.knowledgeLedgerEntry.findMany.mockResolvedValue([
      { id: 'le-1', fieldId: 'fd-1', confidence: 0.9, value: 'CEO', field: { key: 'title' } },
    ]);
    db.knowledgeLedgerEntry.updateMany.mockResolvedValue({ count: 1 });
    db.knowledgeLedgerEntry.create.mockResolvedValue({ id: 'le-new' });

    const requestValidation = vi.fn().mockResolvedValue('accept');

    const result = await setEntityFieldsWithBranching(
      db, 'contact', 'con-1', { title: 'CTO' }, 'agent', 0.4,
      { validationCallbacks: { requestValidation } },
    );

    expect(requestValidation).toHaveBeenCalledWith(
      'contact', 'con-1', 'title', 'CTO', 0.4, 'CEO', 0.9,
    );
    expect(result.written).toHaveLength(1);
  });

  it('skips field when validation returns reject', async () => {
    db.entityFieldDefinition.findMany.mockResolvedValue([
      { id: 'fd-1', key: 'title', entityType: 'contact', isActive: true, status: 'approved' },
    ]);
    db.knowledgeLedgerEntry.findMany.mockResolvedValue([
      { id: 'le-1', fieldId: 'fd-1', confidence: 0.9, value: 'CEO', field: { key: 'title' } },
    ]);

    const result = await setEntityFieldsWithBranching(
      db, 'contact', 'con-1', { title: 'CTO' }, 'agent', 0.4,
      { validationCallbacks: { requestValidation: vi.fn().mockResolvedValue('reject') } },
    );

    expect(result.written).toHaveLength(0);
    expect(result.skipped).toContain('title');
  });

  it('defers when validation returns defer', async () => {
    db.entityFieldDefinition.findMany.mockResolvedValue([
      { id: 'fd-1', key: 'title', entityType: 'contact', isActive: true, status: 'approved' },
    ]);
    db.knowledgeLedgerEntry.findMany.mockResolvedValue([
      { id: 'le-1', fieldId: 'fd-1', confidence: 0.9, value: 'CEO', field: { key: 'title' } },
    ]);

    const result = await setEntityFieldsWithBranching(
      db, 'contact', 'con-1', { title: 'CTO' }, 'agent', 0.4,
      { validationCallbacks: { requestValidation: vi.fn().mockResolvedValue('defer') } },
    );

    expect(result.deferred).toHaveLength(1);
    expect(result.validationRequested).toHaveLength(1);
  });

  it('defers when validation callback throws', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    db.entityFieldDefinition.findMany.mockResolvedValue([
      { id: 'fd-1', key: 'title', entityType: 'contact', isActive: true, status: 'approved' },
    ]);
    db.knowledgeLedgerEntry.findMany.mockResolvedValue([
      { id: 'le-1', fieldId: 'fd-1', confidence: 0.9, value: 'CEO', field: { key: 'title' } },
    ]);

    const result = await setEntityFieldsWithBranching(
      db, 'contact', 'con-1', { title: 'CTO' }, 'agent', 0.4,
      { validationCallbacks: { requestValidation: vi.fn().mockRejectedValue(new Error('timeout')) } },
    );

    expect(result.deferred).toHaveLength(1);
    expect(result.deferred[0].reason).toContain('callback failed');
  });

  it('skips unknown field keys', async () => {
    db.entityFieldDefinition.findMany.mockResolvedValue([]);
    db.knowledgeLedgerEntry.findMany.mockResolvedValue([]);

    const result = await setEntityFieldsWithBranching(
      db, 'contact', 'con-1', { unknown: 'value' }, 'manual', 0.9,
    );

    expect(result.skipped).toContain('unknown');
  });

  it('throws and logs KNOWLEDGE_343 on DB error', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    db.entityFieldDefinition.findMany.mockRejectedValue(new Error('db fail'));

    await expect(
      setEntityFieldsWithBranching(db, 'contact', 'con-1', { x: 1 }, 'manual', 0.9),
    ).rejects.toThrow('db fail');

    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('KNOWLEDGE_343'),
      expect.any(Error),
    );
  });
});
