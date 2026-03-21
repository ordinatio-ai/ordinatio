// ===========================================
// @ordinatio/entities — KNOWLEDGE LEDGER TESTS
// ===========================================

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  getEntityFields,
  setEntityFields,
  getFieldHistory,
} from '../src/knowledge/ledger';
import type { MutationCallbacks } from '../src/types';

function createMockDb() {
  return {
    entityFieldDefinition: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      count: vi.fn(),
    },
    knowledgeLedgerEntry: {
      findMany: vi.fn(),
      create: vi.fn(),
      updateMany: vi.fn(),
    },
    searchQueryLog: {
      create: vi.fn(),
    },
  } as any;
}

describe('getEntityFields', () => {
  let db: ReturnType<typeof createMockDb>;

  beforeEach(() => {
    db = createMockDb();
    vi.restoreAllMocks();
  });

  it('returns entries grouped by category', async () => {
    const now = new Date();
    const entries = [
      {
        id: 'le-1', fieldId: 'fd-1', entityType: 'client', entityId: 'c-1',
        value: '180cm', confidence: 0.95, source: 'manual', createdAt: now,
        field: { key: 'height', label: 'Height', dataType: 'text', category: 'measurements' },
      },
      {
        id: 'le-2', fieldId: 'fd-2', entityType: 'client', entityId: 'c-1',
        value: 'navy', confidence: 1.0, source: 'note', createdAt: now,
        field: { key: 'fav_color', label: 'Favorite Color', dataType: 'text', category: 'preferences' },
      },
      {
        id: 'le-3', fieldId: 'fd-3', entityType: 'client', entityId: 'c-1',
        value: '85kg', confidence: 0.9, source: 'manual', createdAt: now,
        field: { key: 'weight', label: 'Weight', dataType: 'text', category: 'measurements' },
      },
    ];
    db.knowledgeLedgerEntry.findMany.mockResolvedValue(entries);

    const result = await getEntityFields(db, 'client', 'c-1');

    expect(result.entries).toHaveLength(3);
    expect(result.grouped).toHaveProperty('measurements');
    expect(result.grouped).toHaveProperty('preferences');
    expect(result.grouped['measurements']).toHaveLength(2);
    expect(result.grouped['preferences']).toHaveLength(1);
  });

  it('maps entry fields correctly in grouped output', async () => {
    const now = new Date('2026-03-01T12:00:00Z');
    const entries = [
      {
        id: 'le-10', fieldId: 'fd-10', entityType: 'client', entityId: 'c-5',
        value: 'slim', confidence: 0.8, source: 'agent', createdAt: now,
        field: { key: 'fit_pref', label: 'Fit Preference', dataType: 'enum', category: 'fitting' },
      },
    ];
    db.knowledgeLedgerEntry.findMany.mockResolvedValue(entries);

    const result = await getEntityFields(db, 'client', 'c-5');

    const item = result.grouped['fitting'][0];
    expect(item.fieldId).toBe('fd-10');
    expect(item.key).toBe('fit_pref');
    expect(item.label).toBe('Fit Preference');
    expect(item.dataType).toBe('enum');
    expect(item.category).toBe('fitting');
    expect(item.value).toBe('slim');
    expect(item.confidence).toBe(0.8);
    expect(item.source).toBe('agent');
    expect(item.updatedAt).toEqual(now);
  });

  it('only queries non-superseded entries', async () => {
    db.knowledgeLedgerEntry.findMany.mockResolvedValue([]);

    await getEntityFields(db, 'client', 'c-1');

    expect(db.knowledgeLedgerEntry.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          entityType: 'client',
          entityId: 'c-1',
          supersededAt: null,
        }),
      }),
    );
  });

  it('includes field relation and orders by createdAt desc', async () => {
    db.knowledgeLedgerEntry.findMany.mockResolvedValue([]);

    await getEntityFields(db, 'order', 'o-99');

    expect(db.knowledgeLedgerEntry.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        include: { field: true },
        orderBy: { createdAt: 'desc' },
      }),
    );
  });

  it('returns empty grouped object when no entries exist', async () => {
    db.knowledgeLedgerEntry.findMany.mockResolvedValue([]);

    const result = await getEntityFields(db, 'client', 'c-nonexistent');

    expect(result.entries).toHaveLength(0);
    expect(result.grouped).toEqual({});
  });

  it('throws and logs error when DB call fails', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const dbError = new Error('db timeout');
    db.knowledgeLedgerEntry.findMany.mockRejectedValue(dbError);

    await expect(getEntityFields(db, 'client', 'c-1')).rejects.toThrow('db timeout');
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('KNOWLEDGE_310'),
      dbError,
    );
  });
});

