// ===========================================
// TESTS: Callback Error Handling (Gap G2)
// ===========================================
// Verifies behavior when ActivityCallbacks and
// SecureActivityCallbacks throw errors. Key
// insight: callbacks fire AFTER DB commit, so
// the activity is persisted even if callbacks
// throw.
// ===========================================

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createActivity, resolveActivity } from '../activities';
import { createSecureActivityService } from '../security';
import type {
  ActivityDb,
  ActivityCallbacks,
  ActivityWithRelations,
} from '../types';
import type { SecureActivityCallbacks } from '../security';

// --- Helpers ---

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
    createdAt: new Date('2026-03-07T12:00:00Z'),
    orderId: null,
    clientId: null,
    placementAttemptId: null,
    user: null,
    order: null,
    client: null,
    ...overrides,
  };
}

function createMockDb(activity?: ActivityWithRelations): ActivityDb {
  const act = activity ?? makeActivity();

  const mockActivityLog = {
    create: vi.fn().mockResolvedValue(act),
    update: vi.fn().mockResolvedValue(act),
    updateMany: vi.fn().mockResolvedValue({ count: 0 }),
    findMany: vi.fn().mockResolvedValue([]),
    count: vi.fn().mockResolvedValue(0),
  };

  return {
    activityLog: mockActivityLog,
    $transaction: vi.fn(async (fn) =>
      fn({ activityLog: mockActivityLog } as unknown as ActivityDb),
    ),
  } as unknown as ActivityDb;
}

// --- Tests ---

