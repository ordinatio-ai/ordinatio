// ===========================================
// @ordinatio/entities — FIELD DEFINITIONS TESTS
// ===========================================

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the database package — field-definitions.ts imports { Prisma } for JsonNull
vi.mock('@prisma/client', () => ({
  Prisma: { JsonNull: '__json_null__' },
}));

import {
  getFieldDefinitions,
  createFieldDefinition,
  updateFieldDefinition,
  getFieldDefinitionById,
} from '../src/knowledge/field-definitions';
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

describe('getFieldDefinitions', () => {
  let db: ReturnType<typeof createMockDb>;

  beforeEach(() => {
    db = createMockDb();
    vi.restoreAllMocks();
  });

  it('returns fields grouped by category', async () => {
    const mockFields = [
      { id: '1', key: 'height', label: 'Height', category: 'measurements', sortOrder: 0 },
      { id: '2', key: 'weight', label: 'Weight', category: 'measurements', sortOrder: 1 },
      { id: '3', key: 'style', label: 'Style', category: 'preferences', sortOrder: 0 },
    ];
    db.entityFieldDefinition.findMany.mockResolvedValue(mockFields);

    const result = await getFieldDefinitions(db, 'client');

    expect(result.fields).toHaveLength(3);
    expect(result.grouped).toHaveProperty('measurements');
    expect(result.grouped).toHaveProperty('preferences');
    expect(result.grouped['measurements']).toHaveLength(2);
    expect(result.grouped['preferences']).toHaveLength(1);
  });

  it('filters by entityType when provided', async () => {
    db.entityFieldDefinition.findMany.mockResolvedValue([]);

    await getFieldDefinitions(db, 'client');

    expect(db.entityFieldDefinition.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ entityType: 'client' }),
      }),
    );
  });

  it('filters by status when provided', async () => {
    db.entityFieldDefinition.findMany.mockResolvedValue([]);

    await getFieldDefinitions(db, 'client', 'approved');

    expect(db.entityFieldDefinition.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: 'approved' }),
      }),
    );
  });

  it('excludes dismissed fields when no status filter provided', async () => {
    db.entityFieldDefinition.findMany.mockResolvedValue([]);

    await getFieldDefinitions(db);

    expect(db.entityFieldDefinition.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: { not: 'dismissed' } }),
      }),
    );
  });

  it('always filters by isActive: true', async () => {
    db.entityFieldDefinition.findMany.mockResolvedValue([]);

    await getFieldDefinitions(db);

    expect(db.entityFieldDefinition.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ isActive: true }),
      }),
    );
  });

  it('orders by category, sortOrder, label', async () => {
    db.entityFieldDefinition.findMany.mockResolvedValue([]);

    await getFieldDefinitions(db);

    expect(db.entityFieldDefinition.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: [{ category: 'asc' }, { sortOrder: 'asc' }, { label: 'asc' }],
      }),
    );
  });

  it('returns empty grouped object when no fields exist', async () => {
    db.entityFieldDefinition.findMany.mockResolvedValue([]);

    const result = await getFieldDefinitions(db);

    expect(result.fields).toHaveLength(0);
    expect(result.grouped).toEqual({});
  });

  it('throws and logs error when DB call fails', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const dbError = new Error('connection refused');
    db.entityFieldDefinition.findMany.mockRejectedValue(dbError);

    await expect(getFieldDefinitions(db, 'client')).rejects.toThrow('connection refused');
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('KNOWLEDGE_300'),
      dbError,
    );
  });
});

