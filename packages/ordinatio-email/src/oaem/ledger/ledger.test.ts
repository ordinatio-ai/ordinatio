// ===========================================
// LEDGER — TESTS (Builder, Validator, Fingerprint)
// ===========================================

import { describe, it, expect } from 'vitest';
import { buildNextState, createInitialState } from './ledger-builder';
import { validateChain, verifyEntryHash } from './ledger-validator';
import { generateThreadFingerprint, normalizeSubject } from './thread-fingerprint';
import { computeHash } from '../signing/hash';
import type { CapsulePayload, LedgerEntry, ThreadState } from './types';

function makeCapsule(overrides?: Partial<CapsulePayload>): CapsulePayload {
  return {
    spec: 'ai-instructions',
    version: '1.1',
    type: 'email_capsule',
    issued_at: Math.floor(Date.now() / 1000),
    issuer: '1701bespoke.com',
    thread: { id: 'thread-001', state_version: 0 },
    intent: 'information_request',
    actions: [],
    ...overrides,
  };
}

// ─── Ledger Builder ───

describe('buildNextState', () => {
  it('creates initial state from null', () => {
    const capsule = makeCapsule();
    const result = buildNextState(null, capsule, null);

    expect(result.stateVersion).toBe(1);
    expect(result.hash).toBeDefined();
    expect(result.state.status).toBe('awaiting_reply'); // information_request → awaiting_reply
    expect(result.state.pending).toEqual([]);
    expect(result.state.data).toEqual({});
    expect(result.state.completed_checks).toEqual([]);
  });

  it('increments state version', () => {
    const capsule = makeCapsule({ thread: { id: 't1', state_version: 3 } });
    const result = buildNextState(createInitialState(), capsule, null);
    expect(result.stateVersion).toBe(4);
  });

  it('resolves status from intent: proposal_offer → in_progress', () => {
    const capsule = makeCapsule({ intent: 'proposal_offer' });
    const result = buildNextState(null, capsule, null);
    expect(result.state.status).toBe('in_progress');
  });

  it('resolves status from intent: escalation → blocked', () => {
    const capsule = makeCapsule({ intent: 'escalation' });
    const result = buildNextState(null, capsule, null);
    expect(result.state.status).toBe('blocked');
  });

  it('resolves status from intent: handoff_human → blocked', () => {
    const capsule = makeCapsule({ intent: 'handoff_human' });
    const result = buildNextState(null, capsule, null);
    expect(result.state.status).toBe('blocked');
  });

  it('resolves status from intent: status_sync → preserves current', () => {
    const state: ThreadState = { ...createInitialState(), status: 'in_progress' };
    const capsule = makeCapsule({ intent: 'status_sync' });
    const result = buildNextState(state, capsule, null);
    expect(result.state.status).toBe('in_progress');
  });

  it('merges incoming data with existing state', () => {
    const state: ThreadState = {
      ...createInitialState(),
      data: { orderNumber: 'ORD-1', existingField: true },
    };
    const capsule = makeCapsule({
      state: {
        status: 'open',
        pending: [],
        data: { newField: 'hello', orderNumber: 'ORD-2' },
        completed_checks: [],
      },
    });

    const result = buildNextState(state, capsule, null);
    expect(result.state.data.existingField).toBe(true);
    expect(result.state.data.newField).toBe('hello');
    expect(result.state.data.orderNumber).toBe('ORD-2'); // Overwritten
  });

  it('marks completed checks', () => {
    const capsule = makeCapsule({
      checks: [
        { id: 'check-1', type: 'confirmed', description: 'Fabric OK', satisfied: true },
        { id: 'check-2', type: 'field_present', description: 'Payment', satisfied: false },
      ],
    });

    const result = buildNextState(null, capsule, null);
    expect(result.state.completed_checks).toContain('check-1');
    expect(result.state.completed_checks).not.toContain('check-2');
  });

  it('removes pending items when fields are provided', () => {
    const state: ThreadState = {
      ...createInitialState(),
      pending: [
        { id: 'name', description: 'Provide name' },
        { id: 'address', description: 'Provide address' },
      ],
    };

    const capsule = makeCapsule({
      actions: [{
        action_type: 'reply_with_fields',
        fields: { name: 'John' },
      }],
    });

    const result = buildNextState(state, capsule, null);
    expect(result.state.pending).toHaveLength(1);
    expect(result.state.pending[0].id).toBe('address');
  });

  it('adds new pending items from capsule', () => {
    const capsule = makeCapsule({
      state: {
        status: 'open',
        pending: [{ id: 'p1', description: 'Send invoice' }],
        data: {},
        completed_checks: [],
      },
    });

    const result = buildNextState(null, capsule, null);
    expect(result.state.pending).toHaveLength(1);
    expect(result.state.pending[0].id).toBe('p1');
  });

  it('does not duplicate existing pending items', () => {
    const state: ThreadState = {
      ...createInitialState(),
      pending: [{ id: 'p1', description: 'Send invoice' }],
    };

    const capsule = makeCapsule({
      state: {
        status: 'open',
        pending: [{ id: 'p1', description: 'Send invoice (updated)' }],
        data: {},
        completed_checks: [],
      },
    });

    const result = buildNextState(state, capsule, null);
    expect(result.state.pending).toHaveLength(1);
  });

  it('produces deterministic hashes', () => {
    const capsule = makeCapsule();
    const r1 = buildNextState(null, capsule, null);
    const r2 = buildNextState(null, capsule, null);
    expect(r1.hash).toBe(r2.hash);
  });
});

