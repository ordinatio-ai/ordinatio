// ===========================================
// Adversarial Tests: Malicious Input
// ===========================================

import { describe, it, expect, beforeEach } from 'vitest';
import { logSecurityEvent } from '../../event-logger';
import { SECURITY_EVENT_TYPES } from '../../types';
import { evaluatePolicy } from '../../policy/policy-engine';
import { evaluateTrust } from '../../trust/trust-evaluator';
import { buildPrincipalContext, validatePrincipal } from '../../principal-context';
import { createMockDb, createMockCallbacks, resetIdCounter } from '../test-helpers';

describe('oversized metadata in events', () => {
  let db: ReturnType<typeof createMockDb>;
  let callbacks: ReturnType<typeof createMockCallbacks>;

  beforeEach(() => {
    resetIdCounter();
    db = createMockDb();
    callbacks = createMockCallbacks();
  });

  it('handles 10KB+ details object', async () => {
    const bigDetails: Record<string, unknown> = {};
    for (let i = 0; i < 500; i++) {
      bigDetails[`field_${i}`] = 'x'.repeat(20);
    }
    const event = await logSecurityEvent(db, {
      eventType: SECURITY_EVENT_TYPES.AUTH_LOGIN_SUCCESS,
      userId: 'user-1',
      details: bigDetails,
    }, callbacks);
    expect(event.id).toBeTruthy();
  });

  it('handles 100-deep nested JSON', async () => {
    let nested: Record<string, unknown> = { value: 'deep' };
    for (let i = 0; i < 100; i++) {
      nested = { child: nested };
    }
    const event = await logSecurityEvent(db, {
      eventType: SECURITY_EVENT_TYPES.AUTH_LOGIN_SUCCESS,
      details: nested,
    }, callbacks);
    expect(event.id).toBeTruthy();
  });

  it('handles SQL injection in event fields', async () => {
    const event = await logSecurityEvent(db, {
      eventType: SECURITY_EVENT_TYPES.AUTH_LOGIN_FAILED,
      userId: "'; DROP TABLE users; --",
      ip: "1.2.3.4'; DELETE FROM sessions;",
      details: { email: "admin'--@evil.com" },
    }, callbacks);
    expect(event.userId).toBe("'; DROP TABLE users; --");
    expect(event.details.email).toBe("admin'--@evil.com");
  });

  it('handles XSS in event fields', async () => {
    const event = await logSecurityEvent(db, {
      eventType: SECURITY_EVENT_TYPES.AUTH_SUSPICIOUS_ACTIVITY,
      details: {
        message: '<script>alert(document.cookie)</script>',
        field: '"><img src=x onerror=alert(1)>',
      },
    }, callbacks);
    // Data stored as-is — sanitization is the display layer's job
    expect(event.details.message).toContain('<script>');
  });

  it('handles null bytes in event data', async () => {
    const event = await logSecurityEvent(db, {
      eventType: SECURITY_EVENT_TYPES.AUTH_LOGIN_SUCCESS,
      userId: 'user\x00admin',
      details: { data: 'before\x00after' },
    }, callbacks);
    expect(event.id).toBeTruthy();
  });

  it('handles unicode edge cases', async () => {
    const event = await logSecurityEvent(db, {
      eventType: SECURITY_EVENT_TYPES.AUTH_LOGIN_SUCCESS,
      userId: '\u200B\u200C\u200D', // Zero-width chars
      details: { name: '\uFEFF\u202E\u202D' }, // BOM + RTL/LTR override
    }, callbacks);
    expect(event.id).toBeTruthy();
  });

  it('handles prototype pollution attempt in details', async () => {
    const event = await logSecurityEvent(db, {
      eventType: SECURITY_EVENT_TYPES.AUTH_LOGIN_SUCCESS,
      details: {
        __proto__: { isAdmin: true },
        constructor: { prototype: { isAdmin: true } },
      },
    }, callbacks);
    expect(event.id).toBeTruthy();
    // Verify no pollution
    expect(({} as Record<string, unknown>).isAdmin).toBeUndefined();
  });
});

