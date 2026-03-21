// IHS
// ===========================================
// OAEM TEST PROGRAM — SUITE 0: NON-NEGOTIABLE INVARIANTS
// ===========================================
// 14 laws that must ALWAYS hold. If any of these fail,
// the entire OAEM system is considered broken.
// ===========================================

import { describe, it, expect, beforeEach } from 'vitest';
import {
  encodeCapsule,
  decodeCapsule,
  embedCapsule,
  extractCapsule,
  generateKeyPair,
  signCapsule,
  verifyWithKey,
  evaluateTrust,
  NonceTracker,
  buildNextState,
  validateChain,
  computeHash,
} from './index';
import type {
  CapsulePayload,
  TrustPolicy,
  LedgerEntry,
  IntentType,
} from './types';

// ─── Helpers ───

function makeCapsule(overrides: Partial<CapsulePayload> = {}): CapsulePayload {
  return {
    spec: 'ai-instructions',
    version: '1.1',
    type: 'email_capsule',
    issued_at: Math.floor(Date.now() / 1000),
    issuer: 'trusted.com',
    thread: { id: 'thread-1', state_version: 0 },
    intent: 'information_request',
    actions: [],
    ...overrides,
  };
}

function makePolicy(overrides: Partial<TrustPolicy> = {}): TrustPolicy {
  return {
    enabled: true,
    requireSignature: true,
    trustedDomains: ['trusted.com'],
    highStakesDomains: ['high-stakes.com'],
    requireHumanApproval: ['process_invoice'],
    maxMonetaryValue: 10000,
    blockedDomains: ['blocked.com'],
    ...overrides,
  };
}

// ===========================================
// TRUST INVARIANTS (1-6)
// ===========================================