describe('setEntityFields', () => {
  let db: ReturnType<typeof createMockDb>;

  beforeEach(() => {
    db = createMockDb();
    vi.restoreAllMocks();
  });

  it('supersedes old entries and creates new ones for known fields', async () => {
    const fieldDefs = [
      { id: 'fd-A', key: 'height', entityType: 'client', isActive: true, status: 'approved' },
    ];
    db.entityFieldDefinition.findMany.mockResolvedValue(fieldDefs);
    db.knowledgeLedgerEntry.updateMany.mockResolvedValue({ count: 1 });
    db.knowledgeLedgerEntry.create.mockResolvedValue({ id: 'le-new-1' });

    const result = await setEntityFields(db, 'client', 'c-1', { height: '182cm' }, 'manual');

    expect(db.knowledgeLedgerEntry.updateMany).toHaveBeenCalledWith({
      where: expect.objectContaining({
        fieldId: 'fd-A',
        entityType: 'client',
        entityId: 'c-1',
        supersededAt: null,
      }),
      data: { supersededAt: expect.any(Date) },
    });

    expect(db.knowledgeLedgerEntry.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        fieldId: 'fd-A',
        entityType: 'client',
        entityId: 'c-1',
        value: '182cm',
        confidence: 1.0,
        source: 'manual',
      }),
    });

    expect(result.written).toEqual([{ key: 'height', entryId: 'le-new-1' }]);
    expect(result.skipped).toEqual([]);
  });

  it('skips unknown keys and logs a warning', async () => {
    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    db.entityFieldDefinition.findMany.mockResolvedValue([]);

    const result = await setEntityFields(
      db, 'client', 'c-1',
      { unknown_field: 'value' },
      'manual',
    );

    expect(result.written).toEqual([]);
    expect(result.skipped).toEqual(['unknown_field']);
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('KNOWLEDGE_313'),
      ['unknown_field'],
    );
  });

  it('handles mix of known and unknown fields', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const fieldDefs = [
      { id: 'fd-B', key: 'shoe_size', entityType: 'client', isActive: true, status: 'approved' },
    ];
    db.entityFieldDefinition.findMany.mockResolvedValue(fieldDefs);
    db.knowledgeLedgerEntry.updateMany.mockResolvedValue({ count: 0 });
    db.knowledgeLedgerEntry.create.mockResolvedValue({ id: 'le-shoe' });

    const result = await setEntityFields(
      db, 'client', 'c-2',
      { shoe_size: '44', bogus_key: 'nope' },
      'note',
    );

    expect(result.written).toEqual([{ key: 'shoe_size', entryId: 'le-shoe' }]);
    expect(result.skipped).toEqual(['bogus_key']);
  });

  it('passes sourceId, confidence, and setBy to created entries', async () => {
    const fieldDefs = [
      { id: 'fd-C', key: 'weight', entityType: 'client', isActive: true, status: 'approved' },
    ];
    db.entityFieldDefinition.findMany.mockResolvedValue(fieldDefs);
    db.knowledgeLedgerEntry.updateMany.mockResolvedValue({ count: 0 });
    db.knowledgeLedgerEntry.create.mockResolvedValue({ id: 'le-w' });

    await setEntityFields(db, 'client', 'c-3', { weight: '90kg' }, 'agent', 'note-42', 0.75, 'user-99');

    expect(db.knowledgeLedgerEntry.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        confidence: 0.75,
        source: 'agent',
        sourceId: 'note-42',
        setBy: 'user-99',
      }),
    });
  });

  it('calls logActivity callback with count and entity info', async () => {
    const fieldDefs = [
      { id: 'fd-D', key: 'height', entityType: 'client', isActive: true, status: 'approved' },
      { id: 'fd-E', key: 'weight', entityType: 'client', isActive: true, status: 'approved' },
    ];
    db.entityFieldDefinition.findMany.mockResolvedValue(fieldDefs);
    db.knowledgeLedgerEntry.updateMany.mockResolvedValue({ count: 0 });
    db.knowledgeLedgerEntry.create
      .mockResolvedValueOnce({ id: 'le-h' })
      .mockResolvedValueOnce({ id: 'le-w' });

    const callbacks: MutationCallbacks = {
      logActivity: vi.fn().mockResolvedValue(undefined),
    };

    await setEntityFields(
      db, 'client', 'c-10',
      { height: '180cm', weight: '85kg' },
      'manual', undefined, 1.0, undefined, callbacks,
    );

    expect(callbacks.logActivity).toHaveBeenCalledWith(
      'KNOWLEDGE_VALUE_SET',
      expect.stringContaining('2 knowledge field(s)'),
      { clientId: 'c-10' },
    );
  });

  it('passes clientId in activity data when entityType is client', async () => {
    const fieldDefs = [
      { id: 'fd-F', key: 'x', entityType: 'client', isActive: true, status: 'approved' },
    ];
    db.entityFieldDefinition.findMany.mockResolvedValue(fieldDefs);
    db.knowledgeLedgerEntry.updateMany.mockResolvedValue({ count: 0 });
    db.knowledgeLedgerEntry.create.mockResolvedValue({ id: 'le-x' });

    const callbacks: MutationCallbacks = {
      logActivity: vi.fn().mockResolvedValue(undefined),
    };

    await setEntityFields(db, 'client', 'c-50', { x: 'v' }, 'manual', undefined, 1.0, undefined, callbacks);

    expect(callbacks.logActivity).toHaveBeenCalledWith(
      'KNOWLEDGE_VALUE_SET',
      expect.any(String),
      { clientId: 'c-50' },
    );
  });

  it('does not pass clientId in activity data for non-client entities', async () => {
    const fieldDefs = [
      { id: 'fd-G', key: 'y', entityType: 'order', isActive: true, status: 'approved' },
    ];
    db.entityFieldDefinition.findMany.mockResolvedValue(fieldDefs);
    db.knowledgeLedgerEntry.updateMany.mockResolvedValue({ count: 0 });
    db.knowledgeLedgerEntry.create.mockResolvedValue({ id: 'le-y' });

    const callbacks: MutationCallbacks = {
      logActivity: vi.fn().mockResolvedValue(undefined),
    };

    await setEntityFields(db, 'order', 'o-1', { y: 'v' }, 'manual', undefined, 1.0, undefined, callbacks);

    expect(callbacks.logActivity).toHaveBeenCalledWith(
      'KNOWLEDGE_VALUE_SET',
      expect.any(String),
      undefined,
    );
  });

  it('does not call logActivity when nothing was written', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    db.entityFieldDefinition.findMany.mockResolvedValue([]);
    const callbacks: MutationCallbacks = {
      logActivity: vi.fn().mockResolvedValue(undefined),
    };

    await setEntityFields(db, 'client', 'c-1', { unknown: 'x' }, 'manual', undefined, 1.0, undefined, callbacks);

    expect(callbacks.logActivity).not.toHaveBeenCalled();
  });

  it('does not fail when logActivity callback throws', async () => {
    const fieldDefs = [
      { id: 'fd-H', key: 'z', entityType: 'client', isActive: true, status: 'approved' },
    ];
    db.entityFieldDefinition.findMany.mockResolvedValue(fieldDefs);
    db.knowledgeLedgerEntry.updateMany.mockResolvedValue({ count: 0 });
    db.knowledgeLedgerEntry.create.mockResolvedValue({ id: 'le-z' });

    const callbacks: MutationCallbacks = {
      logActivity: vi.fn().mockRejectedValue(new Error('callback broken')),
    };

    const result = await setEntityFields(
      db, 'client', 'c-1', { z: 'val' }, 'manual', undefined, 1.0, undefined, callbacks,
    );

    expect(result.written).toHaveLength(1);
  });

  it('throws and logs error when DB call fails', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const dbError = new Error('write failed');
    db.entityFieldDefinition.findMany.mockRejectedValue(dbError);

    await expect(
      setEntityFields(db, 'client', 'c-1', { height: '180' }, 'manual'),
    ).rejects.toThrow('write failed');
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('KNOWLEDGE_311'),
      dbError,
    );
  });
});

