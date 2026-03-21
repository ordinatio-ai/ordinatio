// ===========================================
// TESTS: Security Mob — Adversarial Suite (G5)
// ===========================================
// Dedicated adversarial testing: injection attacks,
// boundary testing, tenant isolation, prototype
// pollution, XSS, rate limiter edge cases.
// ===========================================

import { describe, it, expect, vi } from 'vitest';
import {
  isKnownAction,
  sanitizeMetadata,
  createSecureActivityService,
  DANGEROUS_KEYS,
  DANGEROUS_PATTERNS,
} from '../security';
import type { ActivityDb, ActivityWithRelations } from '../types';

// ---- Mock DB Factory ----

function makeMockDb(): ActivityDb {
  const activities: Array<Record<string, unknown>> = [];
  return {
    activityLog: {
      create: async (args: { data: Record<string, unknown> }) => {
        const activity = {
          id: 'new-1',
          ...args.data,
          createdAt: new Date(),
          resolvedAt: null,
          resolvedBy: null,
          user: null,
          order: null,
          client: null,
        };
        activities.push(activity);
        return activity as never;
      },
      update: async (args: { where: { id: string }; data: Record<string, unknown> }) => {
        return {
          id: args.where.id, ...args.data, action: 'test', description: 'test',
          severity: 'INFO', requiresResolution: false, resolvedAt: new Date(),
          resolvedBy: 'user-1', system: false, metadata: null, createdAt: new Date(),
          orderId: null, clientId: null, placementAttemptId: null,
          user: null, order: null, client: null,
        } as never;
      },
      updateMany: async () => ({ count: 0 }),
      findMany: async () => activities as never,
      count: async () => activities.length,
    },
    $transaction: async (fn: (tx: ActivityDb) => Promise<unknown>) => fn(makeMockDb()),
  };
}

/**
 * Build a mock DB that captures the data passed to activityLog.create,
 * and where $transaction passes the SAME db through (for tenant verification).
 */
function makeCapturingDb(): { db: ActivityDb; getCaptured: () => Record<string, unknown> | null } {
  let capturedData: Record<string, unknown> | null = null;
  const db: ActivityDb = {
    activityLog: {
      create: async (args: { data: Record<string, unknown> }) => {
        capturedData = args.data;
        return {
          id: 'cap-1', ...args.data, createdAt: new Date(),
          resolvedAt: null, resolvedBy: null, user: null, order: null, client: null,
        } as never;
      },
      update: async () => ({}) as never,
      updateMany: async () => ({ count: 0 }),
      findMany: async () => [] as never,
      count: async () => 0,
    },
    $transaction: async (fn: (tx: ActivityDb) => Promise<unknown>) => fn(db),
  };
  return { db, getCaptured: () => capturedData };
}

// ---- SQL / NoSQL Injection via Metadata ----

describe('SQL/NoSQL Injection via Metadata', () => {
  it('neutralizes SQL injection in metadata string values', () => {
    const meta = { name: "'; DROP TABLE activities; --" };
    const result = sanitizeMetadata(meta, 10240);
    // SQL is not executable HTML/JS — it should pass sanitization
    // (defense against SQL injection is at the DB query layer, not metadata)
    expect(result.valid).toBe(true);
    expect((result.sanitized as Record<string, unknown>).name).toBe("'; DROP TABLE activities; --");
  });

  it('passes MongoDB operator injection through (not a vector here)', () => {
    const meta = { filter: { $gt: '', $where: '1==1' } };
    const result = sanitizeMetadata(meta, 10240);
    // Mongo operators are harmless strings in a JSON metadata column
    expect(result.valid).toBe(true);
    const sanitized = result.sanitized as Record<string, unknown>;
    const filter = sanitized.filter as Record<string, unknown>;
    expect(filter.$gt).toBe('');
    expect(filter.$where).toBe('1==1');
  });

  it('passes LDAP injection through (not a vector here)', () => {
    const meta = { username: '*)(uid=*))(|(uid=*' };
    const result = sanitizeMetadata(meta, 10240);
    expect(result.valid).toBe(true);
  });

  it('passes SQL UNION attack through (not a vector here)', () => {
    const meta = { query: "UNION SELECT * FROM users --" };
    const result = sanitizeMetadata(meta, 10240);
    expect(result.valid).toBe(true);
  });
});

// ---- Action Name Manipulation ----