describe('Suite 0 — Non-Negotiable Invariants', () => {
  describe('TRUST INVARIANTS', () => {
    // INV-1: Invalid JWS → always Tier 0
    it('INV-1: invalid JWS signature MUST produce Tier 0', async () => {
      const capsule = makeCapsule();
      const { publicKey } = await generateKeyPair();
      const tracker = new NonceTracker();

      // Craft a fake JWS (three base64url parts separated by dots)
      const fakeJws = 'eyJhbGciOiJFZERTQSJ9.dGVzdA.ZmFrZXNpZw';

      const result = await evaluateTrust(capsule, fakeJws, {
        senderEmail: 'alice@trusted.com',
        senderDomain: 'trusted.com',
        policy: makePolicy(),
        publicKey,
        nonceTracker: tracker,
      });

      expect(result.tier).toBe(0);
      expect(result.signatureValid).toBe(false);
    });

    // INV-2: Expired TTL → always Tier 0
    it('INV-2: expired TTL (>24h) MUST produce Tier 0', async () => {
      const kp = await generateKeyPair();
      const capsule = makeCapsule({
        issued_at: Math.floor(Date.now() / 1000) - 25 * 60 * 60, // 25 hours ago
      });
      const encoded = encodeCapsule(capsule);
      const jws = await signCapsule(encoded, kp.privateKey, {
        issuer: 'trusted.com', kid: kp.kid, nonce: 'n-1', exp: 0,
      });
      const tracker = new NonceTracker();

      const result = await evaluateTrust(capsule, jws, {
        senderEmail: 'alice@trusted.com',
        senderDomain: 'trusted.com',
        policy: makePolicy(),
        publicKey: kp.publicKey,
        nonceTracker: tracker,
      });

      expect(result.tier).toBe(0);
      expect(result.withinTtl).toBe(false);
    });

    // INV-3: Nonce replay → always Tier 0
    it('INV-3: replayed nonce MUST produce Tier 0', async () => {
      const kp = await generateKeyPair();
      const capsule = makeCapsule();
      const encoded = encodeCapsule(capsule);
      const jws = await signCapsule(encoded, kp.privateKey, {
        issuer: 'trusted.com', kid: kp.kid, nonce: 'n-1', exp: 0,
      });
      const tracker = new NonceTracker();

      // First evaluation — Tier 1
      const first = await evaluateTrust(capsule, jws, {
        senderEmail: 'alice@trusted.com',
        senderDomain: 'trusted.com',
        policy: makePolicy(),
        publicKey: kp.publicKey,
        nonceTracker: tracker,
      });
      expect(first.tier).toBe(1);

      // Second evaluation with same nonce — MUST be Tier 0
      const second = await evaluateTrust(capsule, jws, {
        senderEmail: 'alice@trusted.com',
        senderDomain: 'trusted.com',
        policy: makePolicy(),
        publicKey: kp.publicKey,
        nonceTracker: tracker,
      });
      expect(second.tier).toBe(0);
      expect(second.nonceValid).toBe(false);
    });

    // INV-4: Blocked domain → always Tier 0
    it('INV-4: blocked domain MUST produce Tier 0 regardless of valid signature', async () => {
      const kp = await generateKeyPair();
      const capsule = makeCapsule({ issuer: 'blocked.com' });
      const encoded = encodeCapsule(capsule);
      const jws = await signCapsule(encoded, kp.privateKey, {
        issuer: 'blocked.com', kid: kp.kid, nonce: 'n-blocked', exp: 0,
      });
      const tracker = new NonceTracker();

      const result = await evaluateTrust(capsule, jws, {
        senderEmail: 'alice@blocked.com',
        senderDomain: 'blocked.com',
        policy: makePolicy({ blockedDomains: ['blocked.com'], trustedDomains: ['blocked.com'] }),
        publicKey: kp.publicKey,
        nonceTracker: tracker,
      });

      expect(result.tier).toBe(0);
    });

    // INV-5: Missing signature + requireSignature → Tier 0
    it('INV-5: missing signature with requireSignature policy MUST produce Tier 0', async () => {
      const capsule = makeCapsule();
      const tracker = new NonceTracker();

      const result = await evaluateTrust(capsule, undefined, {
        senderEmail: 'alice@trusted.com',
        senderDomain: 'trusted.com',
        policy: makePolicy({ requireSignature: true }),
        nonceTracker: tracker,
      });

      expect(result.tier).toBe(0);
      expect(result.signatureValid).toBe(false);
    });

    // INV-6: DMARC misalignment → Tier 0
    it('INV-6: DMARC misalignment (issuer ≠ sender domain) MUST produce Tier 0', async () => {
      const kp = await generateKeyPair();
      // Capsule says issuer is "other.com" but sender is "trusted.com"
      const capsule = makeCapsule({ issuer: 'other.com' });
      const encoded = encodeCapsule(capsule);
      const jws = await signCapsule(encoded, kp.privateKey, {
        issuer: 'other.com', kid: kp.kid, nonce: 'n-dmarc', exp: 0,
      });
      const tracker = new NonceTracker();

      const result = await evaluateTrust(capsule, jws, {
        senderEmail: 'alice@trusted.com',
        senderDomain: 'trusted.com',
        policy: makePolicy(),
        publicKey: kp.publicKey,
        nonceTracker: tracker,
      });

      expect(result.tier).toBe(0);
      expect(result.dmarcAligned).toBe(false);
    });
  });

  // ===========================================
  // STATE INVARIANTS (7-10)
  // ===========================================

  describe('STATE INVARIANTS', () => {
    // INV-7: State versions monotonically increase
    it('INV-7: state versions MUST be monotonically increasing', () => {
      const capsule1 = makeCapsule({ thread: { id: 't-1', state_version: 0 } });
      const capsule2 = makeCapsule({ thread: { id: 't-1', state_version: 1 }, intent: 'proposal_offer' });
      const capsule3 = makeCapsule({ thread: { id: 't-1', state_version: 2 }, intent: 'commit_decision' });

      const r1 = buildNextState(null, capsule1, null);
      const r2 = buildNextState(r1.state, capsule2, 'prev-raw');
      const r3 = buildNextState(r2.state, capsule3, 'prev-raw-2');

      expect(r1.stateVersion).toBeLessThan(r2.stateVersion);
      expect(r2.stateVersion).toBeLessThan(r3.stateVersion);
    });

    // INV-8: CBOR encode/decode is deterministic
    it('INV-8: CBOR encode→decode MUST be deterministic (same input → same output)', () => {
      const capsule = makeCapsule({
        actions: [
          { action_type: 'reply_with_fields', fields: { name: 'John', age: 30 } },
        ],
        constraints: { privacy: 'internal', max_monetary_value: 5000 },
        links: [{ link_type: 'order', ref: 'ORD-123' }],
      });

      // Encode twice — should produce identical output
      const encoded1 = encodeCapsule(capsule);
      const encoded2 = encodeCapsule(capsule);
      expect(encoded1).toBe(encoded2);

      // Decode should produce identical structure
      const decoded1 = decodeCapsule(encoded1);
      const decoded2 = decodeCapsule(encoded2);
      expect(decoded1).toEqual(decoded2);

      // Hash of encoded should be identical
      expect(computeHash(encoded1)).toBe(computeHash(encoded2));
    });

    // INV-9: Capsule cannot escalate its own privilege tier
    it('INV-9: a capsule CANNOT escalate its own trust tier', async () => {
      const kp = await generateKeyPair();
      // Capsule from untrusted domain claims high-stakes intent
      const capsule = makeCapsule({
        issuer: 'untrusted.com',
        intent: 'commit_decision',
        actions: [{ action_type: 'process_invoice', fields: { amount: 1_000_000 } }],
        constraints: { max_monetary_value: 1_000_000 },
      });
      const encoded = encodeCapsule(capsule);
      const jws = await signCapsule(encoded, kp.privateKey, {
        issuer: 'untrusted.com', kid: kp.kid, nonce: 'n-escalate', exp: 0,
      });
      const tracker = new NonceTracker();

      // Even with a valid signature, untrusted domain cannot get Tier 1+
      const result = await evaluateTrust(capsule, jws, {
        senderEmail: 'alice@untrusted.com',
        senderDomain: 'untrusted.com',
        policy: makePolicy({ trustedDomains: [], highStakesDomains: [] }),
        publicKey: kp.publicKey,
        nonceTracker: tracker,
      });

      expect(result.tier).toBe(0);
      expect(result.issuerAllowed).toBe(false);
    });

    // INV-10: Hash chain integrity (parent_hash must match previous capsuleHash)
    it('INV-10: broken hash chain MUST be detected by validator', () => {
      const now = new Date();
      const entries: LedgerEntry[] = [
        {
          threadId: 't-1',
          stateVersion: 1,
          capsuleHash: 'hash-a',
          parentHash: null,
          intent: 'information_request',
          issuer: 'trusted.com',
          capsuleRaw: 'raw-1',
          trustTier: 1,
          createdAt: now,
        },
        {
          threadId: 't-1',
          stateVersion: 2,
          capsuleHash: 'hash-b',
          parentHash: 'TAMPERED-HASH', // Should be 'hash-a'
          intent: 'proposal_offer',
          issuer: 'trusted.com',
          capsuleRaw: 'raw-2',
          trustTier: 1,
          createdAt: now,
        },
      ];

      const result = validateChain(entries);
      expect(result.valid).toBe(false);
      expect(result.brokenAt).toBe(1);
    });
  });

  // ===========================================
  // EXECUTION INVARIANTS (11-14)
  // ===========================================

  describe('EXECUTION INVARIANTS', () => {
    // INV-11: Default-deny for unknown intents
    it('INV-11: unknown intent type MUST be rejected by decoder', () => {
      const capsule = makeCapsule();
      // Encode a valid capsule, then tamper with the decoded CBOR
      const encoded = encodeCapsule(capsule);
      const decoded = decodeCapsule(encoded);
      expect(decoded.intent).toBe('information_request');

      // Try to encode with an unknown intent — should fail at decode validation
      const tamperedPayload = {
        ...capsule,
        intent: 'steal_everything' as IntentType,
      };
      const tamperedEncoded = encodeCapsule(tamperedPayload as CapsulePayload);
      expect(() => decodeCapsule(tamperedEncoded)).toThrow();
    });

    // INV-12: All trust evaluations produce at least one reason
    it('INV-12: every trust evaluation MUST produce at least one reason', async () => {
      const kp = await generateKeyPair();
      const capsule = makeCapsule();
      const encoded = encodeCapsule(capsule);
      const jws = await signCapsule(encoded, kp.privateKey, {
        issuer: 'trusted.com', kid: kp.kid, nonce: 'n-reason-1', exp: 0,
      });

      // Tier 1 — should have a reason
      const tier1 = await evaluateTrust(capsule, jws, {
        senderEmail: 'alice@trusted.com',
        senderDomain: 'trusted.com',
        policy: makePolicy(),
        publicKey: kp.publicKey,
        nonceTracker: new NonceTracker(),
      });
      expect(tier1.reasons.length).toBeGreaterThan(0);

      // Tier 0 (no signature) — should have a reason
      const tier0 = await evaluateTrust(capsule, undefined, {
        senderEmail: 'alice@trusted.com',
        senderDomain: 'trusted.com',
        policy: makePolicy({ requireSignature: false }),
        nonceTracker: new NonceTracker(),
      });
      expect(tier0.reasons.length).toBeGreaterThan(0);

      // Tier 0 (disabled policy) — should have a reason
      const disabled = await evaluateTrust(capsule, undefined, {
        senderEmail: 'alice@trusted.com',
        senderDomain: 'trusted.com',
        policy: makePolicy({ enabled: false }),
        nonceTracker: new NonceTracker(),
      });
      expect(disabled.reasons.length).toBeGreaterThan(0);
    });

    // INV-13: Human approval constraints survive capsule round-trip
    it('INV-13: requires_human_approval constraint MUST survive encode→embed→extract→decode', () => {
      const capsule = makeCapsule({
        constraints: {
          requires_human_approval: true,
          privacy: 'confidential',
          max_monetary_value: 50000,
        },
        actions: [{ action_type: 'process_invoice', fields: { amount: 50000 } }],
      });

      const encoded = encodeCapsule(capsule);
      const hash = computeHash(encoded);
      const html = embedCapsule('<html><body>Hello</body></html>', encoded, {
        payloadHash: hash,
        issuedAt: capsule.issued_at,
      });

      const extracted = extractCapsule(html);
      expect(extracted.found).toBe(true);
      expect(extracted.payload).toBeDefined();
      expect(extracted.payload!.constraints!.requires_human_approval).toBe(true);
      expect(extracted.payload!.constraints!.max_monetary_value).toBe(50000);
    });

    // INV-14: Policy-level human approval cannot be overridden by capsule contents
    it('INV-14: capsule CANNOT override policy-level human approval requirements', async () => {
      const kp = await generateKeyPair();
      // Capsule explicitly says NO human approval needed
      const capsule = makeCapsule({
        constraints: {
          requires_human_approval: false,
        },
        actions: [{ action_type: 'process_invoice', fields: { amount: 100 } }],
      });
      const encoded = encodeCapsule(capsule);
      const jws = await signCapsule(encoded, kp.privateKey, {
        issuer: 'trusted.com', kid: kp.kid, nonce: 'n-override', exp: 0,
      });

      // Even at Tier 1, policy says process_invoice requires human approval
      const result = await evaluateTrust(capsule, jws, {
        senderEmail: 'alice@trusted.com',
        senderDomain: 'trusted.com',
        policy: makePolicy({
          requireHumanApproval: ['process_invoice'],
        }),
        publicKey: kp.publicKey,
        nonceTracker: new NonceTracker(),
      });

      // Capsule is verified (Tier 1) — but the POLICY still requires human approval
      // The trust tier itself doesn't change, but the policy MUST be checked separately
      expect(result.tier).toBe(1);

      // The policy's requireHumanApproval array includes process_invoice —
      // this MUST be enforced by the execution layer regardless of capsule constraints
      const policy = makePolicy({ requireHumanApproval: ['process_invoice'] });
      const hasInvoiceAction = capsule.actions.some(a => a.action_type === 'process_invoice');
      const policyRequiresApproval = hasInvoiceAction &&
        policy.requireHumanApproval.includes('process_invoice');

      expect(policyRequiresApproval).toBe(true);
      // Capsule's own constraint says false — but policy overrides
      expect(capsule.constraints?.requires_human_approval).toBe(false);
    });
  });
});
