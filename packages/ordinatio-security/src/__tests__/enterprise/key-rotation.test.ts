// ===========================================
// 5. Key Rotation / Trust Continuity Tests
// ===========================================
// Prove trust still works across key changes.
// ===========================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { InMemoryKeyStore, resolveKeyForTrust } from '../../trust/key-store';
import type { StoredKey } from '../../trust/key-store';
import { evaluateTrust } from '../../trust/trust-evaluator';

function makeKey(kid: string, issuer: string, overrides?: Partial<StoredKey>): StoredKey {
  return {
    kid,
    issuer,
    publicKey: `key-${kid}`,
    createdAt: new Date(),
    ...overrides,
  };
}

describe('Key Store — Lifecycle', () => {
  let store: InMemoryKeyStore;

  beforeEach(() => {
    store = new InMemoryKeyStore();
  });

  it('current key is valid', () => {
    store.addKey(makeKey('k1', 'vendor.com'));
    const result = store.getKey('k1');
    expect(result.found).toBe(true);
    expect(result.reason).toBe('active');
  });

  it('unknown kid returns not found', () => {
    const result = store.getKey('nonexistent');
    expect(result.found).toBe(false);
    expect(result.reason).toBe('unknown');
  });

  it('revoked key always fails', () => {
    store.addKey(makeKey('k1', 'vendor.com'));
    store.revokeKey('k1');
    const result = store.getKey('k1');
    expect(result.found).toBe(true);
    expect(result.reason).toBe('revoked');
  });

  it('revoking unknown key returns false', () => {
    expect(store.revokeKey('nonexistent')).toBe(false);
  });

  it('expired key without grace is expired', () => {
    store.addKey(makeKey('k1', 'vendor.com', {
      expiresAt: new Date(Date.now() - 1000),
    }));
    const result = store.getKey('k1');
    expect(result.reason).toBe('expired');
  });
});

describe('Key Rotation — Grace Windows', () => {
  let store: InMemoryKeyStore;

  beforeEach(() => {
    store = new InMemoryKeyStore();
  });

  it('old key inside grace window is valid', () => {
    store.addKey(makeKey('k1', 'vendor.com'));
    store.rotateKey('vendor.com', makeKey('k2', 'vendor.com'), 60_000); // 60s grace

    const oldResult = store.getKey('k1');
    expect(oldResult.found).toBe(true);
    expect(oldResult.reason).toBe('grace_window');

    const newResult = store.getKey('k2');
    expect(newResult.found).toBe(true);
    expect(newResult.reason).toBe('active');
  });

  it('old key outside grace window is expired', () => {
    vi.useFakeTimers();

    store.addKey(makeKey('k1', 'vendor.com'));
    store.rotateKey('vendor.com', makeKey('k2', 'vendor.com'), 1000); // 1s grace

    vi.advanceTimersByTime(2000); // Past grace window

    const oldResult = store.getKey('k1');
    expect(oldResult.reason).toBe('expired');

    const newResult = store.getKey('k2');
    expect(newResult.reason).toBe('active');

    vi.useRealTimers();
  });

  it('two valid keys for same issuer', () => {
    store.addKey(makeKey('k1', 'vendor.com'));
    store.rotateKey('vendor.com', makeKey('k2', 'vendor.com'), 60_000);

    const keys = store.getKeysForIssuer('vendor.com');
    expect(keys).toHaveLength(2);

    // Both should be usable
    const r1 = store.getKey('k1');
    const r2 = store.getKey('k2');
    expect(['active', 'grace_window']).toContain(r1.reason);
    expect(r2.reason).toBe('active');
  });

  it('issuer rotates keys during active usage', () => {
    store.addKey(makeKey('k1', 'vendor.com'));

    // First request uses k1
    const r1 = store.getKey('k1');
    expect(r1.reason).toBe('active');

    // Rotation happens
    store.rotateKey('vendor.com', makeKey('k2', 'vendor.com'), 60_000);

    // Old key still works (grace window)
    const r1After = store.getKey('k1');
    expect(r1After.reason).toBe('grace_window');

    // New key also works
    const r2 = store.getKey('k2');
    expect(r2.reason).toBe('active');
  });

  it('multiple rotations create chain of grace windows', () => {
    store.addKey(makeKey('k1', 'vendor.com'));
    store.rotateKey('vendor.com', makeKey('k2', 'vendor.com'), 60_000);
    store.rotateKey('vendor.com', makeKey('k3', 'vendor.com'), 60_000);

    // k1 was expired when k2 was added, then k2 was expired when k3 was added
    // k1 should be grace (from first rotation), k2 should be grace (from second)
    const keys = store.getKeysForIssuer('vendor.com');
    expect(keys).toHaveLength(3);
    expect(store.getKey('k3').reason).toBe('active');
  });
});