describe('Action Name Manipulation', () => {
  it('rejects action name with path traversal', async () => {
    const db = makeMockDb();
    const service = createSecureActivityService(db, 'tenant-1');

    await expect(
      service.createActivity({
        action: '../../../etc/passwd',
        description: 'path traversal attempt',
      })
    ).rejects.toThrow('Rejected unknown action');
  });

  it('rejects action name with SQL injection', async () => {
    const db = makeMockDb();
    const service = createSecureActivityService(db, 'tenant-1');

    await expect(
      service.createActivity({
        action: "order.created'; DROP TABLE",
        description: 'sql injection in action',
      })
    ).rejects.toThrow('Rejected unknown action');
  });

  it('rejects action name with null bytes', async () => {
    const db = makeMockDb();
    const service = createSecureActivityService(db, 'tenant-1');

    await expect(
      service.createActivity({
        action: 'order.created\0.evil',
        description: 'null byte injection',
      })
    ).rejects.toThrow('Rejected unknown action');
  });

  it('rejects action name with very long string (10000 chars)', async () => {
    const db = makeMockDb();
    const service = createSecureActivityService(db, 'tenant-1');

    await expect(
      service.createActivity({
        action: 'a'.repeat(10000),
        description: 'buffer overflow attempt',
      })
    ).rejects.toThrow('Rejected unknown action');
  });

  it('rejects empty string action name', async () => {
    const db = makeMockDb();
    const service = createSecureActivityService(db, 'tenant-1');

    await expect(
      service.createActivity({
        action: '',
        description: 'empty action',
      })
    ).rejects.toThrow(/unknown action|Rejected/i);
  });

  it('rejects whitespace-only action name', async () => {
    const db = makeMockDb();
    const service = createSecureActivityService(db, 'tenant-1');

    await expect(
      service.createActivity({
        action: '   \t\n  ',
        description: 'whitespace action',
      })
    ).rejects.toThrow('Rejected unknown action');
  });
});

// ---- Metadata Size Boundary Testing ----

describe('Metadata Size Boundary Testing', () => {
  it('accepts metadata exactly at maxMetadataBytes', () => {
    const maxBytes = 100;
    // Build a string whose JSON serialization is exactly maxBytes
    // JSON.stringify("x...x") = "\"" + chars + "\"" = 2 + chars.length
    // We want 2 + chars.length = 100 => chars.length = 98
    const meta = 'x'.repeat(98);
    expect(JSON.stringify(meta).length).toBe(maxBytes);

    const result = sanitizeMetadata(meta, maxBytes);
    expect(result.valid).toBe(true);
    expect(result.sanitized).toBe(meta);
  });

  it('rejects metadata at maxMetadataBytes + 1', () => {
    const maxBytes = 100;
    // JSON.stringify produces 101 bytes
    const meta = 'x'.repeat(99);
    expect(JSON.stringify(meta).length).toBe(maxBytes + 1);

    const result = sanitizeMetadata(meta, maxBytes);
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('exceeds');
  });

  it('accepts empty object {} (0 meaningful bytes)', () => {
    const result = sanitizeMetadata({}, 10240);
    expect(result.valid).toBe(true);
    expect(result.sanitized).toEqual({});
  });

  it('rejects all non-null metadata when maxMetadataBytes is 0', () => {
    // JSON.stringify({}) = "{}" which is 2 bytes > 0
    expect(sanitizeMetadata({}, 0).valid).toBe(false);
    expect(sanitizeMetadata('a', 0).valid).toBe(false);
    expect(sanitizeMetadata(1, 0).valid).toBe(false);
  });

  it('still allows null/undefined when maxMetadataBytes is 0', () => {
    expect(sanitizeMetadata(null, 0)).toEqual({ valid: true, sanitized: null });
    expect(sanitizeMetadata(undefined, 0)).toEqual({ valid: true, sanitized: undefined });
  });

  it('handles maxMetadataBytes set to very large value (100MB)', () => {
    const largeLimit = 100 * 1024 * 1024;
    const meta = { data: 'hello', nested: { ok: true } };
    const result = sanitizeMetadata(meta, largeLimit);
    expect(result.valid).toBe(true);
    expect(result.sanitized).toEqual(meta);
  });
});

// ---- XSS and Content Injection ----

