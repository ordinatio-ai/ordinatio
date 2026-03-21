// ===========================================
// TRUST — TESTS (Nonce Tracker, Trust Evaluator)
// ===========================================

import { describe, it, expect, beforeEach } from 'vitest';
import { NonceTracker } from './nonce-tracker';
import { evaluateTrust } from './trust-evaluator';
import { generateKeyPair } from '../signing/key-manager';
import { signCapsule } from '../signing/signer';
import { encodeCapsule } from '../capsule/encoder';
import type { CapsulePayload, TrustPolicy } from '../types';

// ─── NonceTracker ───

describe('NonceTracker', () => {
  let tracker: NonceTracker;

  beforeEach(() => {
    tracker = new NonceTracker(100, 60000); // 100 max, 60s TTL
  });

  it('records and detects seen nonces', () => {
    expect(tracker.hasBeenSeen('nonce-1')).toBe(false);
    tracker.record('nonce-1');
    expect(tracker.hasBeenSeen('nonce-1')).toBe(true);
  });

  it('different nonces are independent', () => {
    tracker.record('nonce-1');
    expect(tracker.hasBeenSeen('nonce-2')).toBe(false);
  });

  it('clears all nonces', () => {
    tracker.record('nonce-1');
    tracker.record('nonce-2');
    tracker.clear();
    expect(tracker.hasBeenSeen('nonce-1')).toBe(false);
    expect(tracker.hasBeenSeen('nonce-2')).toBe(false);
    expect(tracker.size).toBe(0);
  });

  it('tracks size', () => {
    expect(tracker.size).toBe(0);
    tracker.record('a');
    tracker.record('b');
    expect(tracker.size).toBe(2);
  });

  it('evicts oldest when at capacity', () => {
    const smallTracker = new NonceTracker(3, 60000);
    smallTracker.record('a');
    smallTracker.record('b');
    smallTracker.record('c');
    smallTracker.record('d'); // Should evict 'a'

    expect(smallTracker.hasBeenSeen('a')).toBe(false);
    expect(smallTracker.hasBeenSeen('b')).toBe(true);
    expect(smallTracker.hasBeenSeen('d')).toBe(true);
    expect(smallTracker.size).toBe(3);
  });
});

// ─── Trust Evaluator ───

