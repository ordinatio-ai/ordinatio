import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createActivity,
  getActivitiesWithSticky,
  resolveActivity,
  getOrderActivities,
  getClientActivities,
} from '../activities';
import type { ActivityDb, ActivityWithRelations } from '../types';

// --- Mock DB factory ---

function createMockDb(): ActivityDb {
  const mockActivityLog = {
    create: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
    findMany: vi.fn().mockResolvedValue([]),
    count: vi.fn().mockResolvedValue(0),
  };

  return {
    activityLog: mockActivityLog,
    $transaction: vi.fn(async (fn) => fn({ activityLog: mockActivityLog } as unknown as ActivityDb)),
  } as unknown as ActivityDb;
}

function makeActivity(overrides: Partial<ActivityWithRelations> = {}): ActivityWithRelations {
  return {
    id: 'act-1',
    action: 'order.created',
    description: 'Order created',
    severity: 'INFO',
    requiresResolution: false,
    resolvedAt: null,
    resolvedBy: null,
    system: false,
    metadata: null,
    createdAt: new Date(),
    orderId: null,
    clientId: null,
    placementAttemptId: null,
    user: null,
    order: null,
    client: null,
    ...overrides,
  };
}

describe('createActivity', () => {
  let db: ActivityDb;

  beforeEach(() => {
    db = createMockDb();
  });

  it('should create an activity with correct data', async () => {
    const activity = makeActivity();
    (db.$transaction as ReturnType<typeof vi.fn>).mockImplementation(async (fn) => {
      const tx = {
        activityLog: {
          create: vi.fn().mockResolvedValue(activity),
          updateMany: vi.fn(),
        },
      };
      return fn(tx as unknown as ActivityDb);
    });

    const result = await createActivity(db, {
      action: 'order.created',
      description: 'Order created',
      userId: 'user-1',
    });

    expect(result).toBe(activity);
  });

  it('should throw for unknown action', async () => {
    await expect(
      createActivity(db, { action: 'unknown.action', description: 'test' })
    ).rejects.toThrow('Unknown activity action: unknown.action');
  });

  it('should auto-resolve sticky items when resolution mapping exists', async () => {
    const activity = makeActivity({ action: 'placement.verified' });
    const updateManyMock = vi.fn();

    (db.$transaction as ReturnType<typeof vi.fn>).mockImplementation(async (fn) => {
      const tx = {
        activityLog: {
          create: vi.fn().mockResolvedValue(activity),
          updateMany: updateManyMock,
        },
      };
      return fn(tx as unknown as ActivityDb);
    });

    await createActivity(db, {
      action: 'placement.verified',
      description: 'Verified',
      orderId: 'order-1',
    });

    expect(updateManyMock).toHaveBeenCalledWith({
      where: expect.objectContaining({
        action: { in: ['placement.awaiting_verification'] },
        requiresResolution: true,
        resolvedAt: null,
        orderId: 'order-1',
      }),
      data: expect.objectContaining({
        resolvedAt: expect.any(Date),
        resolvedBy: 'system',
      }),
    });
  });

  it('should not call updateMany when no resolution mapping exists', async () => {
    const activity = makeActivity();
    const updateManyMock = vi.fn();

    (db.$transaction as ReturnType<typeof vi.fn>).mockImplementation(async (fn) => {
      const tx = {
        activityLog: {
          create: vi.fn().mockResolvedValue(activity),
          updateMany: updateManyMock,
        },
      };
      return fn(tx as unknown as ActivityDb);
    });

    await createActivity(db, {
      action: 'order.created',
      description: 'Order created',
    });

    expect(updateManyMock).not.toHaveBeenCalled();
  });

  it('should call onActivityCreated callback', async () => {
    const activity = makeActivity();
    (db.$transaction as ReturnType<typeof vi.fn>).mockImplementation(async (fn) => {
      const tx = {
        activityLog: {
          create: vi.fn().mockResolvedValue(activity),
          updateMany: vi.fn(),
        },
      };
      return fn(tx as unknown as ActivityDb);
    });

    const onCreated = vi.fn();
    await createActivity(db, {
      action: 'order.created',
      description: 'test',
    }, { onActivityCreated: onCreated });

    expect(onCreated).toHaveBeenCalledWith(activity);
  });

  it('should use system as resolvedBy when no userId', async () => {
    const activity = makeActivity({ action: 'placement.completed' });
    const updateManyMock = vi.fn();

    (db.$transaction as ReturnType<typeof vi.fn>).mockImplementation(async (fn) => {
      const tx = {
        activityLog: {
          create: vi.fn().mockResolvedValue(activity),
          updateMany: updateManyMock,
        },
      };
      return fn(tx as unknown as ActivityDb);
    });

    await createActivity(db, {
      action: 'placement.completed',
      description: 'Completed',
    });

    expect(updateManyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ resolvedBy: 'system' }),
      })
    );
  });

  it('should scope resolution to orderId when provided', async () => {
    const activity = makeActivity({ action: 'placement.verified' });
    const updateManyMock = vi.fn();

    (db.$transaction as ReturnType<typeof vi.fn>).mockImplementation(async (fn) => {
      const tx = {
        activityLog: {
          create: vi.fn().mockResolvedValue(activity),
          updateMany: updateManyMock,
        },
      };
      return fn(tx as unknown as ActivityDb);
    });

    await createActivity(db, {
      action: 'placement.verified',
      description: 'Verified',
      orderId: 'order-123',
    });

    expect(updateManyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ orderId: 'order-123' }),
      })
    );
  });

  it('should default system to false', async () => {
    const createMock = vi.fn().mockResolvedValue(makeActivity());

    (db.$transaction as ReturnType<typeof vi.fn>).mockImplementation(async (fn) => {
      const tx = {
        activityLog: { create: createMock, updateMany: vi.fn() },
      };
      return fn(tx as unknown as ActivityDb);
    });

    await createActivity(db, {
      action: 'order.created',
      description: 'test',
    });

    expect(createMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ system: false }),
      })
    );
  });
});