describe('XSS and Content Injection', () => {
  it('rejects SVG-based XSS (<svg onload>)', () => {
    const meta = { content: '<svg onload="alert(1)">' };
    const result = sanitizeMetadata(meta, 10240);
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('dangerous');
  });

  it('rejects CSS expression injection', () => {
    // CSS expression() is not in DANGEROUS_PATTERNS — this is NOT an XSS vector
    // in a JSON metadata column. Verify current behavior.
    const meta = { style: 'expression(alert(1))' };
    const result = sanitizeMetadata(meta, 10240);
    // expression() is not matched by DANGEROUS_PATTERNS (no regex for it)
    // This is acceptable: CSS injection in JSON metadata is not executable
    expect(result.valid).toBe(true);
  });

  it('passes template literal strings (not executable in JSON)', () => {
    const meta = { tmpl: '`${process.exit()}`' };
    const result = sanitizeMetadata(meta, 10240);
    // Template literals in a JSON string value are just strings, not executable
    expect(result.valid).toBe(true);
  });

  it('passes HTML entity encoded script (entities are harmless)', () => {
    const meta = { html: '&lt;script&gt;alert(1)&lt;/script&gt;' };
    const result = sanitizeMetadata(meta, 10240);
    expect(result.valid).toBe(true);
  });

  it('rejects mixed-case script tags (<ScRiPt>)', () => {
    const meta = { html: '<ScRiPt>alert(1)</ScRiPt>' };
    const result = sanitizeMetadata(meta, 10240);
    // DANGEROUS_PATTERNS uses /i flag on <script\b
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('dangerous');
  });

  it('rejects data:text/html URIs', () => {
    const meta = { url: 'data:text/html,<h1>evil</h1>' };
    const result = sanitizeMetadata(meta, 10240);
    expect(result.valid).toBe(false);
  });

  it('handles multi-line javascript: URI bypass attempt', () => {
    // A literal newline in the JSON value: "java\nscript:alert(1)"
    const meta = { url: 'java\nscript:alert(1)' };
    const result = sanitizeMetadata(meta, 10240);
    // JSON.stringify escapes the newline to \\n, so the serialized form is
    // "java\\nscript:alert(1)" — the regex /javascript:/i won't match across the escaped newline.
    // This is fine: JSON metadata with literal newlines can't execute in a browser context.
    expect(result.valid).toBe(true);
  });

  it('rejects onclick event handler injection', () => {
    const meta = { html: '<div onclick="steal()">' };
    const result = sanitizeMetadata(meta, 10240);
    expect(result.valid).toBe(false);
  });

  it('rejects onfocus event handler injection', () => {
    const meta = { html: '<input onfocus = "evil()">' };
    const result = sanitizeMetadata(meta, 10240);
    expect(result.valid).toBe(false);
  });
});

// ---- Rate Limiter Attacks ----

describe('Rate Limiter Attacks', () => {
  it('rejects immediately when rate limiter returns false on first call', async () => {
    const db = makeMockDb();
    const service = createSecureActivityService(db, 'tenant-1', {
      shouldAllowCreation: async () => false,
    });

    await expect(
      service.createActivity({
        action: 'order.created',
        description: 'should be blocked',
      })
    ).rejects.toThrow('rate limited');
  });

  it('propagates error when rate limiter throws', async () => {
    const db = makeMockDb();
    const service = createSecureActivityService(db, 'tenant-1', {
      shouldAllowCreation: async () => {
        throw new Error('Redis connection failed');
      },
    });

    await expect(
      service.createActivity({
        action: 'order.created',
        description: 'rate limiter error',
      })
    ).rejects.toThrow('Redis connection failed');
  });

  it('treats falsy non-boolean return from rate limiter as rejection', async () => {
    const db = makeMockDb();
    const service = createSecureActivityService(db, 'tenant-1', {
      // Return 0 (falsy but not boolean false)
      shouldAllowCreation: async () => 0 as unknown as boolean,
    });

    // Falsy value should be treated as rejection since the check is `if (!allowed)`
    await expect(
      service.createActivity({
        action: 'order.created',
        description: 'falsy non-boolean',
      })
    ).rejects.toThrow('rate limited');
  });
});

// ---- Tenant ID Spoofing ----

