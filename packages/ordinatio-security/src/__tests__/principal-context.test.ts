// ===========================================
// Principal Context Tests
// ===========================================

import { describe, it, expect } from 'vitest';
import {
  buildPrincipalContext,
  validatePrincipal,
  describePrincipal,
} from '../principal-context';
import type { PrincipalContext } from '../principal-context';

describe('buildPrincipalContext', () => {
  it('creates a valid principal context', () => {
    const ctx = buildPrincipalContext({
      principalId: 'user-1',
      principalType: 'user',
      orgId: 'org-1',
      authMethod: 'session',
      trustTier: 1,
    });
    expect(ctx.principalId).toBe('user-1');
    expect(ctx.principalType).toBe('user');
    expect(ctx.orgId).toBe('org-1');
    expect(ctx.authMethod).toBe('session');
    expect(ctx.trustTier).toBe(1);
  });

  it('creates minimal principal (required fields only)', () => {
    const ctx = buildPrincipalContext({
      principalId: 'agent-coo',
      principalType: 'agent',
    });
    expect(ctx.principalId).toBe('agent-coo');
    expect(ctx.principalType).toBe('agent');
    expect(ctx.orgId).toBeUndefined();
  });

  it('throws on empty principalId', () => {
    expect(() => buildPrincipalContext({
      principalId: '',
      principalType: 'user',
    })).toThrow('non-empty principalId');
  });

  it('throws on invalid principalType', () => {
    expect(() => buildPrincipalContext({
      principalId: 'user-1',
      principalType: 'hacker' as never,
    })).toThrow('Invalid principalType');
  });

  it('throws on invalid authMethod', () => {
    expect(() => buildPrincipalContext({
      principalId: 'user-1',
      principalType: 'user',
      authMethod: 'magic' as never,
    })).toThrow('Invalid authMethod');
  });

  it('throws on invalid trustTier', () => {
    expect(() => buildPrincipalContext({
      principalId: 'user-1',
      principalType: 'user',
      trustTier: 5 as never,
    })).toThrow('Invalid trustTier');
  });
});

describe('validatePrincipal', () => {
  it('accepts all valid principal types', () => {
    for (const type of ['user', 'agent', 'automation', 'system'] as const) {
      expect(() => validatePrincipal({
        principalId: 'test',
        principalType: type,
      })).not.toThrow();
    }
  });

  it('accepts all valid auth methods', () => {
    for (const method of ['session', 'api_key', 'internal', 'jws'] as const) {
      expect(() => validatePrincipal({
        principalId: 'test',
        principalType: 'user',
        authMethod: method,
      })).not.toThrow();
    }
  });

  it('accepts trust tiers 0, 1, 2', () => {
    for (const tier of [0, 1, 2] as const) {
      expect(() => validatePrincipal({
        principalId: 'test',
        principalType: 'user',
        trustTier: tier,
      })).not.toThrow();
    }
  });
});

describe('describePrincipal', () => {
  it('returns full description with all fields', () => {
    const desc = describePrincipal({
      principalId: 'coo',
      principalType: 'agent',
      orgId: 'org-1',
      authMethod: 'session',
      trustTier: 1,
    });
    expect(desc).toBe('agent:coo in org:org-1 via session (tier 1)');
  });

  it('returns minimal description', () => {
    const desc = describePrincipal({
      principalId: 'sys',
      principalType: 'system',
    });
    expect(desc).toBe('system:sys');
  });

  it('includes org without auth method', () => {
    const desc = describePrincipal({
      principalId: 'auto-1',
      principalType: 'automation',
      orgId: 'org-2',
    });
    expect(desc).toBe('automation:auto-1 in org:org-2');
  });
});