describe('getActivitiesWithSticky', () => {
  let db: ActivityDb;

  beforeEach(() => {
    db = createMockDb();
  });

  it('should return sticky and recent activities separately', async () => {
    const sticky = [makeActivity({ requiresResolution: true })];
    const recent = [makeActivity({ id: 'act-2' })];

    (db.activityLog.findMany as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(sticky)
      .mockResolvedValueOnce(recent);
    (db.activityLog.count as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(5);

    const result = await getActivitiesWithSticky(db);

    expect(result.stickyItems).toEqual(sticky);
    expect(result.recentActivities).toEqual(recent);
    expect(result.stickyCount).toBe(1);
    expect(result.totalRecent).toBe(5);
  });

  it('should filter by orderId when provided', async () => {
    await getActivitiesWithSticky(db, { orderId: 'order-1' });

    expect(db.activityLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ orderId: 'order-1' }),
      })
    );
  });

  it('should filter by clientId when provided', async () => {
    await getActivitiesWithSticky(db, { clientId: 'client-1' });

    expect(db.activityLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ clientId: 'client-1' }),
      })
    );
  });

  it('should exclude admin activities when requested', async () => {
    await getActivitiesWithSticky(db, { excludeAdminActivities: true });

    expect(db.activityLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          action: { notIn: expect.arrayContaining(['email.account_connected']) },
        }),
      })
    );
  });

  it('should respect limit and offset', async () => {
    await getActivitiesWithSticky(db, { limit: 50, offset: 10 });

    // The recent activities query (second call) should have take/skip
    const calls = (db.activityLog.findMany as ReturnType<typeof vi.fn>).mock.calls;
    const recentCall = calls[1]?.[0];
    expect(recentCall?.take).toBe(50);
    expect(recentCall?.skip).toBe(10);
  });

  it('should default limit to 20 and offset to 0', async () => {
    await getActivitiesWithSticky(db);

    const calls = (db.activityLog.findMany as ReturnType<typeof vi.fn>).mock.calls;
    const recentCall = calls[1]?.[0];
    expect(recentCall?.take).toBe(20);
    expect(recentCall?.skip).toBe(0);
  });
});

describe('resolveActivity', () => {
  let db: ActivityDb;

  beforeEach(() => {
    db = createMockDb();
  });

  it('should resolve an activity by setting resolvedAt and resolvedBy', async () => {
    const resolved = makeActivity({ resolvedAt: new Date(), resolvedBy: 'user-1' });
    (db.activityLog.update as ReturnType<typeof vi.fn>).mockResolvedValue(resolved);

    const result = await resolveActivity(db, 'act-1', 'user-1');

    expect(db.activityLog.update).toHaveBeenCalledWith({
      where: { id: 'act-1' },
      data: expect.objectContaining({
        resolvedAt: expect.any(Date),
        resolvedBy: 'user-1',
      }),
      include: expect.any(Object),
    });
    expect(result).toBe(resolved);
  });

  it('should call onActivityResolved callback', async () => {
    const resolved = makeActivity({ resolvedAt: new Date() });
    (db.activityLog.update as ReturnType<typeof vi.fn>).mockResolvedValue(resolved);

    const onResolved = vi.fn();
    await resolveActivity(db, 'act-1', 'user-1', { onActivityResolved: onResolved });

    expect(onResolved).toHaveBeenCalledWith(resolved);
  });
});

describe('getOrderActivities', () => {
  it('should query activities by orderId', async () => {
    const db = createMockDb();
    await getOrderActivities(db, 'order-1');

    expect(db.activityLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { orderId: 'order-1' },
        take: 10,
      })
    );
  });

  it('should accept custom limit', async () => {
    const db = createMockDb();
    await getOrderActivities(db, 'order-1', 25);

    expect(db.activityLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 25 })
    );
  });
});

describe('getClientActivities', () => {
  it('should query activities by clientId', async () => {
    const db = createMockDb();
    await getClientActivities(db, 'client-1');

    expect(db.activityLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { clientId: 'client-1' },
        take: 10,
      })
    );
  });
});