describe('createFieldDefinition', () => {
  let db: ReturnType<typeof createMockDb>;

  beforeEach(() => {
    db = createMockDb();
    vi.restoreAllMocks();
  });

  const validInput = {
    entityType: 'client' as const,
    key: 'preferred_fabric',
    label: 'Preferred Fabric',
    dataType: 'text' as const,
    category: 'preferences',
  };

  it('creates a field definition with required data', async () => {
    const createdField = { id: 'fd-1', ...validInput, status: 'approved', sortOrder: 0 };
    db.entityFieldDefinition.create.mockResolvedValue(createdField);

    const result = await createFieldDefinition(db, validInput);

    expect(result).toEqual(createdField);
    expect(db.entityFieldDefinition.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        entityType: 'client',
        key: 'preferred_fabric',
        label: 'Preferred Fabric',
        dataType: 'text',
        category: 'preferences',
        status: 'approved',
        sortOrder: 0,
      }),
    });
  });

  it('passes enumOptions when provided', async () => {
    const input = { ...validInput, dataType: 'enum' as const, enumOptions: ['wool', 'linen', 'cotton'] };
    db.entityFieldDefinition.create.mockResolvedValue({ id: 'fd-2', ...input });

    await createFieldDefinition(db, input);

    expect(db.entityFieldDefinition.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        enumOptions: ['wool', 'linen', 'cotton'],
      }),
    });
  });

  it('passes extractionHint when provided', async () => {
    const input = { ...validInput, extractionHint: 'Look for fabric preferences in notes' };
    db.entityFieldDefinition.create.mockResolvedValue({ id: 'fd-3', ...input });

    await createFieldDefinition(db, input);

    expect(db.entityFieldDefinition.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        extractionHint: 'Look for fabric preferences in notes',
      }),
    });
  });

  it('calls logActivity callback after creation', async () => {
    db.entityFieldDefinition.create.mockResolvedValue({ id: 'fd-4', ...validInput });
    const callbacks: MutationCallbacks = {
      logActivity: vi.fn().mockResolvedValue(undefined),
    };

    await createFieldDefinition(db, validInput, callbacks);

    expect(callbacks.logActivity).toHaveBeenCalledWith(
      'KNOWLEDGE_FIELD_CREATED',
      expect.stringContaining('Preferred Fabric'),
    );
    expect(callbacks.logActivity).toHaveBeenCalledWith(
      'KNOWLEDGE_FIELD_CREATED',
      expect.stringContaining('client'),
    );
  });

  it('does not fail when callbacks are undefined', async () => {
    db.entityFieldDefinition.create.mockResolvedValue({ id: 'fd-5', ...validInput });

    const result = await createFieldDefinition(db, validInput);

    expect(result).toBeDefined();
  });

  it('does not fail when logActivity callback throws', async () => {
    db.entityFieldDefinition.create.mockResolvedValue({ id: 'fd-6', ...validInput });
    const callbacks: MutationCallbacks = {
      logActivity: vi.fn().mockRejectedValue(new Error('activity logging broken')),
    };

    const result = await createFieldDefinition(db, validInput, callbacks);

    expect(result).toBeDefined();
    expect(result.id).toBe('fd-6');
  });

  it('throws and logs error when DB create fails', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const dbError = new Error('unique constraint violation');
    db.entityFieldDefinition.create.mockRejectedValue(dbError);

    await expect(createFieldDefinition(db, validInput)).rejects.toThrow('unique constraint violation');
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('KNOWLEDGE_301'),
      dbError,
    );
  });
});