describe('createInitialState', () => {
  it('creates empty state', () => {
    const state = createInitialState();
    expect(state.status).toBe('open');
    expect(state.pending).toEqual([]);
    expect(state.data).toEqual({});
    expect(state.completed_checks).toEqual([]);
  });
});

// ─── Ledger Validator ───

describe('validateChain', () => {
  it('validates empty chain', () => {
    const result = validateChain([]);
    expect(result.valid).toBe(true);
    expect(result.conflicts).toEqual([]);
  });

  it('validates single entry with null parentHash', () => {
    const entry: LedgerEntry = {
      threadId: 't1',
      stateVersion: 0,
      capsuleHash: 'hash-0',
      parentHash: null,
      intent: 'information_request',
      issuer: 'example.com',
      capsuleRaw: 'raw-data',
      trustTier: 1,
      createdAt: new Date(),
    };

    const result = validateChain([entry]);
    expect(result.valid).toBe(true);
  });

  it('detects broken chain link', () => {
    const entries: LedgerEntry[] = [
      {
        threadId: 't1',
        stateVersion: 0,
        capsuleHash: 'hash-0',
        parentHash: null,
        intent: 'information_request',
        issuer: 'a.com',
        capsuleRaw: 'raw-0',
        trustTier: 1,
        createdAt: new Date(),
      },
      {
        threadId: 't1',
        stateVersion: 1,
        capsuleHash: 'hash-1',
        parentHash: 'WRONG-HASH', // Should be 'hash-0'
        intent: 'proposal_offer',
        issuer: 'b.com',
        capsuleRaw: 'raw-1',
        trustTier: 1,
        createdAt: new Date(),
      },
    ];

    const result = validateChain(entries);
    expect(result.valid).toBe(false);
    expect(result.brokenAt).toBe(1);
    expect(result.conflicts).toHaveLength(1);
  });

  it('validates correct chain', () => {
    const entries: LedgerEntry[] = [
      {
        threadId: 't1', stateVersion: 0, capsuleHash: 'hash-0', parentHash: null,
        intent: 'information_request', issuer: 'a.com', capsuleRaw: 'r0', trustTier: 1, createdAt: new Date(),
      },
      {
        threadId: 't1', stateVersion: 1, capsuleHash: 'hash-1', parentHash: 'hash-0',
        intent: 'proposal_offer', issuer: 'b.com', capsuleRaw: 'r1', trustTier: 1, createdAt: new Date(),
      },
      {
        threadId: 't1', stateVersion: 2, capsuleHash: 'hash-2', parentHash: 'hash-1',
        intent: 'commit_decision', issuer: 'a.com', capsuleRaw: 'r2', trustTier: 2, createdAt: new Date(),
      },
    ];

    const result = validateChain(entries);
    expect(result.valid).toBe(true);
    expect(result.conflicts).toEqual([]);
  });

  it('detects first entry with non-null parentHash', () => {
    const entries: LedgerEntry[] = [
      {
        threadId: 't1', stateVersion: 0, capsuleHash: 'hash-0', parentHash: 'unexpected',
        intent: 'information_request', issuer: 'a.com', capsuleRaw: 'r0', trustTier: 0, createdAt: new Date(),
      },
    ];

    const result = validateChain(entries);
    expect(result.valid).toBe(false);
    expect(result.conflicts[0]).toContain('parentHash should be null');
  });

  it('sorts entries by stateVersion', () => {
    const entries: LedgerEntry[] = [
      {
        threadId: 't1', stateVersion: 1, capsuleHash: 'h1', parentHash: 'h0',
        intent: 'proposal_offer', issuer: 'b.com', capsuleRaw: 'r1', trustTier: 1, createdAt: new Date(),
      },
      {
        threadId: 't1', stateVersion: 0, capsuleHash: 'h0', parentHash: null,
        intent: 'information_request', issuer: 'a.com', capsuleRaw: 'r0', trustTier: 1, createdAt: new Date(),
      },
    ];

    const result = validateChain(entries);
    expect(result.valid).toBe(true);
  });

  it('detects version gaps', () => {
    const entries: LedgerEntry[] = [
      {
        threadId: 't1', stateVersion: 0, capsuleHash: 'h0', parentHash: null,
        intent: 'information_request', issuer: 'a.com', capsuleRaw: 'r0', trustTier: 1, createdAt: new Date(),
      },
      {
        threadId: 't1', stateVersion: 3, capsuleHash: 'h3', parentHash: 'h0',
        intent: 'proposal_offer', issuer: 'b.com', capsuleRaw: 'r3', trustTier: 1, createdAt: new Date(),
      },
    ];

    const result = validateChain(entries);
    expect(result.conflicts.some((c) => c.includes('Version gap'))).toBe(true);
  });
});