describe('getFieldHistory', () => {
  let db: ReturnType<typeof createMockDb>;

  beforeEach(() => {
    db = createMockDb();
    vi.restoreAllMocks();
  });

  it('returns ledger entries for an entity', async () => {
    const entries = [
      { id: 'le-h1', fieldId: 'fd-1', value: '182cm', createdAt: new Date(), field: { key: 'height' } },
      { id: 'le-h2', fieldId: 'fd-1', value: '180cm', createdAt: new Date(), field: { key: 'height' } },
    ];
    db.knowledgeLedgerEntry.findMany.mockResolvedValue(entries);

    const result = await getFieldHistory(db, 'client', 'c-1');

    expect(result).toHaveLength(2);
    expect(db.knowledgeLedgerEntry.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { entityType: 'client', entityId: 'c-1' },
        include: { field: true },
        orderBy: { createdAt: 'desc' },
        take: 50,
      }),
    );
  });

  it('filters by fieldId when provided', async () => {
    db.knowledgeLedgerEntry.findMany.mockResolvedValue([]);

    await getFieldHistory(db, 'client', 'c-1', 'fd-specific');

    expect(db.knowledgeLedgerEntry.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ fieldId: 'fd-specific' }),
      }),
    );
  });

  it('does not include fieldId in where when not provided', async () => {
    db.knowledgeLedgerEntry.findMany.mockResolvedValue([]);

    await getFieldHistory(db, 'client', 'c-1');

    const call = db.knowledgeLedgerEntry.findMany.mock.calls[0][0];
    expect(call.where).not.toHaveProperty('fieldId');
  });

  it('respects custom limit', async () => {
    db.knowledgeLedgerEntry.findMany.mockResolvedValue([]);

    await getFieldHistory(db, 'client', 'c-1', undefined, 10);

    expect(db.knowledgeLedgerEntry.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 10 }),
    );
  });

  it('throws and logs error when DB call fails', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const dbError = new Error('history query failed');
    db.knowledgeLedgerEntry.findMany.mockRejectedValue(dbError);

    await expect(getFieldHistory(db, 'client', 'c-1')).rejects.toThrow('history query failed');
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('KNOWLEDGE_312'),
      dbError,
    );
  });
});