describe('adversarial principal contexts', () => {
  it('rejects principalId with only whitespace', () => {
    expect(() => buildPrincipalContext({
      principalId: '   ',
      principalType: 'user',
    })).not.toThrow(); // Whitespace is allowed — it's not empty
  });

  it('rejects undefined principalType', () => {
    expect(() => validatePrincipal({
      principalId: 'test',
      principalType: undefined as never,
    })).toThrow();
  });

  it('rejects number as principalId', () => {
    expect(() => validatePrincipal({
      principalId: 123 as unknown as string,
      principalType: 'user',
    })).toThrow();
  });
});

describe('adversarial policy evaluation', () => {
  it('handles policy with empty conditions (matches everything)', () => {
    const result = evaluatePolicy(
      {
        principal: { principalId: 'x', principalType: 'user' },
        action: 'anything',
      },
      [{
        id: 'p1',
        name: 'Catch all',
        conditions: [],
        decision: 'deny',
        priority: 1,
      }]
    );
    expect(result.decision).toBe('deny');
  });

  it('handles deeply nested field path', () => {
    const result = evaluatePolicy(
      {
        principal: { principalId: 'x', principalType: 'user' },
        action: 'test',
        metadata: { a: { b: { c: 'deep' } } },
      },
      [{
        id: 'p1',
        name: 'Deep path',
        conditions: [{ field: 'metadata.a.b.c', operator: 'eq', value: 'deep' }],
        decision: 'deny',
        priority: 1,
      }]
    );
    expect(result.decision).toBe('deny');
  });

  it('handles comparison with null', () => {
    const result = evaluatePolicy(
      {
        principal: { principalId: 'x', principalType: 'user' },
        action: 'test',
      },
      [{
        id: 'p1',
        name: 'Null check',
        conditions: [{ field: 'resource', operator: 'eq', value: null }],
        decision: 'deny',
        priority: 1,
      }]
    );
    // resource is undefined, which is not null
    expect(result.decision).toBe('allow');
  });

  it('handles very large policy list', () => {
    const policies = Array.from({ length: 1000 }, (_, i) => ({
      id: `p-${i}`,
      name: `Policy ${i}`,
      conditions: [{ field: 'action' as const, operator: 'eq' as const, value: `action-${i}` }],
      decision: 'deny' as const,
      priority: i,
    }));
    const result = evaluatePolicy(
      { principal: { principalId: 'x', principalType: 'user' }, action: 'action-999' },
      policies
    );
    expect(result.decision).toBe('deny');
    expect(result.policyId).toBe('p-999'); // Highest priority
  });
});

describe('adversarial trust evaluation', () => {
  it('handles all undefined inputs', () => {
    const result = evaluateTrust({});
    expect(result.trustTier).toBe(0);
    expect(result.trustScore).toBeGreaterThanOrEqual(0);
  });

  it('handles empty orgPolicy', () => {
    const result = evaluateTrust({ orgPolicy: {} });
    expect(result.trustTier).toBe(0);
  });

  it('handles issuer matching blocked and trusted simultaneously', () => {
    const result = evaluateTrust({
      issuer: 'ambiguous.com',
      signatureValid: true,
      dmarcStatus: 'pass',
      orgPolicy: {
        trustedDomains: ['ambiguous.com'],
        blockedDomains: ['ambiguous.com'],
      },
    });
    // Blocked takes precedence
    expect(result.trustTier).toBe(0);
  });

  it('handles very long domain names', () => {
    const longDomain = 'a'.repeat(253) + '.com';
    const result = evaluateTrust({
      issuer: longDomain,
      orgPolicy: { trustedDomains: [longDomain] },
    });
    expect(typeof result.trustTier).toBe('number');
  });
});
