// ===========================================
// @ordinatio/entities — AGENT PREFERENCES TESTS
// ===========================================

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@prisma/client', () => ({
  Prisma: { JsonNull: '__json_null__', InputJsonValue: {} },
}));

import {
  getPreferences,
  setPreference,
  deletePreference,
} from '../src/agent/preferences';

function createMockDb() {
  return {
    agentKnowledge: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      createMany: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      deleteMany: vi.fn(),
      count: vi.fn(),
    },
    agentPreference: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    agentInteraction: {
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      count: vi.fn(),
    },
    agentSuggestion: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    $transaction: vi.fn(),
  } as any;
}

describe('getPreferences', () => {
  let db: ReturnType<typeof createMockDb>;

  beforeEach(() => {
    db = createMockDb();
    vi.restoreAllMocks();
  });

  it('returns org-wide preferences when no userId', async () => {
    const prefs = [
      { id: '1', entity: 'order-item', field: 'fabric', value: 'navy', userId: null },
    ];
    db.agentPreference.findMany.mockResolvedValue(prefs);

    const result = await getPreferences(db, { entity: 'order-item' });

    expect(result).toEqual(prefs);
    expect(db.agentPreference.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          entity: 'order-item',
          isActive: true,
          userId: null,
        }),
        orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }],
      }),
    );
  });

  it('returns org-wide + user-specific when userId is provided', async () => {
    const prefs = [
      { id: '1', entity: 'order-item', field: 'fabric', value: 'navy', userId: null },
      { id: '2', entity: 'order-item', field: 'fabric', value: 'charcoal', userId: 'user-1' },
    ];
    db.agentPreference.findMany.mockResolvedValue(prefs);

    const result = await getPreferences(db, { entity: 'order-item', userId: 'user-1' });

    expect(result).toHaveLength(2);
    const callArgs = db.agentPreference.findMany.mock.calls[0][0];
    expect(callArgs.where.OR).toEqual([{ userId: null }, { userId: 'user-1' }]);
  });

  it('filters by field when provided', async () => {
    db.agentPreference.findMany.mockResolvedValue([]);

    await getPreferences(db, { entity: 'order-item', field: 'lining' });

    expect(db.agentPreference.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ field: 'lining' }),
      }),
    );
  });
});

describe('setPreference', () => {
  let db: ReturnType<typeof createMockDb>;

  beforeEach(() => {
    db = createMockDb();
    vi.restoreAllMocks();
  });

  it('creates a new preference when none exists', async () => {
    db.agentPreference.findFirst.mockResolvedValue(null);
    const created = { id: 'new-1', entity: 'order-item', field: 'fabric', value: 'navy' };
    db.agentPreference.create.mockResolvedValue(created);

    const result = await setPreference(db, {
      entity: 'order-item',
      field: 'fabric',
      value: 'navy',
      label: 'Navy Blue',
      priority: 10,
    });

    expect(result).toEqual(created);
    expect(db.agentPreference.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          entity: 'order-item',
          field: 'fabric',
          value: 'navy',
          label: 'Navy Blue',
          userId: null,
          priority: 10,
        }),
      }),
    );
  });

  it('updates existing preference (upsert)', async () => {
    const existing = { id: 'pref-1', entity: 'order-item', field: 'fabric', value: 'old' };
    db.agentPreference.findFirst.mockResolvedValue(existing);
    const updated = { ...existing, value: 'new-value', label: 'New Label' };
    db.agentPreference.update.mockResolvedValue(updated);

    const result = await setPreference(db, {
      entity: 'order-item',
      field: 'fabric',
      value: 'new-value',
      label: 'New Label',
      priority: 5,
    });

    expect(result).toEqual(updated);
    expect(db.agentPreference.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'pref-1' },
        data: expect.objectContaining({ value: 'new-value', label: 'New Label', priority: 5 }),
      }),
    );
    expect(db.agentPreference.create).not.toHaveBeenCalled();
  });

  it('passes userId to find and create', async () => {
    db.agentPreference.findFirst.mockResolvedValue(null);
    db.agentPreference.create.mockResolvedValue({ id: 'new-1' });

    await setPreference(db, {
      entity: 'order-item',
      field: 'fabric',
      value: 'navy',
      label: 'Navy',
      userId: 'user-42',
      priority: 0,
    });

    expect(db.agentPreference.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ userId: 'user-42' }),
      }),
    );
    expect(db.agentPreference.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ userId: 'user-42' }),
      }),
    );
  });
});

describe('deletePreference', () => {
  let db: ReturnType<typeof createMockDb>;

  beforeEach(() => {
    db = createMockDb();
    vi.restoreAllMocks();
  });

  it('deletes an existing preference', async () => {
    db.agentPreference.findUnique.mockResolvedValue({ id: 'pref-1' });
    db.agentPreference.delete.mockResolvedValue({ id: 'pref-1' });

    const result = await deletePreference(db, 'pref-1');

    expect(result).toEqual({ id: 'pref-1' });
    expect(db.agentPreference.delete).toHaveBeenCalledWith({ where: { id: 'pref-1' } });
  });

  it('throws AGENTKNOW_408 when preference not found', async () => {
    db.agentPreference.findUnique.mockResolvedValue(null);

    await expect(
      deletePreference(db, 'missing-id'),
    ).rejects.toMatchObject({ code: 'AGENTKNOW_408' });
  });

  it('checks findUnique before deleting', async () => {
    db.agentPreference.findUnique.mockResolvedValue(null);

    await expect(deletePreference(db, 'x')).rejects.toBeTruthy();
    expect(db.agentPreference.delete).not.toHaveBeenCalled();
  });
});
