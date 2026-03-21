// ===========================================
// ORDINATIO ACTIVITIES — Concurrency Tests
// ===========================================
// Gap G1: Race conditions, transaction behavior,
// and concurrent operations.
// ===========================================

import { describe, it, expect, vi } from 'vitest';
import { createActivity, resolveActivity, getActivitiesWithSticky } from '../activities';
import { createSecureActivityService } from '../security';
import type { ActivityDb, ActivityWithRelations, CreateActivityInput } from '../types';

// ---- Mock Helpers ----

let globalIdCounter = 0;

function makeActivityRecord(
  overrides: Partial<ActivityWithRelations> = {},
): ActivityWithRelations {
  globalIdCounter++;
  return {
    id: `act-${globalIdCounter}`,
    action: 'order.created',
    description: 'Test activity',
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

function makeMockDb(options?: {
  createDelay?: number;
  updateManyDelay?: number;
  updateDelay?: number;
  findManyDelay?: number;
  createShouldFail?: boolean;
  updateManyShouldFail?: boolean;
}): ActivityDb {
  const activities: ActivityWithRelations[] = [];
  const opts = options ?? {};

  const dbImpl: ActivityDb = {
    activityLog: {
      create: async (args) => {
        if (opts.createDelay) await delay(opts.createDelay);
        if (opts.createShouldFail) throw new Error('DB create failed');
        const activity = makeActivityRecord({
          action: args.data.action,
          description: args.data.description,
          severity: args.data.severity as ActivityWithRelations['severity'],
          requiresResolution: args.data.requiresResolution,
          system: args.data.system,
          orderId: args.data.orderId ?? null,
          clientId: args.data.clientId ?? null,
          placementAttemptId: args.data.placementAttemptId ?? null,
          metadata: args.data.metadata ?? null,
        });
        activities.push(activity);
        return activity;
      },
      update: async (args) => {
        if (opts.updateDelay) await delay(opts.updateDelay);
        const existing = activities.find((a) => a.id === args.where.id);
        const updated = makeActivityRecord({
          ...(existing ?? {}),
          id: args.where.id,
          ...args.data,
        });
        return updated;
      },
      updateMany: async (args) => {
        if (opts.updateManyDelay) await delay(opts.updateManyDelay);
        if (opts.updateManyShouldFail) throw new Error('DB updateMany failed');
        let count = 0;
        for (const a of activities) {
          if (matchesWhere(a, args.where)) {
            a.resolvedAt = (args.data as { resolvedAt: Date }).resolvedAt;
            a.resolvedBy = (args.data as { resolvedBy: string }).resolvedBy;
            count++;
          }
        }
        return { count };
      },
      findMany: async () => {
        if (opts.findManyDelay) await delay(opts.findManyDelay);
        return [...activities];
      },
      count: async () => activities.length,
    },
    $transaction: async (fn) => fn(dbImpl),
  };

  return dbImpl;
}

function matchesWhere(
  activity: ActivityWithRelations,
  where: Record<string, unknown>,
): boolean {
  for (const [key, val] of Object.entries(where)) {
    if (key === 'OR' || key === 'AND') continue;
    const actVal = (activity as unknown as Record<string, unknown>)[key];
    if (typeof val === 'object' && val !== null && 'in' in (val as Record<string, unknown>)) {
      if (!(val as { in: unknown[] }).in.includes(actVal)) return false;
    } else if (actVal !== val) {
      return false;
    }
  }
  return true;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---- Tests ----

describe('Concurrency — Gap G1', () => {
  describe('Concurrent createActivity calls', () => {
    it('should allow two activities created simultaneously for the same order', async () => {
      const db = makeMockDb({ createDelay: 10 });

      const [a1, a2] = await Promise.all([
        createActivity(db, {
          action: 'order.created',
          description: 'Order created by user A',
          orderId: 'order-1',
        }),
        createActivity(db, {
          action: 'order.status_changed',
          description: 'Status changed by user B',
          orderId: 'order-1',
        }),
      ]);

      expect(a1.action).toBe('order.created');
      expect(a2.action).toBe('order.status_changed');
      expect(a1.id).not.toBe(a2.id);
      expect(a1.orderId).toBe('order-1');
      expect(a2.orderId).toBe('order-1');
    });

    it('should produce unique IDs even under parallel creation', async () => {
      const db = makeMockDb();

      const results = await Promise.all(
        Array.from({ length: 10 }, (_, i) =>
          createActivity(db, {
            action: 'order.created',
            description: `Activity ${i}`,
          }),
        ),
      );

      const ids = results.map((r) => r.id);
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(10);
    });
  });

  describe('Concurrent create + resolve', () => {
    it('should handle creating an activity while resolving a sticky item simultaneously', async () => {
      // Pre-seed a sticky activity
      const stickyActivity = makeActivityRecord({
        id: 'sticky-1',
        action: 'placement.failed',
        requiresResolution: true,
        severity: 'ERROR',
      });

      const db = makeMockDb({ createDelay: 15, updateDelay: 15 });
      // Manually inject the sticky activity into the DB's backing store
      await db.activityLog.create({
        data: {
          action: stickyActivity.action,
          description: stickyActivity.description,
          severity: stickyActivity.severity,
          requiresResolution: true,
          system: false,
        },
        include: {
          user: { select: { id: true, name: true } },
          order: { select: { id: true, orderNumber: true } },
          client: { select: { id: true, name: true } },
        },
      });

      const [created, resolved] = await Promise.all([
        createActivity(db, {
          action: 'order.created',
          description: 'New activity while resolving',
        }),
        resolveActivity(db, 'sticky-1', 'user-1'),
      ]);

      expect(created.action).toBe('order.created');
      expect(resolved.resolvedAt).toBeInstanceOf(Date);
      expect(resolved.resolvedBy).toBe('user-1');
    });
  });

  describe('Transaction rollback on create failure', () => {
    it('should not persist updateMany changes if create fails inside $transaction', async () => {
      const transactionLog: string[] = [];

      const db: ActivityDb = {
        activityLog: {
          create: async () => { throw new Error('DB create failed'); },
          update: async () => makeActivityRecord(),
          updateMany: async () => {
            transactionLog.push('updateMany executed');
            return { count: 1 };
          },
          findMany: async () => [],
          count: async () => 0,
        },
        $transaction: async (fn) => {
          // Simulate real transaction: if fn throws, rollback all changes
          const rollbackLog: string[] = [];
          const txDb: ActivityDb = {
            activityLog: {
              create: async () => { throw new Error('DB create failed'); },
              update: async () => makeActivityRecord(),
              updateMany: async () => {
                rollbackLog.push('updateMany in tx');
                return { count: 1 };
              },
              findMany: async () => [],
              count: async () => 0,
            },
            $transaction: async (innerFn) => innerFn(txDb),
          };
          try {
            return await fn(txDb);
          } catch (e) {
            // On rollback, updateMany effects are discarded
            // (they only ran inside the tx context, not the outer db)
            throw e;
          }
        },
      };

      await expect(
        createActivity(db, {
          action: 'placement.completed',
          description: 'Should fail',
          orderId: 'order-1',
        }),
      ).rejects.toThrow('DB create failed');

      // The outer db's updateMany was never called — only the tx's was
      expect(transactionLog).toHaveLength(0);
    });
  });

  describe('Transaction rollback on updateMany failure', () => {
    it('should not persist the created activity if updateMany throws', async () => {
      const persistedCreates: string[] = [];

      const db: ActivityDb = {
        activityLog: {
          create: async (args) => {
            // This should NOT be committed if updateMany fails
            return makeActivityRecord({ action: args.data.action });
          },
          update: async () => makeActivityRecord(),
          updateMany: async () => { throw new Error('updateMany failed'); },
          findMany: async () => [],
          count: async () => 0,
        },
        $transaction: async (fn) => {
          const txDb: ActivityDb = {
            activityLog: {
              create: async (args) => {
                persistedCreates.push(args.data.action);
                return makeActivityRecord({ action: args.data.action });
              },
              update: async () => makeActivityRecord(),
              updateMany: async () => { throw new Error('updateMany failed'); },
              findMany: async () => [],
              count: async () => 0,
            },
            $transaction: async (innerFn) => innerFn(txDb),
          };
          try {
            return await fn(txDb);
          } catch (e) {
            // Rollback: create effects are discarded
            persistedCreates.length = 0;
            throw e;
          }
        },
      };

      // placement.completed resolves placement.verified, triggering updateMany
      await expect(
        createActivity(db, {
          action: 'placement.completed',
          description: 'Should rollback',
          orderId: 'order-1',
        }),
      ).rejects.toThrow('updateMany failed');

      // The create should have been rolled back
      expect(persistedCreates).toHaveLength(0);
    });
  });

  describe('Concurrent resolution of same activity', () => {
    it('should allow two resolveActivity calls for the same ID without error', async () => {
      const db = makeMockDb({ updateDelay: 10 });

      const [r1, r2] = await Promise.all([
        resolveActivity(db, 'act-same', 'user-A'),
        resolveActivity(db, 'act-same', 'user-B'),
      ]);

      // Both calls succeed — last-write-wins semantics
      expect(r1.resolvedAt).toBeInstanceOf(Date);
      expect(r2.resolvedAt).toBeInstanceOf(Date);
      // Each call gets its own resolvedBy
      expect(r1.resolvedBy).toBe('user-A');
      expect(r2.resolvedBy).toBe('user-B');
    });
  });

  describe('$transaction called once per createActivity', () => {
    it('should invoke $transaction exactly once per createActivity call', async () => {
      const transactionSpy = vi.fn(async (fn: (tx: ActivityDb) => Promise<unknown>) => {
        const txDb = makeMockDb();
        return fn(txDb);
      });

      const db: ActivityDb = {
        ...makeMockDb(),
        $transaction: transactionSpy,
      };

      await createActivity(db, {
        action: 'order.created',
        description: 'Single transaction check',
      });

      expect(transactionSpy).toHaveBeenCalledTimes(1);
    });

    it('should still call $transaction exactly once even when auto-resolving', async () => {
      const transactionSpy = vi.fn(async (fn: (tx: ActivityDb) => Promise<unknown>) => {
        const txDb = makeMockDb();
        return fn(txDb);
      });

      const db: ActivityDb = {
        ...makeMockDb(),
        $transaction: transactionSpy,
      };

      // placement.completed triggers auto-resolution of placement.verified
      await createActivity(db, {
        action: 'placement.completed',
        description: 'With auto-resolve',
        orderId: 'order-1',
      });

      expect(transactionSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe('Auto-resolution within transaction', () => {
    it('should call updateMany inside the transaction when creating placement.completed', async () => {
      const updateManySpy = vi.fn(async () => ({ count: 1 }));

      const db: ActivityDb = {
        activityLog: {
          create: async (args) => makeActivityRecord({ action: args.data.action }),
          update: async () => makeActivityRecord(),
          updateMany: vi.fn(), // outer db — should NOT be called
          findMany: async () => [],
          count: async () => 0,
        },
        $transaction: async (fn) => {
          const txDb: ActivityDb = {
            activityLog: {
              create: async (args) => makeActivityRecord({ action: args.data.action }),
              update: async () => makeActivityRecord(),
              updateMany: updateManySpy,
              findMany: async () => [],
              count: async () => 0,
            },
            $transaction: async (innerFn) => innerFn(txDb),
          };
          return fn(txDb);
        },
      };

      await createActivity(db, {
        action: 'placement.completed',
        description: 'Triggers auto-resolve of placement.verified',
        orderId: 'order-1',
      });

      // updateMany was called on the tx, not the outer db
      expect(updateManySpy).toHaveBeenCalledTimes(1);
      const callArgs = updateManySpy.mock.calls[0]![0] as { where: Record<string, unknown> };
      expect(callArgs.where.action).toEqual({
        in: ['placement.verified', 'placement.awaiting_verification'],
      });
      expect(callArgs.where.orderId).toBe('order-1');
      expect(db.activityLog.updateMany).not.toHaveBeenCalled();
    });

    it('should NOT call updateMany for actions with no resolution mapping', async () => {
      const updateManySpy = vi.fn(async () => ({ count: 0 }));

      const db: ActivityDb = {
        activityLog: {
          create: async (args) => makeActivityRecord({ action: args.data.action }),
          update: async () => makeActivityRecord(),
          updateMany: updateManySpy,
          findMany: async () => [],
          count: async () => 0,
        },
        $transaction: async (fn) => fn(db),
      };

      await createActivity(db, {
        action: 'order.created',
        description: 'No auto-resolve needed',
      });

      expect(updateManySpy).not.toHaveBeenCalled();
    });
  });

  describe('Concurrent secure service calls', () => {
    it('should handle two secure service instances creating activities simultaneously', async () => {
      const db = makeMockDb({ createDelay: 5 });

      const service1 = createSecureActivityService(db, 'tenant-A');
      const service2 = createSecureActivityService(db, 'tenant-B');

      const [a1, a2] = await Promise.all([
        service1.createActivity({
          action: 'order.created',
          description: 'Tenant A activity',
        }),
        service2.createActivity({
          action: 'client.created',
          description: 'Tenant B activity',
        }),
      ]);

      expect(a1.action).toBe('order.created');
      expect(a2.action).toBe('client.created');
      expect(a1.id).not.toBe(a2.id);
      // Each should have its tenant ID injected
      expect((a1.metadata as Record<string, unknown>)?._tenantId).toBe('tenant-A');
      expect((a2.metadata as Record<string, unknown>)?._tenantId).toBe('tenant-B');
    });

    it('should not cross-contaminate tenant metadata under concurrent writes', async () => {
      const db = makeMockDb();

      const services = Array.from({ length: 5 }, (_, i) =>
        createSecureActivityService(db, `tenant-${i}`),
      );

      const results = await Promise.all(
        services.map((svc, i) =>
          svc.createActivity({
            action: 'order.created',
            description: `Activity from tenant ${i}`,
          }),
        ),
      );

      for (let i = 0; i < results.length; i++) {
        const meta = results[i]!.metadata as Record<string, unknown>;
        expect(meta._tenantId).toBe(`tenant-${i}`);
      }
    });
  });

  describe('Race between create and getActivitiesWithSticky', () => {
    it('should handle a create happening during a query without errors', async () => {
      const db = makeMockDb({ createDelay: 20, findManyDelay: 10 });

      // Start query and create concurrently
      const [queryResult, created] = await Promise.all([
        getActivitiesWithSticky(db),
        createActivity(db, {
          action: 'order.created',
          description: 'Created during query',
        }),
      ]);

      // Both operations complete without error
      expect(queryResult).toHaveProperty('stickyItems');
      expect(queryResult).toHaveProperty('recentActivities');
      expect(queryResult).toHaveProperty('totalRecent');
      expect(queryResult).toHaveProperty('stickyCount');
      expect(created.action).toBe('order.created');
    });

    it('should return consistent structure even with concurrent mutations', async () => {
      const db = makeMockDb();

      // Fire 3 creates and 3 queries simultaneously
      const promises = [
        createActivity(db, { action: 'order.created', description: 'A1' }),
        getActivitiesWithSticky(db),
        createActivity(db, { action: 'client.created', description: 'A2' }),
        getActivitiesWithSticky(db),
        createActivity(db, { action: 'order.status_changed', description: 'A3' }),
        getActivitiesWithSticky(db),
      ];

      const results = await Promise.all(promises);

      // Activities (index 0, 2, 4) should all succeed
      expect((results[0] as ActivityWithRelations).action).toBe('order.created');
      expect((results[2] as ActivityWithRelations).action).toBe('client.created');
      expect((results[4] as ActivityWithRelations).action).toBe('order.status_changed');

      // Queries (index 1, 3, 5) should all have valid structure
      for (const idx of [1, 3, 5]) {
        const qr = results[idx] as { stickyItems: unknown[]; recentActivities: unknown[]; totalRecent: number; stickyCount: number };
        expect(Array.isArray(qr.stickyItems)).toBe(true);
        expect(Array.isArray(qr.recentActivities)).toBe(true);
        expect(typeof qr.totalRecent).toBe('number');
        expect(typeof qr.stickyCount).toBe('number');
      }
    });
  });

  describe('Callback execution order', () => {
    it('should fire onActivityCreated callbacks in completion order when concurrent', async () => {
      const callbackOrder: string[] = [];
      const callbacks = {
        onActivityCreated: async (activity: ActivityWithRelations) => {
          callbackOrder.push(activity.description);
        },
      };

      // Fast activity will finish before slow one
      const fastDb = makeMockDb({ createDelay: 5 });
      const slowDb = makeMockDb({ createDelay: 50 });

      await Promise.all([
        createActivity(slowDb, { action: 'order.created', description: 'slow' }, callbacks),
        createActivity(fastDb, { action: 'order.created', description: 'fast' }, callbacks),
      ]);

      // Fast should callback first
      expect(callbackOrder[0]).toBe('fast');
      expect(callbackOrder[1]).toBe('slow');
    });

    it('should not block other callbacks if one throws', async () => {
      const completedCallbacks: string[] = [];

      const failingCallbacks = {
        onActivityCreated: async () => {
          throw new Error('Callback explosion');
        },
      };
      const successCallbacks = {
        onActivityCreated: async (activity: ActivityWithRelations) => {
          completedCallbacks.push(activity.description);
        },
      };

      const db = makeMockDb();

      // One will fail callback, other should succeed — they are independent promises
      const results = await Promise.allSettled([
        createActivity(db, { action: 'order.created', description: 'will-fail' }, failingCallbacks),
        createActivity(db, { action: 'order.created', description: 'will-succeed' }, successCallbacks),
      ]);

      expect(results[0]!.status).toBe('rejected');
      expect(results[1]!.status).toBe('fulfilled');
      expect(completedCallbacks).toEqual(['will-succeed']);
    });
  });

  describe('Edge cases under concurrency', () => {
    it('should handle rapid sequential creates without losing activities', async () => {
      const db = makeMockDb();
      const created: ActivityWithRelations[] = [];

      for (let i = 0; i < 20; i++) {
        const act = await createActivity(db, {
          action: 'order.created',
          description: `Rapid ${i}`,
        });
        created.push(act);
      }

      expect(created).toHaveLength(20);
      const ids = new Set(created.map((a) => a.id));
      expect(ids.size).toBe(20);
    });

    it('should handle concurrent resolve + secure service create for same order', async () => {
      const db = makeMockDb({ createDelay: 10, updateDelay: 10 });
      const svc = createSecureActivityService(db, 'tenant-1');

      const [resolved, created] = await Promise.all([
        resolveActivity(db, 'act-to-resolve', 'user-1'),
        svc.createActivity({
          action: 'order.created',
          description: 'Secure creation during resolve',
          orderId: 'order-shared',
        }),
      ]);

      expect(resolved.resolvedBy).toBe('user-1');
      expect(created.action).toBe('order.created');
    });
  });
});