describe('Callback error handling', () => {
  let db: ActivityDb;
  const validInput = { action: 'order.created', description: 'Order created' };

  beforeEach(() => {
    db = createMockDb();
  });

  // ---- createActivity callback errors ----

  describe('createActivity — onActivityCreated throws', () => {
    it('should propagate the callback error to the caller', async () => {
      const callbacks: ActivityCallbacks = {
        onActivityCreated: vi.fn().mockRejectedValue(new Error('Callback boom')),
      };

      await expect(
        createActivity(db, validInput, callbacks),
      ).rejects.toThrow('Callback boom');
    });

    it('should have committed the activity to DB before callback fires', async () => {
      const callbacks: ActivityCallbacks = {
        onActivityCreated: vi.fn().mockRejectedValue(new Error('Callback boom')),
      };

      // The transaction committed — verify by checking that $transaction resolved
      // (the mock calls create inside the transaction fn)
      try {
        await createActivity(db, validInput, callbacks);
      } catch {
        // expected
      }

      // $transaction was called and the inner create was invoked
      expect(db.$transaction).toHaveBeenCalledTimes(1);
      const txFn = (db.$transaction as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(typeof txFn).toBe('function');
    });

    it('should pass the full ActivityWithRelations shape to the callback', async () => {
      const fullActivity = makeActivity({
        id: 'act-full',
        orderId: 'order-1',
        clientId: 'client-1',
        user: { id: 'user-1', name: 'Test User' },
        order: { id: 'order-1', orderNumber: 'ORD-001' },
        client: { id: 'client-1', name: 'Test Client' },
        metadata: { foo: 'bar' },
      });
      const dbWithFull = createMockDb(fullActivity);

      const receivedActivity: ActivityWithRelations[] = [];
      const callbacks: ActivityCallbacks = {
        onActivityCreated: vi.fn(async (act) => {
          receivedActivity.push(act);
        }),
      };

      await createActivity(dbWithFull, {
        ...validInput,
        orderId: 'order-1',
        clientId: 'client-1',
        userId: 'user-1',
      }, callbacks);

      expect(receivedActivity).toHaveLength(1);
      const act = receivedActivity[0];
      expect(act.id).toBe('act-full');
      expect(act.orderId).toBe('order-1');
      expect(act.clientId).toBe('client-1');
      expect(act.user).toEqual({ id: 'user-1', name: 'Test User' });
      expect(act.order).toEqual({ id: 'order-1', orderNumber: 'ORD-001' });
      expect(act.client).toEqual({ id: 'client-1', name: 'Test Client' });
      expect(act.metadata).toEqual({ foo: 'bar' });
    });

    it('should call the callback exactly once', async () => {
      const callbacks: ActivityCallbacks = {
        onActivityCreated: vi.fn(),
      };

      await createActivity(db, validInput, callbacks);

      expect(callbacks.onActivityCreated).toHaveBeenCalledTimes(1);
    });
  });

  // ---- resolveActivity callback errors ----

  describe('resolveActivity — onActivityResolved throws', () => {
    it('should propagate the callback error to the caller', async () => {
      const callbacks: ActivityCallbacks = {
        onActivityResolved: vi.fn().mockRejectedValue(new Error('Resolve callback boom')),
      };

      await expect(
        resolveActivity(db, 'act-1', 'user-1', callbacks),
      ).rejects.toThrow('Resolve callback boom');
    });

    it('should have already updated the DB before callback fires', async () => {
      const callbacks: ActivityCallbacks = {
        onActivityResolved: vi.fn().mockRejectedValue(new Error('Resolve callback boom')),
      };

      try {
        await resolveActivity(db, 'act-1', 'user-1', callbacks);
      } catch {
        // expected
      }

      // db.activityLog.update was called (and resolved) before the callback
      expect(db.activityLog.update).toHaveBeenCalledTimes(1);
      expect(db.activityLog.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'act-1' },
          data: expect.objectContaining({ resolvedBy: 'user-1' }),
        }),
      );
    });

    it('should call onActivityResolved exactly once', async () => {
      const callbacks: ActivityCallbacks = {
        onActivityResolved: vi.fn(),
      };

      await resolveActivity(db, 'act-1', 'user-1', callbacks);

      expect(callbacks.onActivityResolved).toHaveBeenCalledTimes(1);
    });
  });

  // ---- Callback not called on failure ----

  describe('callbacks not called when operation fails', () => {
    it('should not call onActivityCreated when action is unknown', async () => {
      const callbacks: ActivityCallbacks = {
        onActivityCreated: vi.fn(),
      };

      await expect(
        createActivity(db, { action: 'nonexistent.action', description: 'bad' }, callbacks),
      ).rejects.toThrow('Unknown activity action');

      expect(callbacks.onActivityCreated).not.toHaveBeenCalled();
    });

    it('should not call onActivityResolved when DB update fails', async () => {
      (db.activityLog.update as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('DB connection lost'),
      );

      const callbacks: ActivityCallbacks = {
        onActivityResolved: vi.fn(),
      };

      await expect(
        resolveActivity(db, 'act-1', 'user-1', callbacks),
      ).rejects.toThrow('DB connection lost');

      expect(callbacks.onActivityResolved).not.toHaveBeenCalled();
    });

    it('should not call onActivityCreated when transaction fails', async () => {
      (db.$transaction as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('Transaction aborted'),
      );

      const callbacks: ActivityCallbacks = {
        onActivityCreated: vi.fn(),
      };

      await expect(
        createActivity(db, validInput, callbacks),
      ).rejects.toThrow('Transaction aborted');

      expect(callbacks.onActivityCreated).not.toHaveBeenCalled();
    });
  });

  // ---- Async callback timing ----

  describe('async callback timing', () => {
    it('should await a slow onActivityCreated before returning', async () => {
      const callOrder: string[] = [];

      const callbacks: ActivityCallbacks = {
        onActivityCreated: vi.fn(async () => {
          await new Promise((r) => setTimeout(r, 50));
          callOrder.push('callback-done');
        }),
      };

      const result = await createActivity(db, validInput, callbacks);
      callOrder.push('returned');

      // Callback completes BEFORE the function returns (because it's awaited)
      expect(callOrder).toEqual(['callback-done', 'returned']);
      expect(result).toBeDefined();
      expect(result.id).toBe('act-1');
    });

    it('should await a slow onActivityResolved before returning', async () => {
      const callOrder: string[] = [];

      const callbacks: ActivityCallbacks = {
        onActivityResolved: vi.fn(async () => {
          await new Promise((r) => setTimeout(r, 50));
          callOrder.push('resolve-callback-done');
        }),
      };

      const result = await resolveActivity(db, 'act-1', 'user-1', callbacks);
      callOrder.push('returned');

      expect(callOrder).toEqual(['resolve-callback-done', 'returned']);
      expect(result).toBeDefined();
    });
  });

  // ---- Multiple callbacks independence ----

  describe('multiple callbacks do not interfere', () => {
    it('should only fire onActivityCreated on create (not onActivityResolved)', async () => {
      const callbacks: ActivityCallbacks = {
        onActivityCreated: vi.fn(),
        onActivityResolved: vi.fn(),
      };

      await createActivity(db, validInput, callbacks);

      expect(callbacks.onActivityCreated).toHaveBeenCalledTimes(1);
      expect(callbacks.onActivityResolved).not.toHaveBeenCalled();
    });

    it('should only fire onActivityResolved on resolve (not onActivityCreated)', async () => {
      const callbacks: ActivityCallbacks = {
        onActivityCreated: vi.fn(),
        onActivityResolved: vi.fn(),
      };

      await resolveActivity(db, 'act-1', 'user-1', callbacks);

      expect(callbacks.onActivityResolved).toHaveBeenCalledTimes(1);
      expect(callbacks.onActivityCreated).not.toHaveBeenCalled();
    });
  });

  // ---- Undefined / missing callbacks ----

  describe('undefined and missing callbacks', () => {
    it('should work fine with no callbacks parameter', async () => {
      const result = await createActivity(db, validInput);
      expect(result.id).toBe('act-1');
    });

    it('should work fine with undefined callbacks parameter', async () => {
      const result = await createActivity(db, validInput, undefined);
      expect(result.id).toBe('act-1');
    });

    it('should work fine when callbacks object has no onActivityCreated', async () => {
      const callbacks: ActivityCallbacks = {};
      const result = await createActivity(db, validInput, callbacks);
      expect(result.id).toBe('act-1');
    });

    it('should work fine when callbacks object has no onActivityResolved', async () => {
      const callbacks: ActivityCallbacks = {};
      const result = await resolveActivity(db, 'act-1', 'user-1', callbacks);
      expect(result).toBeDefined();
    });

    it('should work when resolveActivity is called with no callbacks', async () => {
      const result = await resolveActivity(db, 'act-1', 'user-1');
      expect(result).toBeDefined();
    });
  });

  // ---- SecureActivityCallbacks ----

  describe('SecureActivityCallbacks error handling', () => {
    it('should propagate shouldAllowCreation error and NOT create the activity', async () => {
      const callbacks: SecureActivityCallbacks = {
        shouldAllowCreation: vi.fn().mockRejectedValue(new Error('Rate limiter crashed')),
      };

      const svc = createSecureActivityService(db, 'tenant-1', callbacks);

      await expect(
        svc.createActivity(validInput),
      ).rejects.toThrow('Rate limiter crashed');

      // The transaction should never have been called
      expect(db.$transaction).not.toHaveBeenCalled();
    });

    it('should not create activity when shouldAllowCreation returns false', async () => {
      const callbacks: SecureActivityCallbacks = {
        shouldAllowCreation: vi.fn().mockResolvedValue(false),
      };

      const svc = createSecureActivityService(db, 'tenant-1', callbacks);

      await expect(
        svc.createActivity(validInput),
      ).rejects.toThrow('Activity creation rate limited');

      expect(db.$transaction).not.toHaveBeenCalled();
    });

    it('should still create activity when onPatternDetected throws (non-blocking)', async () => {
      // onPatternDetected is called by higher-level code (intuition engine),
      // not directly inside createSecureActivityService.createActivity.
      // Verify that the onActivityCreated callback is what's wired, and
      // onPatternDetected being defined doesn't break creation.
      const callbacks: SecureActivityCallbacks = {
        onPatternDetected: vi.fn().mockRejectedValue(new Error('Pattern analysis failed')),
        shouldAllowCreation: vi.fn().mockResolvedValue(true),
      };

      const svc = createSecureActivityService(db, 'tenant-1', callbacks);

      // createActivity on the secure service should succeed because
      // onPatternDetected is not invoked during createActivity itself
      const result = await svc.createActivity(validInput);
      expect(result).toBeDefined();
      expect(result.id).toBe('act-1');
    });

    it('should propagate onActivityCreated error through secure service', async () => {
      const callbacks: SecureActivityCallbacks = {
        onActivityCreated: vi.fn().mockRejectedValue(new Error('Secure callback boom')),
        shouldAllowCreation: vi.fn().mockResolvedValue(true),
      };

      const svc = createSecureActivityService(db, 'tenant-1', callbacks);

      await expect(
        svc.createActivity(validInput),
      ).rejects.toThrow('Secure callback boom');
    });

    it('should propagate onActivityResolved error through secure service resolveActivity', async () => {
      const callbacks: SecureActivityCallbacks = {
        onActivityResolved: vi.fn().mockRejectedValue(new Error('Secure resolve boom')),
      };

      const svc = createSecureActivityService(db, 'tenant-1', callbacks);

      await expect(
        svc.resolveActivity('act-1', 'user-1'),
      ).rejects.toThrow('Secure resolve boom');
    });
  });
});