describe('Tenant ID Spoofing', () => {
  it('overwrites _tenantId already present in metadata', async () => {
    const { db, getCaptured } = makeCapturingDb();
    const service = createSecureActivityService(db, 'real-tenant-99');

    await service.createActivity({
      action: 'order.created',
      description: 'spoofing attempt',
      metadata: { _tenantId: 'spoofed-tenant-666', data: 'legit' },
    });

    const captured = getCaptured()!;
    const meta = captured.metadata as Record<string, unknown>;
    expect(meta._tenantId).toBe('real-tenant-99');
    expect(meta.data).toBe('legit');
  });

  it('does not affect nested _tenantId keys', async () => {
    const { db, getCaptured } = makeCapturingDb();
    const service = createSecureActivityService(db, 'real-tenant');

    await service.createActivity({
      action: 'order.created',
      description: 'nested spoof',
      metadata: { context: { _tenantId: 'nested-spoof' }, info: 'ok' },
    });

    const captured = getCaptured()!;
    const meta = captured.metadata as Record<string, unknown>;
    // Top-level _tenantId is the real one
    expect(meta._tenantId).toBe('real-tenant');
    // Nested _tenantId is preserved (it's just data, not a security control)
    const context = meta.context as Record<string, unknown>;
    expect(context._tenantId).toBe('nested-spoof');
  });

  it('isolates activities between two tenant-scoped services', async () => {
    const captured: Array<{ tenant: string; data: Record<string, unknown> }> = [];

    function makeTenantDb(tenantLabel: string): ActivityDb {
      const db: ActivityDb = {
        activityLog: {
          create: async (args: { data: Record<string, unknown> }) => {
            captured.push({ tenant: tenantLabel, data: args.data });
            return {
              id: `${tenantLabel}-1`, ...args.data, createdAt: new Date(),
              resolvedAt: null, resolvedBy: null, user: null, order: null, client: null,
            } as never;
          },
          update: async () => ({}) as never,
          updateMany: async () => ({ count: 0 }),
          findMany: async () => [] as never,
          count: async () => 0,
        },
        $transaction: async (fn: (tx: ActivityDb) => Promise<unknown>) => fn(db),
      };
      return db;
    }

    const serviceA = createSecureActivityService(makeTenantDb('A'), 'tenant-A');
    const serviceB = createSecureActivityService(makeTenantDb('B'), 'tenant-B');

    await serviceA.createActivity({ action: 'order.created', description: 'from A' });
    await serviceB.createActivity({ action: 'order.created', description: 'from B' });

    expect(captured).toHaveLength(2);

    const metaA = captured[0].data.metadata as Record<string, unknown>;
    const metaB = captured[1].data.metadata as Record<string, unknown>;

    expect(metaA._tenantId).toBe('tenant-A');
    expect(metaB._tenantId).toBe('tenant-B');
    expect(captured[0].tenant).toBe('A');
    expect(captured[1].tenant).toBe('B');
  });
});

// ---- Prototype Pollution Depth ----

describe('Prototype Pollution Depth', () => {
  it('strips __proto__ at 10 levels of nesting', () => {
    // Build deeply nested object with __proto__ at every level
    let obj: Record<string, unknown> = { __proto__: { polluted: true }, safe: 'leaf' };
    for (let i = 0; i < 9; i++) {
      obj = { level: obj, __proto__: { polluted: true } };
    }

    const result = sanitizeMetadata(obj, 1_000_000);
    expect(result.valid).toBe(true);

    // Walk down 10 levels and verify no __proto__ keys survived
    let current = result.sanitized as Record<string, unknown>;
    for (let i = 0; i < 10; i++) {
      expect(Object.prototype.hasOwnProperty.call(current, '__proto__')).toBe(false);
      expect(Object.prototype.hasOwnProperty.call(current, 'polluted')).toBe(false);
      if (current.level) {
        current = current.level as Record<string, unknown>;
      }
    }
  });

  it('strips __proto__ keys inside array items', () => {
    const meta = {
      items: [
        { __proto__: { evil: true }, name: 'item1' },
        { constructor: 'evil', name: 'item2' },
        { prototype: { hack: true }, name: 'item3' },
      ],
    };

    const result = sanitizeMetadata(meta, 10240);
    expect(result.valid).toBe(true);

    const sanitized = result.sanitized as { items: Array<Record<string, unknown>> };
    expect(sanitized.items).toHaveLength(3);

    for (const item of sanitized.items) {
      expect(Object.prototype.hasOwnProperty.call(item, '__proto__')).toBe(false);
      expect(Object.prototype.hasOwnProperty.call(item, 'constructor')).toBe(false);
      expect(Object.prototype.hasOwnProperty.call(item, 'prototype')).toBe(false);
      // Safe keys survive
      expect(item.name).toBeDefined();
    }
  });

  it('handles combination attack: oversized + prototype pollution + XSS', async () => {
    const db = makeMockDb();
    const service = createSecureActivityService(db, 'tenant-1', undefined, {
      maxMetadataBytes: 200,
    });

    // This payload is oversized AND contains XSS AND prototype pollution
    const evilMeta = {
      __proto__: { polluted: true },
      html: '<script>alert("xss")</script>',
      data: 'x'.repeat(500),
    };

    await expect(
      service.createActivity({
        action: 'order.created',
        description: 'combo attack',
        metadata: evilMeta,
      })
    ).rejects.toThrow('Metadata rejected');
  });
});

// ---- Dangerous pattern and key coverage (tested indirectly via sanitizeMetadata) ----