describe('updateFieldDefinition', () => {
  let db: ReturnType<typeof createMockDb>;

  beforeEach(() => {
    db = createMockDb();
    vi.restoreAllMocks();
  });

  const existingField = {
    id: 'fd-100',
    key: 'collar_style',
    label: 'Collar Style',
    category: 'design',
    status: 'suggested',
    isActive: true,
  };

  it('returns null when field does not exist', async () => {
    db.entityFieldDefinition.findUnique.mockResolvedValue(null);

    const result = await updateFieldDefinition(db, 'nonexistent-id', { label: 'New Label' });

    expect(result).toBeNull();
    expect(db.entityFieldDefinition.update).not.toHaveBeenCalled();
  });

  it('updates label when provided', async () => {
    db.entityFieldDefinition.findUnique.mockResolvedValue(existingField);
    db.entityFieldDefinition.update.mockResolvedValue({ ...existingField, label: 'Updated Label' });

    const result = await updateFieldDefinition(db, 'fd-100', { label: 'Updated Label' });

    expect(result!.label).toBe('Updated Label');
    expect(db.entityFieldDefinition.update).toHaveBeenCalledWith({
      where: { id: 'fd-100' },
      data: expect.objectContaining({ label: 'Updated Label' }),
    });
  });

  it('calls logActivity when status changes to approved', async () => {
    db.entityFieldDefinition.findUnique.mockResolvedValue(existingField);
    db.entityFieldDefinition.update.mockResolvedValue({ ...existingField, status: 'approved' });
    const callbacks: MutationCallbacks = {
      logActivity: vi.fn().mockResolvedValue(undefined),
    };

    await updateFieldDefinition(db, 'fd-100', { status: 'approved' }, callbacks);

    expect(callbacks.logActivity).toHaveBeenCalledWith(
      'KNOWLEDGE_FIELD_APPROVED',
      expect.stringContaining('Collar Style'),
    );
  });

  it('calls logActivity when status changes to dismissed', async () => {
    db.entityFieldDefinition.findUnique.mockResolvedValue(existingField);
    db.entityFieldDefinition.update.mockResolvedValue({ ...existingField, status: 'dismissed' });
    const callbacks: MutationCallbacks = {
      logActivity: vi.fn().mockResolvedValue(undefined),
    };

    await updateFieldDefinition(db, 'fd-100', { status: 'dismissed' }, callbacks);

    expect(callbacks.logActivity).toHaveBeenCalledWith(
      'KNOWLEDGE_FIELD_DISMISSED',
      expect.stringContaining('Collar Style'),
    );
  });

  it('does not call logActivity when status does not change', async () => {
    const approved = { ...existingField, status: 'approved' };
    db.entityFieldDefinition.findUnique.mockResolvedValue(approved);
    db.entityFieldDefinition.update.mockResolvedValue(approved);
    const callbacks: MutationCallbacks = {
      logActivity: vi.fn().mockResolvedValue(undefined),
    };

    await updateFieldDefinition(db, 'fd-100', { status: 'approved' }, callbacks);

    expect(callbacks.logActivity).not.toHaveBeenCalled();
  });

  it('does not call logActivity for non-mapped status values', async () => {
    db.entityFieldDefinition.findUnique.mockResolvedValue(existingField);
    db.entityFieldDefinition.update.mockResolvedValue({ ...existingField, status: 'merged' });
    const callbacks: MutationCallbacks = {
      logActivity: vi.fn().mockResolvedValue(undefined),
    };

    await updateFieldDefinition(db, 'fd-100', { status: 'merged' }, callbacks);

    expect(callbacks.logActivity).not.toHaveBeenCalled();
  });

  it('does not fail when logActivity callback throws during status change', async () => {
    db.entityFieldDefinition.findUnique.mockResolvedValue(existingField);
    db.entityFieldDefinition.update.mockResolvedValue({ ...existingField, status: 'approved' });
    const callbacks: MutationCallbacks = {
      logActivity: vi.fn().mockRejectedValue(new Error('callback exploded')),
    };

    const result = await updateFieldDefinition(db, 'fd-100', { status: 'approved' }, callbacks);

    expect(result).toBeDefined();
    expect(result!.status).toBe('approved');
  });

  it('throws and logs error when DB update fails', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    db.entityFieldDefinition.findUnique.mockResolvedValue(existingField);
    const dbError = new Error('update failed');
    db.entityFieldDefinition.update.mockRejectedValue(dbError);

    await expect(updateFieldDefinition(db, 'fd-100', { label: 'X' })).rejects.toThrow('update failed');
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('KNOWLEDGE_302'),
      dbError,
    );
  });

  it('only includes provided fields in the update data', async () => {
    db.entityFieldDefinition.findUnique.mockResolvedValue(existingField);
    db.entityFieldDefinition.update.mockResolvedValue(existingField);

    await updateFieldDefinition(db, 'fd-100', { sortOrder: 5 });

    const updateCall = db.entityFieldDefinition.update.mock.calls[0][0];
    expect(updateCall.data).toEqual({ sortOrder: 5 });
    expect(updateCall.data).not.toHaveProperty('label');
    expect(updateCall.data).not.toHaveProperty('status');
  });
});

describe('getFieldDefinitionById', () => {
  let db: ReturnType<typeof createMockDb>;

  beforeEach(() => {
    db = createMockDb();
  });

  it('returns the field definition when found', async () => {
    const field = { id: 'fd-200', key: 'shoe_size', label: 'Shoe Size' };
    db.entityFieldDefinition.findUnique.mockResolvedValue(field);

    const result = await getFieldDefinitionById(db, 'fd-200');

    expect(result).toEqual(field);
    expect(db.entityFieldDefinition.findUnique).toHaveBeenCalledWith({ where: { id: 'fd-200' } });
  });

  it('returns null when field not found', async () => {
    db.entityFieldDefinition.findUnique.mockResolvedValue(null);

    const result = await getFieldDefinitionById(db, 'nonexistent');

    expect(result).toBeNull();
  });
});
