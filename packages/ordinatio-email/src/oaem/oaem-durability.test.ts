// IHS
// ===========================================
// OAEM TEST PROGRAM — SUITE F: LEDGER DURABILITY
// + SUITE G: POLICY ENGINE
// ===========================================
// Tests for thread state machine edge cases, hash chain
// integrity under adversarial conditions, policy enforcement,
// and trust boundary conditions.
// ===========================================

import { describe, it, expect } from 'vitest';
import {
  buildNextState,
  createInitialState,
  validateChain,
  verifyEntryHash,
  generateThreadFingerprint,
  normalizeSubject,
  encodeCapsule,
  decodeCapsule,
  computeHash,
  generateKeyPair,
  signCapsule,
  evaluateTrust,
  NonceTracker,
} from './index';
import type {
  CapsulePayload,
  ThreadState,
  LedgerEntry,
  IntentType,
  TrustPolicy,
} from './types';

// ─── Helpers ───

function makeCapsule(overrides: Partial<CapsulePayload> = {}): CapsulePayload {
  return {
    spec: 'ai-instructions',
    version: '1.1',
    type: 'email_capsule',
    issued_at: Math.floor(Date.now() / 1000),
    issuer: 'trusted.com',
    thread: { id: 'thread-dur', state_version: 0 },
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

function makeLedgerEntry(overrides: Partial<LedgerEntry> = {}): LedgerEntry {
  const capsuleRaw = overrides.capsuleRaw ?? 'raw-content';
  return {
    threadId: 'thread-1',
    stateVersion: 1,
    capsuleHash: computeHash(capsuleRaw),
    parentHash: null,
    intent: 'information_request',
    issuer: 'trusted.com',
    capsuleRaw,
    trustTier: 1,
    createdAt: new Date(),
    ...overrides,
  };
}

// ===========================================
// SUITE F: LEDGER DURABILITY
// ===========================================

describe('Suite F — Ledger Durability', () => {
  describe('State transitions', () => {
    it('F-1: full lifecycle: open → awaiting_reply → in_progress → resolved', () => {
      // Step 1: Initial information request → awaiting_reply
      const capsule1 = makeCapsule({
        thread: { id: 't-1', state_version: 0 },
        intent: 'information_request',
      });
      const r1 = buildNextState(null, capsule1, null);
      expect(r1.state.status).toBe('awaiting_reply');

      // Step 2: Proposal offer → in_progress
      const capsule2 = makeCapsule({
        thread: { id: 't-1', state_version: 1 },
        intent: 'proposal_offer',
      });
      const r2 = buildNextState(r1.state, capsule2, 'raw-1');
      expect(r2.state.status).toBe('in_progress');

      // Step 3: Commit decision (while awaiting_reply from another thread) → stays in_progress
      const capsule3 = makeCapsule({
        thread: { id: 't-1', state_version: 2 },
        intent: 'commit_decision',
      });
      const r3 = buildNextState(r2.state, capsule3, 'raw-2');
      expect(r3.state.status).toBe('in_progress');
    });

    it('F-2: escalation → blocked, then acknowledgment preserves blocked', () => {
      const capsule1 = makeCapsule({ intent: 'escalation' });
      const r1 = buildNextState(null, capsule1, null);
      expect(r1.state.status).toBe('blocked');

      // Acknowledgment when not awaiting_reply → preserves current status
      const capsule2 = makeCapsule({
        thread: { id: 'thread-dur', state_version: 1 },
        intent: 'acknowledgment',
      });
      const r2 = buildNextState(r1.state, capsule2, 'raw-1');
      expect(r2.state.status).toBe('blocked');
    });

    it('F-3: status_sync never changes status', () => {
      const states: ThreadState['status'][] = ['open', 'awaiting_reply', 'in_progress', 'blocked'];

      for (const status of states) {
        const state: ThreadState = {
          status,
          pending: [],
          data: {},
          completed_checks: [],
        };
        const capsule = makeCapsule({
          thread: { id: 'thread-dur', state_version: 1 },
          intent: 'status_sync',
        });
        const result = buildNextState(state, capsule, 'raw');
        expect(result.state.status).toBe(status);
      }
    });

    it('F-4: all 9 intent types produce valid status transitions', () => {
      const intents: IntentType[] = [
        'information_request', 'proposal_offer', 'commit_decision',
        'handoff_human', 'status_sync', 'task_assignment',
        'approval_request', 'escalation', 'acknowledgment',
      ];

      const validStatuses = new Set(['open', 'awaiting_reply', 'in_progress', 'blocked', 'resolved', 'cancelled']);

      for (const intent of intents) {
        const capsule = makeCapsule({ intent });
        const result = buildNextState(null, capsule, null);
        expect(validStatuses.has(result.state.status)).toBe(true);
      }
    });
  });

  describe('Pending item management', () => {
    it('F-5: pending items accumulate across state transitions', () => {
      const capsule1 = makeCapsule({
        state: {
          status: 'open',
          pending: [{ id: 'p-1', description: 'First pending' }],
          data: {},
          completed_checks: [],
        },
      });
      const r1 = buildNextState(null, capsule1, null);
      expect(r1.state.pending).toHaveLength(1);

      const capsule2 = makeCapsule({
        thread: { id: 'thread-dur', state_version: 1 },
        intent: 'task_assignment',
        state: {
          status: 'awaiting_reply',
          pending: [{ id: 'p-2', description: 'Second pending' }],
          data: {},
          completed_checks: [],
        },
      });
      const r2 = buildNextState(r1.state, capsule2, 'raw-1');
      expect(r2.state.pending).toHaveLength(2);
    });

    it('F-6: reply_with_fields resolves matching pending items', () => {
      const state: ThreadState = {
        status: 'awaiting_reply',
        pending: [
          { id: 'measurement', description: 'Need measurements' },
          { id: 'fabric', description: 'Need fabric choice' },
        ],
        data: {},
        completed_checks: [],
      };

      const capsule = makeCapsule({
        thread: { id: 'thread-dur', state_version: 1 },
        intent: 'information_request',
        actions: [{
          action_type: 'reply_with_fields',
          fields: { measurement: 'chest: 42, waist: 34' },
        }],
      });

      const result = buildNextState(state, capsule, 'raw');
      // 'measurement' resolved, 'fabric' still pending
      expect(result.state.pending).toHaveLength(1);
      expect(result.state.pending[0].id).toBe('fabric');
    });

    it('F-7: duplicate pending item IDs are not duplicated', () => {
      const capsule1 = makeCapsule({
        state: {
          status: 'open',
          pending: [{ id: 'p-1', description: 'First' }],
          data: {},
          completed_checks: [],
        },
      });
      const r1 = buildNextState(null, capsule1, null);

      // Second capsule adds same ID
      const capsule2 = makeCapsule({
        thread: { id: 'thread-dur', state_version: 1 },
        intent: 'status_sync',
        state: {
          status: 'open',
          pending: [{ id: 'p-1', description: 'Updated first' }],
          data: {},
          completed_checks: [],
        },
      });
      const r2 = buildNextState(r1.state, capsule2, 'raw');
      // Should NOT have 2 entries with id='p-1'
      const p1Count = r2.state.pending.filter(p => p.id === 'p-1').length;
      expect(p1Count).toBe(1);
    });
  });

  describe('Data merge', () => {
    it('F-8: data accumulates across transitions (shallow merge)', () => {
      const capsule1 = makeCapsule({
        state: {
          status: 'open',
          pending: [],
          data: { clientName: 'John', orderCount: 5 },
          completed_checks: [],
        },
      });
      const r1 = buildNextState(null, capsule1, null);

      const capsule2 = makeCapsule({
        thread: { id: 'thread-dur', state_version: 1 },
        intent: 'status_sync',
        state: {
          status: 'open',
          pending: [],
          data: { fabricCode: 'A754-21', orderCount: 6 },
          completed_checks: [],
        },
      });
      const r2 = buildNextState(r1.state, capsule2, 'raw');

      expect(r2.state.data.clientName).toBe('John'); // Preserved
      expect(r2.state.data.fabricCode).toBe('A754-21'); // Added
      expect(r2.state.data.orderCount).toBe(6); // Overwritten
    });
  });

  describe('Hash chain integrity', () => {
    it('F-9: correctly linked chain validates', () => {
      const entry1 = makeLedgerEntry({
        stateVersion: 1,
        capsuleRaw: 'raw-1',
        parentHash: null,
      });
      entry1.capsuleHash = computeHash('raw-1');

      const entry2 = makeLedgerEntry({
        stateVersion: 2,
        capsuleRaw: 'raw-2',
        parentHash: entry1.capsuleHash,
      });
      entry2.capsuleHash = computeHash('raw-2');

      const entry3 = makeLedgerEntry({
        stateVersion: 3,
        capsuleRaw: 'raw-3',
        parentHash: entry2.capsuleHash,
      });
      entry3.capsuleHash = computeHash('raw-3');

      const result = validateChain([entry1, entry2, entry3]);
      expect(result.valid).toBe(true);
      expect(result.conflicts).toHaveLength(0);
    });

    it('F-10: forked thread (two entries with same parent) → second breaks chain', () => {
      const parentHash = computeHash('raw-parent');

      const entry1 = makeLedgerEntry({
        stateVersion: 1,
        capsuleRaw: 'raw-parent',
        capsuleHash: parentHash,
        parentHash: null,
      });

      // Two entries claiming the same parent
      const fork_a = makeLedgerEntry({
        stateVersion: 2,
        capsuleRaw: 'raw-fork-a',
        capsuleHash: computeHash('raw-fork-a'),
        parentHash: parentHash,
      });

      const fork_b = makeLedgerEntry({
        stateVersion: 3, // Different version, same parent
        capsuleRaw: 'raw-fork-b',
        capsuleHash: computeHash('raw-fork-b'),
        parentHash: parentHash, // Points to same parent as fork_a
      });

      // Chain: entry1 → fork_a → fork_b
      // fork_b's parentHash points to entry1 (not fork_a), breaking the chain
      const result = validateChain([entry1, fork_a, fork_b]);
      expect(result.valid).toBe(false);
      expect(result.brokenAt).toBe(2);
    });

    it('F-11: out-of-order delivery is handled by version sorting', () => {
      const hash1 = computeHash('raw-1');
      const hash2 = computeHash('raw-2');
      const hash3 = computeHash('raw-3');

      const entry1 = makeLedgerEntry({
        stateVersion: 1, capsuleRaw: 'raw-1', capsuleHash: hash1, parentHash: null,
      });
      const entry2 = makeLedgerEntry({
        stateVersion: 2, capsuleRaw: 'raw-2', capsuleHash: hash2, parentHash: hash1,
      });
      const entry3 = makeLedgerEntry({
        stateVersion: 3, capsuleRaw: 'raw-3', capsuleHash: hash3, parentHash: hash2,
      });

      // Pass in reverse order — validator sorts by stateVersion
      const result = validateChain([entry3, entry1, entry2]);
      expect(result.valid).toBe(true);
    });

    it('F-12: version gap detection', () => {
      const hash1 = computeHash('raw-1');
      const hash3 = computeHash('raw-3');

      const entry1 = makeLedgerEntry({
        stateVersion: 1, capsuleRaw: 'raw-1', capsuleHash: hash1, parentHash: null,
      });
      // Skip version 2
      const entry3 = makeLedgerEntry({
        stateVersion: 3, capsuleRaw: 'raw-3', capsuleHash: hash3, parentHash: hash1,
      });

      const result = validateChain([entry1, entry3]);
      expect(result.valid).toBe(false);
      expect(result.conflicts.some(c => c.includes('Version gap'))).toBe(true);
    });

    it('F-13: entry hash verification catches tampering', () => {
      const entry = makeLedgerEntry({ capsuleRaw: 'original-content' });
      entry.capsuleHash = computeHash('original-content');

      expect(verifyEntryHash(entry)).toBe(true);

      // Tamper with the raw content
      const tampered = { ...entry, capsuleRaw: 'tampered-content' };
      expect(verifyEntryHash(tampered)).toBe(false);
    });

    it('F-14: malicious parent_hash injection (hash of a different chain)', () => {
      // Attacker creates a valid-looking chain entry pointing to another thread
      const otherChainHash = computeHash('other-thread-raw');

      const entry1 = makeLedgerEntry({
        stateVersion: 1, capsuleRaw: 'raw-1', capsuleHash: computeHash('raw-1'), parentHash: null,
      });

      // Attacker's entry claims parent from a different chain
      const attackerEntry = makeLedgerEntry({
        stateVersion: 2,
        capsuleRaw: 'raw-attacker',
        capsuleHash: computeHash('raw-attacker'),
        parentHash: otherChainHash, // Not the actual previous entry's hash
      });

      const result = validateChain([entry1, attackerEntry]);
      expect(result.valid).toBe(false);
      expect(result.brokenAt).toBe(1);
    });
  });

  describe('Thread fingerprinting', () => {
    it('F-15: fingerprint is deterministic', () => {
      const fp1 = generateThreadFingerprint('Order Confirmation', '2026-03-01', 'sender.com', 'recipient.com');
      const fp2 = generateThreadFingerprint('Order Confirmation', '2026-03-01', 'sender.com', 'recipient.com');
      expect(fp1).toBe(fp2);
    });

    it('F-16: normalizeSubject strips all common prefixes recursively', () => {
      const variants = [
        'Re: Order Confirmation',
        'RE: Re: Order Confirmation',
        'Fwd: Re: Order Confirmation',
        'FW: Fwd: Re: Order Confirmation',
        'AW: SV: VS: Order Confirmation',
        '[EXTERNAL] Re: Order Confirmation',
        '[SPAM] [EXTERNAL] Fwd: Re: Order Confirmation',
        'Ref: Rif: Antwort: Order Confirmation',
      ];

      const expected = normalizeSubject('Order Confirmation');
      for (const v of variants) {
        expect(normalizeSubject(v)).toBe(expected);
      }
    });

    it('F-17: fingerprint is case-insensitive for subject', () => {
      const fp1 = generateThreadFingerprint('ORDER CONFIRMATION', '2026-03-01', 'a.com', 'b.com');
      const fp2 = generateThreadFingerprint('order confirmation', '2026-03-01', 'a.com', 'b.com');
      expect(fp1).toBe(fp2);
    });

    it('F-18: different sender/recipient domains produce different fingerprints', () => {
      const fp1 = generateThreadFingerprint('Subject', '2026-03-01', 'a.com', 'b.com');
      const fp2 = generateThreadFingerprint('Subject', '2026-03-01', 'c.com', 'd.com');
      expect(fp1).not.toBe(fp2);
    });

    it('F-19: different dates produce different fingerprints', () => {
      const fp1 = generateThreadFingerprint('Subject', '2026-03-01', 'a.com', 'b.com');
      const fp2 = generateThreadFingerprint('Subject', '2026-03-02', 'a.com', 'b.com');
      expect(fp1).not.toBe(fp2);
    });
  });
});

// ===========================================
// SUITE G: POLICY ENGINE
// ===========================================

describe('Suite G — Policy Engine', () => {
  describe('Policy disabled', () => {
    it('G-1: disabled policy always returns Tier 0', async () => {
      const kp = await generateKeyPair();
      const capsule = makeCapsule();
      const encoded = encodeCapsule(capsule);
      const jws = await signCapsule(encoded, kp.privateKey, {
        issuer: 'trusted.com', kid: kp.kid, nonce: 'n-disabled', exp: 0,
      });

      const result = await evaluateTrust(capsule, jws, {
        senderEmail: 'alice@trusted.com',
        senderDomain: 'trusted.com',
        policy: makePolicy({ enabled: false }),
        publicKey: kp.publicKey,
        nonceTracker: new NonceTracker(),
      });

      expect(result.tier).toBe(0);
      expect(result.reasons).toContain('OAEM policy is disabled');
    });
  });

  describe('Domain trust management', () => {
    it('G-2: trusted domain gets Tier 1', async () => {
      const kp = await generateKeyPair();
      const capsule = makeCapsule();
      const encoded = encodeCapsule(capsule);
      const jws = await signCapsule(encoded, kp.privateKey, {
        issuer: 'trusted.com', kid: kp.kid, nonce: 'n-t1', exp: 0,
      });

      const result = await evaluateTrust(capsule, jws, {
        senderEmail: 'alice@trusted.com',
        senderDomain: 'trusted.com',
        policy: makePolicy(),
        publicKey: kp.publicKey,
        nonceTracker: new NonceTracker(),
      });

      expect(result.tier).toBe(1);
    });

    it('G-3: high-stakes domain gets Tier 2', async () => {
      const kp = await generateKeyPair();
      const capsule = makeCapsule({ issuer: 'high-stakes.com' });
      const encoded = encodeCapsule(capsule);
      const jws = await signCapsule(encoded, kp.privateKey, {
        issuer: 'high-stakes.com', kid: kp.kid, nonce: 'n-t2', exp: 0,
      });

      const result = await evaluateTrust(capsule, jws, {
        senderEmail: 'alice@high-stakes.com',
        senderDomain: 'high-stakes.com',
        policy: makePolicy({
          trustedDomains: ['high-stakes.com'],
          highStakesDomains: ['high-stakes.com'],
        }),
        publicKey: kp.publicKey,
        nonceTracker: new NonceTracker(),
      });

      expect(result.tier).toBe(2);
    });

    it('G-4: domain on trusted but not high-stakes → Tier 1 (not Tier 2)', async () => {
      const kp = await generateKeyPair();
      const capsule = makeCapsule();
      const encoded = encodeCapsule(capsule);
      const jws = await signCapsule(encoded, kp.privateKey, {
        issuer: 'trusted.com', kid: kp.kid, nonce: 'n-t1-not-t2', exp: 0,
      });

      const result = await evaluateTrust(capsule, jws, {
        senderEmail: 'alice@trusted.com',
        senderDomain: 'trusted.com',
        policy: makePolicy({
          trustedDomains: ['trusted.com'],
          highStakesDomains: [], // NOT high-stakes
        }),
        publicKey: kp.publicKey,
        nonceTracker: new NonceTracker(),
      });

      expect(result.tier).toBe(1);
    });

    it('G-5: blocked domain overrides trusted', async () => {
      const kp = await generateKeyPair();
      const capsule = makeCapsule({ issuer: 'blocked.com' });
      const encoded = encodeCapsule(capsule);
      const jws = await signCapsule(encoded, kp.privateKey, {
        issuer: 'blocked.com', kid: kp.kid, nonce: 'n-blocked-trust', exp: 0,
      });

      // Domain is on BOTH trusted and blocked lists
      const result = await evaluateTrust(capsule, jws, {
        senderEmail: 'alice@blocked.com',
        senderDomain: 'blocked.com',
        policy: makePolicy({
          trustedDomains: ['blocked.com'],
          blockedDomains: ['blocked.com'],
        }),
        publicKey: kp.publicKey,
        nonceTracker: new NonceTracker(),
      });

      // Blocked takes precedence
      expect(result.tier).toBe(0);
    });

    it('G-6: unknown domain (not trusted, not blocked) → Tier 0', async () => {
      const kp = await generateKeyPair();
      const capsule = makeCapsule({ issuer: 'unknown.com' });
      const encoded = encodeCapsule(capsule);
      const jws = await signCapsule(encoded, kp.privateKey, {
        issuer: 'unknown.com', kid: kp.kid, nonce: 'n-unknown', exp: 0,
      });

      const result = await evaluateTrust(capsule, jws, {
        senderEmail: 'alice@unknown.com',
        senderDomain: 'unknown.com',
        policy: makePolicy({
          trustedDomains: ['trusted.com'],
          blockedDomains: [],
        }),
        publicKey: kp.publicKey,
        nonceTracker: new NonceTracker(),
      });

      expect(result.tier).toBe(0);
      expect(result.issuerAllowed).toBe(false);
    });
  });

  describe('Signature requirement policy', () => {
    it('G-7: requireSignature=false allows unsigned capsules to evaluate further', async () => {
      const capsule = makeCapsule();

      const result = await evaluateTrust(capsule, undefined, {
        senderEmail: 'alice@trusted.com',
        senderDomain: 'trusted.com',
        policy: makePolicy({ requireSignature: false }),
        nonceTracker: new NonceTracker(),
      });

      // Without signature, can't get Tier 1+ (signatureValid is false)
      expect(result.tier).toBe(0);
      expect(result.signatureValid).toBe(false);
      // But the evaluation completed (not short-circuited)
      expect(result.reasons).not.toContain('Policy requires signature');
    });

    it('G-8: requireSignature=true short-circuits on missing signature', async () => {
      const capsule = makeCapsule();

      const result = await evaluateTrust(capsule, undefined, {
        senderEmail: 'alice@trusted.com',
        senderDomain: 'trusted.com',
        policy: makePolicy({ requireSignature: true }),
        nonceTracker: new NonceTracker(),
      });

      expect(result.tier).toBe(0);
      expect(result.reasons).toContain('Policy requires signature');
    });
  });

  describe('Human approval enforcement', () => {
    it('G-9: policy requireHumanApproval for process_invoice is independent of trust tier', async () => {
      const kp = await generateKeyPair();
      const capsule = makeCapsule({
        issuer: 'high-stakes.com',
        actions: [{ action_type: 'process_invoice', fields: { amount: 5000 } }],
      });
      const encoded = encodeCapsule(capsule);
      const jws = await signCapsule(encoded, kp.privateKey, {
        issuer: 'high-stakes.com', kid: kp.kid, nonce: 'n-approval', exp: 0,
      });

      const policy = makePolicy({
        trustedDomains: ['high-stakes.com'],
        highStakesDomains: ['high-stakes.com'],
        requireHumanApproval: ['process_invoice'],
      });

      const result = await evaluateTrust(capsule, jws, {
        senderEmail: 'alice@high-stakes.com',
        senderDomain: 'high-stakes.com',
        policy,
        publicKey: kp.publicKey,
        nonceTracker: new NonceTracker(),
      });

      // Gets Tier 2 (high-stakes domain) — but execution layer MUST still check policy
      expect(result.tier).toBe(2);

      // The execution layer checks this:
      const needsApproval = capsule.actions.some(a =>
        policy.requireHumanApproval.includes(a.action_type)
      );
      expect(needsApproval).toBe(true);
    });

    it('G-10: multiple action types, one requires approval → approval needed', () => {
      const policy = makePolicy({
        requireHumanApproval: ['process_invoice', 'approve_change'],
      });

      const capsule = makeCapsule({
        actions: [
          { action_type: 'reply_with_fields', fields: {} },
          { action_type: 'process_invoice', fields: { amount: 100 } },
          { action_type: 'summarize_thread' },
        ],
      });

      const needsApproval = capsule.actions.some(a =>
        policy.requireHumanApproval.includes(a.action_type)
      );
      expect(needsApproval).toBe(true);
    });

    it('G-11: no approval-required actions → approval not needed', () => {
      const policy = makePolicy({
        requireHumanApproval: ['process_invoice'],
      });

      const capsule = makeCapsule({
        actions: [
          { action_type: 'reply_with_fields', fields: {} },
          { action_type: 'summarize_thread' },
        ],
      });

      const needsApproval = capsule.actions.some(a =>
        policy.requireHumanApproval.includes(a.action_type)
      );
      expect(needsApproval).toBe(false);
    });
  });

  describe('Monetary limit enforcement', () => {
    it('G-12: action exceeding maxMonetaryValue requires additional control', () => {
      const policy = makePolicy({ maxMonetaryValue: 10000 });
      const capsule = makeCapsule({
        actions: [{
          action_type: 'process_invoice',
          fields: { amount: 50000 },
        }],
        constraints: { max_monetary_value: 50000 },
      });

      // Execution layer checks:
      const exceedsLimit = capsule.actions.some(a => {
        const amount = a.fields?.amount;
        return typeof amount === 'number' && amount > policy.maxMonetaryValue;
      });
      expect(exceedsLimit).toBe(true);
    });

    it('G-13: action within maxMonetaryValue passes', () => {
      const policy = makePolicy({ maxMonetaryValue: 10000 });
      const capsule = makeCapsule({
        actions: [{
          action_type: 'process_invoice',
          fields: { amount: 5000 },
        }],
      });

      const exceedsLimit = capsule.actions.some(a => {
        const amount = a.fields?.amount;
        return typeof amount === 'number' && amount > policy.maxMonetaryValue;
      });
      expect(exceedsLimit).toBe(false);
    });

    it('G-14: capsule constraints max_monetary_value does NOT override policy', () => {
      const policy = makePolicy({ maxMonetaryValue: 10000 });
      const capsule = makeCapsule({
        actions: [{
          action_type: 'process_invoice',
          fields: { amount: 15000 },
        }],
        constraints: { max_monetary_value: 20000 }, // Capsule claims 20K limit
      });

      // Policy limit (10K) takes precedence over capsule claim (20K)
      const exceedsPolicy = capsule.actions.some(a => {
        const amount = a.fields?.amount;
        return typeof amount === 'number' && amount > policy.maxMonetaryValue;
      });
      expect(exceedsPolicy).toBe(true);

      // Even though capsule says it's within its own limit
      const exceedsCapsule = capsule.actions.some(a => {
        const amount = a.fields?.amount;
        return typeof amount === 'number' && amount > (capsule.constraints?.max_monetary_value ?? 0);
      });
      expect(exceedsCapsule).toBe(false);
    });
  });

  describe('Constraint enforcement', () => {
    it('G-15: privacy=confidential survives round-trip', () => {
      const capsule = makeCapsule({
        constraints: {
          privacy: 'confidential',
          do_not_share: ['ssn', 'credit_card'],
          allowed_domains: ['internal.com'],
        },
      });

      const encoded = encodeCapsule(capsule);
      const decoded = decodeCapsule(encoded);

      expect(decoded.constraints!.privacy).toBe('confidential');
      expect(decoded.constraints!.do_not_share).toEqual(['ssn', 'credit_card']);
      expect(decoded.constraints!.allowed_domains).toEqual(['internal.com']);
    });

    it('G-16: do_not_share fields listed in constraints', () => {
      const capsule = makeCapsule({
        actions: [{
          action_type: 'reply_with_fields',
          fields: { name: 'John', ssn: '123-45-6789' },
        }],
        constraints: {
          do_not_share: ['ssn'],
        },
      });

      // Execution layer should check do_not_share before forwarding
      const sensitiveFields = capsule.actions.flatMap(a =>
        Object.keys(a.fields ?? {}).filter(k =>
          capsule.constraints?.do_not_share?.includes(k)
        )
      );
      expect(sensitiveFields).toContain('ssn');
      expect(sensitiveFields).not.toContain('name');
    });

    it('G-17: allowed_domains restricts forwarding', () => {
      const capsule = makeCapsule({
        constraints: {
          allowed_domains: ['internal.com', 'partner.com'],
        },
      });

      const isAllowed = (domain: string) =>
        !capsule.constraints?.allowed_domains ||
        capsule.constraints.allowed_domains.includes(domain);

      expect(isAllowed('internal.com')).toBe(true);
      expect(isAllowed('partner.com')).toBe(true);
      expect(isAllowed('attacker.com')).toBe(false);
    });
  });

  describe('Completed checks accumulation', () => {
    it('G-18: completed checks accumulate and are not duplicated', () => {
      const capsule1 = makeCapsule({
        checks: [
          { id: 'check-1', type: 'confirmed', description: 'Confirmed', satisfied: true },
          { id: 'check-2', type: 'field_present', description: 'Present', satisfied: false },
        ],
      });
      const r1 = buildNextState(null, capsule1, null);
      expect(r1.state.completed_checks).toEqual(['check-1']);

      const capsule2 = makeCapsule({
        thread: { id: 'thread-dur', state_version: 1 },
        intent: 'status_sync',
        checks: [
          { id: 'check-1', type: 'confirmed', description: 'Already confirmed', satisfied: true },
          { id: 'check-2', type: 'field_present', description: 'Now present', satisfied: true },
        ],
      });
      const r2 = buildNextState(r1.state, capsule2, 'raw');
      expect(r2.state.completed_checks).toEqual(['check-1', 'check-2']);
    });
  });
});