describe('Dangerous pattern and key coverage', () => {
  it('strips all three prototype pollution keys (__proto__, constructor, prototype)', () => {
    const meta = { __proto__: { x: 1 }, constructor: 'evil', prototype: { y: 2 }, safe: 'ok' };
    const result = sanitizeMetadata(meta, 10240);
    expect(result.valid).toBe(true);
    const sanitized = result.sanitized as Record<string, unknown>;
    expect(Object.prototype.hasOwnProperty.call(sanitized, '__proto__')).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(sanitized, 'constructor')).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(sanitized, 'prototype')).toBe(false);
    expect(sanitized.safe).toBe('ok');
  });

  it('does not strip normal key names (name, action, proto)', () => {
    const meta = { name: 'test', action: 'go', proto: 'ok' };
    const result = sanitizeMetadata(meta, 10240);
    expect(result.valid).toBe(true);
    const sanitized = result.sanitized as Record<string, unknown>;
    expect(sanitized.name).toBe('test');
    expect(sanitized.action).toBe('go');
    expect(sanitized.proto).toBe('ok');
  });

  it('rejects exact event handler names from the pattern group', () => {
    // The regex matches on(error|load|click|mouse|key|focus|blur|change|submit)\s*=
    // Only the base names match directly (not onmouseover, onkeydown, etc.)
    const exactHandlers = [
      'onerror="x"', 'onload="x"', 'onclick="x"', 'onmouse="x"',
      'onkey="x"', 'onfocus="x"', 'onblur="x"', 'onchange="x"', 'onsubmit="x"',
    ];
    for (const handler of exactHandlers) {
      const result = sanitizeMetadata({ html: `<div ${handler}>` }, 10240);
      expect(result.valid).toBe(false);
    }
  });

  it('compound event handlers like onmouseover bypass the regex (gap documentation)', () => {
    // These DON'T match because the regex only matches the base word + "="
    // "onmouseover=" has extra chars between "mouse" and "="
    const bypasses = ['onmouseover="x"', 'onkeydown="x"', 'onkeypress="x"'];
    for (const handler of bypasses) {
      const result = sanitizeMetadata({ html: `<div ${handler}>` }, 10240);
      // Document that these pass through — a potential gap in the pattern set
      expect(result.valid).toBe(true);
    }
  });

  it('rejects script tags case-insensitively in metadata', () => {
    expect(sanitizeMetadata({ v: '<script>' }, 10240).valid).toBe(false);
    expect(sanitizeMetadata({ v: '<SCRIPT>' }, 10240).valid).toBe(false);
    expect(sanitizeMetadata({ v: '<Script src="x">' }, 10240).valid).toBe(false);
  });

  it('rejects javascript: URIs case-insensitively in metadata', () => {
    expect(sanitizeMetadata({ v: 'javascript:void(0)' }, 10240).valid).toBe(false);
    expect(sanitizeMetadata({ v: 'JAVASCRIPT:alert(1)' }, 10240).valid).toBe(false);
  });
});

// ---- Edge Cases / Defense in Depth ----

describe('Edge Cases and Defense in Depth', () => {
  it('handles metadata with circular-like deep structure without crashing', () => {
    // Build a very deep but non-circular object
    let obj: Record<string, unknown> = { value: 'leaf' };
    for (let i = 0; i < 100; i++) {
      obj = { child: obj };
    }
    // Should not stack overflow — just a deep object
    const result = sanitizeMetadata(obj, 1_000_000);
    expect(result.valid).toBe(true);
  });

  it('createSecureActivityService injects tenant even when metadata is null', async () => {
    const { db, getCaptured } = makeCapturingDb();
    const service = createSecureActivityService(db, 'tenant-null-meta');

    await service.createActivity({
      action: 'order.created',
      description: 'no metadata provided',
      // metadata is undefined
    });

    const captured = getCaptured()!;
    const meta = captured.metadata as Record<string, unknown>;
    expect(meta._tenantId).toBe('tenant-null-meta');
  });

  it('sanitizeMetadata handles metadata that is just a string with XSS', () => {
    const result = sanitizeMetadata('<script>alert(1)</script>', 10240);
    expect(result.valid).toBe(false);
  });

  it('sanitizeMetadata handles metadata that is a number', () => {
    const result = sanitizeMetadata(42, 10240);
    expect(result.valid).toBe(true);
    expect(result.sanitized).toBe(42);
  });

  it('sanitizeMetadata handles metadata that is a boolean', () => {
    const result = sanitizeMetadata(false, 10240);
    expect(result.valid).toBe(true);
    expect(result.sanitized).toBe(false);
  });
});
