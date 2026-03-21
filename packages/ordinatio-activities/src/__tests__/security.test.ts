// ===========================================
// TESTS: Security Layer
// ===========================================

import { describe, it, expect } from 'vitest';
import {
  isKnownAction,
  sanitizeMetadata,
  createSecureActivityService,
} from '../security';
import type { ActivityDb } from '../types';

function makeMockDb(): ActivityDb {
  const activities: Array<Record<string, unknown>> = [];
  return {
    activityLog: {
      create: async (args: { data: Record<string, unknown> }) => {
        const activity = { id: 'new-1', ...args.data, createdAt: new Date(), resolvedAt: null, resolvedBy: null, user: null, order: null, client: null };
        activities.push(activity);
        return activity as never;
      },
      update: async (args: { where: { id: string }; data: Record<string, unknown> }) => {
        return { id: args.where.id, ...args.data, action: 'test', description: 'test', severity: 'INFO', requiresResolution: false, resolvedAt: new Date(), resolvedBy: 'user-1', system: false, metadata: null, createdAt: new Date(), orderId: null, clientId: null, placementAttemptId: null, user: null, order: null, client: null } as never;
      },
      updateMany: async () => ({ count: 0 }),
      findMany: async () => activities as never,
      count: async () => activities.length,
    },
    $transaction: async (fn: (tx: ActivityDb) => Promise<unknown>) => fn(makeMockDb()),
  };
}

describe('isKnownAction', () => {
  it('recognizes built-in actions', () => {
    expect(isKnownAction('order.created')).toBe(true);
    expect(isKnownAction('placement.failed')).toBe(true);
    expect(isKnownAction('security.auth.login_success')).toBe(true);
  });

  it('rejects unknown actions', () => {
    expect(isKnownAction('evil.action')).toBe(false);
    expect(isKnownAction('')).toBe(false);
  });

  it('accepts custom actions when provided', () => {
    expect(isKnownAction('custom.billing', ['custom.billing'])).toBe(true);
    expect(isKnownAction('custom.billing')).toBe(false);
  });
});

describe('sanitizeMetadata', () => {
  it('passes null and undefined', () => {
    expect(sanitizeMetadata(null, 10240)).toEqual({ valid: true, sanitized: null });
    expect(sanitizeMetadata(undefined, 10240)).toEqual({ valid: true, sanitized: undefined });
  });

  it('passes valid metadata', () => {
    const meta = { key: 'value', count: 42, nested: { a: 1 } };
    const result = sanitizeMetadata(meta, 10240);
    expect(result.valid).toBe(true);
    expect(result.sanitized).toEqual(meta);
  });

  it('rejects oversized metadata', () => {
    const meta = { data: 'x'.repeat(20000) };
    const result = sanitizeMetadata(meta, 10240);
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('exceeds');
  });

  it('strips __proto__ keys', () => {
    const meta = { safe: 'value', __proto__: { evil: true } };
    const result = sanitizeMetadata(meta, 10240);
    expect(result.valid).toBe(true);
    const sanitized = result.sanitized as Record<string, unknown>;
    expect(sanitized.safe).toBe('value');
    expect(Object.prototype.hasOwnProperty.call(sanitized, '__proto__')).toBe(false);
  });

  it('strips constructor keys', () => {
    const meta = { safe: 'value', constructor: 'evil' };
    const result = sanitizeMetadata(meta, 10240);
    expect(result.valid).toBe(true);
    const sanitized = result.sanitized as Record<string, unknown>;
    expect(Object.prototype.hasOwnProperty.call(sanitized, 'constructor')).toBe(false);
  });

  it('rejects metadata with script tags', () => {
    const meta = { html: '<script>alert("xss")</script>' };
    const result = sanitizeMetadata(meta, 10240);
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('dangerous');
  });

  it('rejects metadata with javascript: URIs', () => {
    const meta = { url: 'javascript:alert(1)' };
    const result = sanitizeMetadata(meta, 10240);
    expect(result.valid).toBe(false);
  });

  it('rejects metadata with event handlers', () => {
    const meta = { html: '<img onerror="evil()" src="x">' };
    const result = sanitizeMetadata(meta, 10240);
    expect(result.valid).toBe(false);
  });

  it('handles nested arrays', () => {
    const meta = { items: [{ a: 1 }, { b: 2, __proto__: {} }] };
    const result = sanitizeMetadata(meta, 10240);
    expect(result.valid).toBe(true);
    expect((result.sanitized as { items: unknown[] }).items).toHaveLength(2);
  });

  it('handles primitive metadata', () => {
    expect(sanitizeMetadata('string', 10240)).toEqual({ valid: true, sanitized: 'string' });
    expect(sanitizeMetadata(42, 10240)).toEqual({ valid: true, sanitized: 42 });
    expect(sanitizeMetadata(true, 10240)).toEqual({ valid: true, sanitized: true });
  });
});