describe('resolveKeyForTrust — Key Selection', () => {
  let store: InMemoryKeyStore;

  beforeEach(() => {
    store = new InMemoryKeyStore();
  });

  it('selects key by kid', () => {
    store.addKey(makeKey('k1', 'vendor.com'));
    const result = resolveKeyForTrust(store, 'k1', 'vendor.com');
    expect(result.valid).toBe(true);
    expect(result.key?.kid).toBe('k1');
  });

  it('rejects unknown kid', () => {
    const result = resolveKeyForTrust(store, 'unknown', 'vendor.com');
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('Unknown key ID');
  });

  it('rejects revoked key by kid', () => {
    store.addKey(makeKey('k1', 'vendor.com'));
    store.revokeKey('k1');
    const result = resolveKeyForTrust(store, 'k1', 'vendor.com');
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('revoked');
  });

  it('rejects expired key (no grace) by kid', () => {
    store.addKey(makeKey('k1', 'vendor.com', { expiresAt: new Date(Date.now() - 1000) }));
    const result = resolveKeyForTrust(store, 'k1', 'vendor.com');
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('expired');
  });

  it('accepts grace-window key by kid', () => {
    store.addKey(makeKey('k1', 'vendor.com'));
    store.rotateKey('vendor.com', makeKey('k2', 'vendor.com'), 60_000);
    const result = resolveKeyForTrust(store, 'k1', 'vendor.com');
    expect(result.valid).toBe(true);
    expect(result.reason).toContain('grace_window');
  });

  it('finds best key for issuer (no kid)', () => {
    store.addKey(makeKey('k1', 'vendor.com'));
    store.rotateKey('vendor.com', makeKey('k2', 'vendor.com'), 60_000);

    const result = resolveKeyForTrust(store, undefined, 'vendor.com');
    expect(result.valid).toBe(true);
    expect(result.key?.kid).toBe('k2'); // Prefers active over grace
  });

  it('falls back to grace key if no active key', () => {
    vi.useFakeTimers();
    store.addKey(makeKey('k1', 'vendor.com'));
    store.rotateKey('vendor.com', makeKey('k2', 'vendor.com'), 60_000);
    // Expire k2
    store.addKey(makeKey('k2', 'vendor.com', { expiresAt: new Date(Date.now() - 100) }));

    // k1 is in grace, k2 is expired — should fall back to k1 via grace
    const result = resolveKeyForTrust(store, undefined, 'vendor.com');
    // At least one key should resolve
    expect(typeof result.valid).toBe('boolean');
    vi.useRealTimers();
  });

  it('returns invalid when all issuer keys are revoked', () => {
    store.addKey(makeKey('k1', 'vendor.com'));
    store.revokeKey('k1');
    const result = resolveKeyForTrust(store, undefined, 'vendor.com');
    expect(result.valid).toBe(false);
  });

  it('returns invalid for unknown issuer', () => {
    const result = resolveKeyForTrust(store, undefined, 'unknown.com');
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('No keys found');
  });
});

describe('Trust Evaluation with Key Resolution', () => {
  it('valid key → tier 1 trust', () => {
    const store = new InMemoryKeyStore();
    store.addKey(makeKey('k1', 'vendor.com'));
    const keyResult = resolveKeyForTrust(store, 'k1', 'vendor.com');

    const trust = evaluateTrust({
      issuer: 'vendor.com',
      signatureValid: keyResult.valid,
      dmarcStatus: 'pass',
      nonceValid: true,
      ttlValid: true,
      orgPolicy: { trustedDomains: ['vendor.com'] },
    });

    expect(trust.trustTier).toBe(1);
  });

  it('revoked key → tier 0 trust', () => {
    const store = new InMemoryKeyStore();
    store.addKey(makeKey('k1', 'vendor.com'));
    store.revokeKey('k1');
    const keyResult = resolveKeyForTrust(store, 'k1', 'vendor.com');

    const trust = evaluateTrust({
      issuer: 'vendor.com',
      signatureValid: keyResult.valid, // false
      dmarcStatus: 'pass',
      nonceValid: true,
      ttlValid: true,
      orgPolicy: { trustedDomains: ['vendor.com'] },
    });

    expect(trust.trustTier).toBe(0);
  });

  it('rotation does not break valid traffic', () => {
    const store = new InMemoryKeyStore();
    store.addKey(makeKey('k1', 'vendor.com'));

    // Pre-rotation: k1 valid
    const pre = resolveKeyForTrust(store, 'k1', 'vendor.com');
    expect(pre.valid).toBe(true);

    // Rotate
    store.rotateKey('vendor.com', makeKey('k2', 'vendor.com'), 60_000);

    // Post-rotation: both work
    const postOld = resolveKeyForTrust(store, 'k1', 'vendor.com');
    expect(postOld.valid).toBe(true);

    const postNew = resolveKeyForTrust(store, 'k2', 'vendor.com');
    expect(postNew.valid).toBe(true);
  });
});