describe('evaluateTrust', () => {
  const defaultPolicy: TrustPolicy = {
    enabled: true,
    requireSignature: false,
    trustedDomains: ['trusted.com'],
    highStakesDomains: ['highstakes.com'],
    requireHumanApproval: ['process_invoice'],
    maxMonetaryValue: 10000,
    blockedDomains: ['blocked.com'],
  };

  function makeCapsule(overrides?: Partial<CapsulePayload>): CapsulePayload {
    return {
      spec: 'ai-instructions',
      version: '1.1',
      type: 'email_capsule',
      issued_at: Math.floor(Date.now() / 1000),
      issuer: 'trusted.com',
      thread: { id: 'thread-1', state_version: 1 },
      intent: 'information_request',
      actions: [],
      ...overrides,
    };
  }

  it('returns Tier 0 when OAEM is disabled', async () => {
    const result = await evaluateTrust(
      makeCapsule(),
      undefined,
      {
        senderEmail: 'alice@trusted.com',
        senderDomain: 'trusted.com',
        policy: { ...defaultPolicy, enabled: false },
        nonceTracker: new NonceTracker(),
      }
    );
    expect(result.tier).toBe(0);
    expect(result.reasons).toContain('OAEM policy is disabled');
  });

  it('returns Tier 0 for blocked domains', async () => {
    const result = await evaluateTrust(
      makeCapsule({ issuer: 'blocked.com' }),
      undefined,
      {
        senderEmail: 'alice@blocked.com',
        senderDomain: 'blocked.com',
        policy: defaultPolicy,
        nonceTracker: new NonceTracker(),
      }
    );
    expect(result.tier).toBe(0);
    expect(result.reasons).toContain('Sender domain is blocked');
  });

  it('returns Tier 0 when no signature and policy requires it', async () => {
    const result = await evaluateTrust(
      makeCapsule(),
      undefined,
      {
        senderEmail: 'alice@trusted.com',
        senderDomain: 'trusted.com',
        policy: { ...defaultPolicy, requireSignature: true },
        nonceTracker: new NonceTracker(),
      }
    );
    expect(result.tier).toBe(0);
    expect(result.reasons).toContain('Policy requires signature');
  });

  it('returns Tier 1 with valid signature + trusted domain', async () => {
    const keys = await generateKeyPair();
    const capsule = makeCapsule();
    const encoded = encodeCapsule(capsule);

    const sig = await signCapsule(encoded, keys.privateKey, {
      issuer: 'trusted.com',
      kid: keys.kid,
      nonce: 'n1',
      exp: Math.floor(Date.now() / 1000) + 3600,
    });

    const result = await evaluateTrust(
      capsule,
      sig,
      {
        senderEmail: 'alice@trusted.com',
        senderDomain: 'trusted.com',
        policy: defaultPolicy,
        publicKey: keys.publicKey,
        nonceTracker: new NonceTracker(),
      }
    );

    expect(result.tier).toBe(1);
    expect(result.signatureValid).toBe(true);
    expect(result.dmarcAligned).toBe(true);
    expect(result.issuerAllowed).toBe(true);
  });

  it('returns Tier 2 for high-stakes domain', async () => {
    const keys = await generateKeyPair();
    const capsule = makeCapsule({ issuer: 'highstakes.com' });
    const encoded = encodeCapsule(capsule);

    const sig = await signCapsule(encoded, keys.privateKey, {
      issuer: 'highstakes.com',
      kid: keys.kid,
      nonce: 'n1',
      exp: Math.floor(Date.now() / 1000) + 3600,
    });

    const result = await evaluateTrust(
      capsule,
      sig,
      {
        senderEmail: 'alice@highstakes.com',
        senderDomain: 'highstakes.com',
        policy: defaultPolicy,
        publicKey: keys.publicKey,
        nonceTracker: new NonceTracker(),
      }
    );

    expect(result.tier).toBe(2);
  });

  it('returns Tier 0 for DMARC misalignment', async () => {
    const keys = await generateKeyPair();
    const capsule = makeCapsule({ issuer: 'other.com' }); // Issuer ≠ sender
    const encoded = encodeCapsule(capsule);

    const sig = await signCapsule(encoded, keys.privateKey, {
      issuer: 'other.com',
      kid: keys.kid,
      nonce: 'n1',
      exp: Math.floor(Date.now() / 1000) + 3600,
    });

    const result = await evaluateTrust(
      capsule,
      sig,
      {
        senderEmail: 'alice@trusted.com',
        senderDomain: 'trusted.com',
        policy: defaultPolicy,
        publicKey: keys.publicKey,
        nonceTracker: new NonceTracker(),
      }
    );

    expect(result.tier).toBe(0);
    expect(result.dmarcAligned).toBe(false);
  });

  it('detects expired capsule (TTL exceeded)', async () => {
    const keys = await generateKeyPair();
    const capsule = makeCapsule({
      issued_at: Math.floor(Date.now() / 1000) - 25 * 60 * 60, // 25h ago
    });
    const encoded = encodeCapsule(capsule);

    const sig = await signCapsule(encoded, keys.privateKey, {
      issuer: 'trusted.com',
      kid: keys.kid,
      nonce: 'n1',
      exp: Math.floor(Date.now() / 1000) + 3600,
    });

    const result = await evaluateTrust(
      capsule,
      sig,
      {
        senderEmail: 'alice@trusted.com',
        senderDomain: 'trusted.com',
        policy: defaultPolicy,
        publicKey: keys.publicKey,
        nonceTracker: new NonceTracker(),
      }
    );

    expect(result.tier).toBe(0);
    expect(result.withinTtl).toBe(false);
  });

  it('detects nonce replay', async () => {
    const keys = await generateKeyPair();
    const capsule = makeCapsule();
    const encoded = encodeCapsule(capsule);

    const sig = await signCapsule(encoded, keys.privateKey, {
      issuer: 'trusted.com',
      kid: keys.kid,
      nonce: 'n1',
      exp: Math.floor(Date.now() / 1000) + 3600,
    });

    const tracker = new NonceTracker();
    const ctx = {
      senderEmail: 'alice@trusted.com',
      senderDomain: 'trusted.com',
      policy: defaultPolicy,
      publicKey: keys.publicKey,
      nonceTracker: tracker,
    };

    // First evaluation — should succeed
    const first = await evaluateTrust(capsule, sig, ctx);
    expect(first.tier).toBe(1);

    // Second evaluation with same nonce — should fail
    const second = await evaluateTrust(capsule, sig, ctx);
    expect(second.tier).toBe(0);
    expect(second.nonceValid).toBe(false);
  });

  it('returns Tier 0 for untrusted domain even with valid signature', async () => {
    const keys = await generateKeyPair();
    const capsule = makeCapsule({ issuer: 'unknown.com' });
    const encoded = encodeCapsule(capsule);

    const sig = await signCapsule(encoded, keys.privateKey, {
      issuer: 'unknown.com',
      kid: keys.kid,
      nonce: 'n1',
      exp: Math.floor(Date.now() / 1000) + 3600,
    });

    const result = await evaluateTrust(
      capsule,
      sig,
      {
        senderEmail: 'alice@unknown.com',
        senderDomain: 'unknown.com',
        policy: defaultPolicy,
        publicKey: keys.publicKey,
        nonceTracker: new NonceTracker(),
      }
    );

    expect(result.tier).toBe(0);
    expect(result.signatureValid).toBe(true);
    expect(result.issuerAllowed).toBe(false);
  });
});