describe('verifyEntryHash', () => {
  it('verifies correct hash', () => {
    const raw = 'capsule-content';
    const entry: LedgerEntry = {
      threadId: 't1', stateVersion: 0, capsuleHash: computeHash(raw), parentHash: null,
      intent: 'information_request', issuer: 'a.com', capsuleRaw: raw, trustTier: 0, createdAt: new Date(),
    };
    expect(verifyEntryHash(entry)).toBe(true);
  });

  it('detects tampered content', () => {
    const entry: LedgerEntry = {
      threadId: 't1', stateVersion: 0, capsuleHash: 'original-hash', parentHash: null,
      intent: 'information_request', issuer: 'a.com', capsuleRaw: 'tampered-content', trustTier: 0, createdAt: new Date(),
    };
    expect(verifyEntryHash(entry)).toBe(false);
  });
});

// ─── Thread Fingerprint ───

describe('normalizeSubject', () => {
  it('strips Re: prefix', () => {
    expect(normalizeSubject('Re: Hello')).toBe('Hello');
  });

  it('strips Fwd: prefix', () => {
    expect(normalizeSubject('Fwd: Hello')).toBe('Hello');
  });

  it('strips FW: prefix', () => {
    expect(normalizeSubject('FW: Hello')).toBe('Hello');
  });

  it('strips international prefixes', () => {
    expect(normalizeSubject('AW: Hello')).toBe('Hello'); // German
    expect(normalizeSubject('SV: Hello')).toBe('Hello'); // Swedish
    expect(normalizeSubject('Rif: Hello')).toBe('Hello'); // Italian
  });

  it('strips bracket tags', () => {
    expect(normalizeSubject('[External] Hello')).toBe('Hello');
    expect(normalizeSubject('[SECURE] Re: Hello')).toBe('Hello');
  });

  it('preserves clean subjects', () => {
    expect(normalizeSubject('Order Confirmation')).toBe('Order Confirmation');
  });
});

describe('generateThreadFingerprint', () => {
  it('produces consistent hash', () => {
    const f1 = generateThreadFingerprint('Hello', '2026-03-01', 'a.com', 'b.com');
    const f2 = generateThreadFingerprint('Hello', '2026-03-01', 'a.com', 'b.com');
    expect(f1).toBe(f2);
  });

  it('produces hex SHA-256 hash', () => {
    const fp = generateThreadFingerprint('Hello', '2026-03-01', 'a.com', 'b.com');
    expect(fp).toMatch(/^[a-f0-9]{64}$/);
  });

  it('different subjects produce different fingerprints', () => {
    const f1 = generateThreadFingerprint('Hello', '2026-03-01', 'a.com', 'b.com');
    const f2 = generateThreadFingerprint('Goodbye', '2026-03-01', 'a.com', 'b.com');
    expect(f1).not.toBe(f2);
  });

  it('normalizes case', () => {
    const f1 = generateThreadFingerprint('Hello', '2026-03-01', 'a.com', 'b.com');
    const f2 = generateThreadFingerprint('HELLO', '2026-03-01', 'a.com', 'b.com');
    expect(f1).toBe(f2);
  });

  it('strips reply prefixes before hashing', () => {
    const f1 = generateThreadFingerprint('Hello', '2026-03-01', 'a.com', 'b.com');
    const f2 = generateThreadFingerprint('Re: Hello', '2026-03-01', 'a.com', 'b.com');
    expect(f1).toBe(f2);
  });
});