describe('createSecureActivityService', () => {
  it('rejects unknown actions in strict mode', async () => {
    const db = makeMockDb();
    const service = createSecureActivityService(db, 'tenant-1');

    await expect(
      service.createActivity({
        action: 'evil.unknown_action',
        description: 'test',
      })
    ).rejects.toThrow('Rejected unknown action');
  });

  it('allows known actions', async () => {
    const db = makeMockDb();
    const service = createSecureActivityService(db, 'tenant-1');

    const activity = await service.createActivity({
      action: 'order.created',
      description: 'Order created',
    });

    expect(activity).toBeDefined();
  });

  it('allows custom actions when configured', async () => {
    const db = makeMockDb();
    const service = createSecureActivityService(db, 'tenant-1', undefined, {
      customActions: ['billing.invoice_sent'],
    });

    const activity = await service.createActivity({
      action: 'billing.invoice_sent',
      description: 'Invoice sent',
    });

    expect(activity).toBeDefined();
  });

  it('rejects oversized metadata', async () => {
    const db = makeMockDb();
    const service = createSecureActivityService(db, 'tenant-1', undefined, {
      maxMetadataBytes: 100,
    });

    await expect(
      service.createActivity({
        action: 'order.created',
        description: 'test',
        metadata: { data: 'x'.repeat(200) },
      })
    ).rejects.toThrow('Metadata rejected');
  });

  it('enforces rate limiting via callback', async () => {
    const db = makeMockDb();
    let callCount = 0;

    const service = createSecureActivityService(db, 'tenant-1', {
      shouldAllowCreation: async () => {
        callCount++;
        return callCount <= 2; // Only allow 2 calls
      },
    });

    // First two succeed
    await service.createActivity({ action: 'order.created', description: '1' });
    await service.createActivity({ action: 'order.created', description: '2' });

    // Third is rate limited
    await expect(
      service.createActivity({ action: 'order.created', description: '3' })
    ).rejects.toThrow('rate limited');
  });

  it('injects tenant ID into metadata', async () => {
    let capturedData: Record<string, unknown> | null = null;

    // Build a db where $transaction passes the SAME db through
    const db: ActivityDb = {
      activityLog: {
        create: async (args: { data: Record<string, unknown> }) => {
          capturedData = args.data;
          return { id: 'new-1', ...args.data, createdAt: new Date(), resolvedAt: null, resolvedBy: null, user: null, order: null, client: null } as never;
        },
        update: async () => ({}) as never,
        updateMany: async () => ({ count: 0 }),
        findMany: async () => [] as never,
        count: async () => 0,
      },
      $transaction: async (fn: (tx: ActivityDb) => Promise<unknown>) => fn(db),
    };

    const service = createSecureActivityService(db, 'tenant-42');

    await service.createActivity({
      action: 'order.created',
      description: 'test',
      metadata: { orderId: 'o-1' },
    });

    expect(capturedData).toBeDefined();
    const meta = capturedData!.metadata as Record<string, unknown>;
    expect(meta._tenantId).toBe('tenant-42');
    expect(meta.orderId).toBe('o-1');
  });

  it('works without strict mode', async () => {
    const db = makeMockDb();
    const service = createSecureActivityService(db, 'tenant-1', undefined, {
      strictActions: false,
    });

    const activity = await service.createActivity({
      action: 'totally.custom.action',
      description: 'Custom action without strict mode',
    });

    expect(activity).toBeDefined();
  });
});
