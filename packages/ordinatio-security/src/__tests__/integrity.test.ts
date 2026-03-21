// ===========================================
// Integrity Layer Tests
// ===========================================

import { describe, it, expect } from 'vitest';
import {
  computeEventHash,
  computeIntegrityHash,
  verifyEventChain,
  buildHashedEvent,
} from '../integrity/event-hash';
import { buildIntegrityMetadata } from '../integrity/chain-state';
import {
  verifyContentIntegrity,
  verifyChainLink,
  verifyHashChain,
} from '../integrity/verification';
import { SECURITY_EVENT_TYPES } from '../types';

describe('computeEventHash', () => {
  it('returns a 64-char hex string', () => {
    const hash = computeEventHash({ foo: 'bar' });
    expect(hash).toHaveLength(64);
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('is deterministic — same input = same hash', () => {
    const a = computeEventHash({ x: 1, y: 2 });
    const b = computeEventHash({ x: 1, y: 2 });
    expect(a).toBe(b);
  });

  it('produces different hashes for different content', () => {
    const a = computeEventHash({ x: 1 });
    const b = computeEventHash({ x: 2 });
    expect(a).not.toBe(b);
  });

  it('is order-independent (sorted keys)', () => {
    const a = computeEventHash({ b: 2, a: 1 });
    const b = computeEventHash({ a: 1, b: 2 });
    expect(a).toBe(b);
  });
});

describe('computeIntegrityHash', () => {
  it('chains with GENESIS when no previous hash', () => {
    const content = computeEventHash({ test: true });
    const integrity = computeIntegrityHash(content, null);
    expect(integrity).toHaveLength(64);
  });

  it('chains with previous hash', () => {
    const content = computeEventHash({ test: true });
    const prev = 'a'.repeat(64);
    const integrity = computeIntegrityHash(content, prev);
    expect(integrity).toHaveLength(64);
    // Different from genesis chain
    const genesis = computeIntegrityHash(content, null);
    expect(integrity).not.toBe(genesis);
  });
});

describe('buildHashedEvent', () => {
  it('creates a complete hashed event', () => {
    const event = buildHashedEvent('evt-1', { type: 'test' }, null);
    expect(event.id).toBe('evt-1');
    expect(event.contentHash).toHaveLength(64);
    expect(event.integrityHash).toHaveLength(64);
    expect(event.prevHash).toBeNull();
  });

  it('chains to previous event', () => {
    const first = buildHashedEvent('evt-1', { type: 'first' }, null);
    const second = buildHashedEvent('evt-2', { type: 'second' }, first.integrityHash);
    expect(second.prevHash).toBe(first.integrityHash);
  });
});

describe('verifyEventChain', () => {
  it('verifies an empty chain', () => {
    const result = verifyEventChain([]);
    expect(result.valid).toBe(true);
    expect(result.totalChecked).toBe(0);
  });

  it('verifies a single-event chain', () => {
    const event = buildHashedEvent('evt-1', { test: true }, null);
    const result = verifyEventChain([event]);
    expect(result.valid).toBe(true);
    expect(result.totalChecked).toBe(1);
  });

  it('verifies a multi-event chain', () => {
    const e1 = buildHashedEvent('evt-1', { step: 1 }, null);
    const e2 = buildHashedEvent('evt-2', { step: 2 }, e1.integrityHash);
    const e3 = buildHashedEvent('evt-3', { step: 3 }, e2.integrityHash);
    const result = verifyEventChain([e1, e2, e3]);
    expect(result.valid).toBe(true);
    expect(result.totalChecked).toBe(3);
  });

  it('detects broken chain linkage', () => {
    const e1 = buildHashedEvent('evt-1', { step: 1 }, null);
    const e2 = buildHashedEvent('evt-2', { step: 2 }, 'wrong-hash');
    const result = verifyEventChain([e1, e2]);
    expect(result.valid).toBe(false);
    expect(result.brokenAt).toBe(1);
    expect(result.eventId).toBe('evt-2');
  });

  it('detects tampered integrity hash', () => {
    const e1 = buildHashedEvent('evt-1', { step: 1 }, null);
    const e2 = buildHashedEvent('evt-2', { step: 2 }, e1.integrityHash);
    e2.integrityHash = 'tampered'.padEnd(64, '0');
    const result = verifyEventChain([e1, e2]);
    expect(result.valid).toBe(false);
    expect(result.brokenAt).toBe(1);
    expect(result.errors.length).toBeGreaterThan(0);
  });
});

describe('buildIntegrityMetadata', () => {
  it('builds metadata from SecurityEventInput', () => {
    const meta = buildIntegrityMetadata({
      eventType: SECURITY_EVENT_TYPES.AUTH_LOGIN_SUCCESS,
      userId: 'user-1',
      ip: '1.2.3.4',
    }, null);
    expect(meta.contentHash).toHaveLength(64);
    expect(meta.hash).toHaveLength(64);
    expect(meta.prevHash).toBeNull();
  });

  it('chains to previous hash', () => {
    const prevHash = 'a'.repeat(64);
    const meta = buildIntegrityMetadata({
      eventType: SECURITY_EVENT_TYPES.AUTH_LOGIN_FAILED,
    }, prevHash);
    expect(meta.prevHash).toBe(prevHash);
    expect(meta.hash).not.toBe(prevHash);
  });
});

describe('verifyContentIntegrity', () => {
  it('verifies matching content', () => {
    const content = { a: 1, b: 2 };
    const hash = computeEventHash(content);
    const result = verifyContentIntegrity(content, hash);
    expect(result.valid).toBe(true);
  });

  it('detects modified content', () => {
    const hash = computeEventHash({ a: 1 });
    const result = verifyContentIntegrity({ a: 2 }, hash);
    expect(result.valid).toBe(false);
    expect(result.actualHash).not.toBe(hash);
  });
});

describe('verifyChainLink', () => {
  it('verifies a valid link', () => {
    const event = buildHashedEvent('evt-1', { test: true }, null);
    const result = verifyChainLink(event.contentHash, event.integrityHash, null);
    expect(result.valid).toBe(true);
  });

  it('detects invalid link', () => {
    const result = verifyChainLink('content', 'wrong-hash', null);
    expect(result.valid).toBe(false);
  });
});

describe('verifyHashChain (generic)', () => {
  it('verifies empty chain', () => {
    const result = verifyHashChain([]);
    expect(result.valid).toBe(true);
  });

  it('verifies valid chain entries', () => {
    const e1 = buildHashedEvent('a', { x: 1 }, null);
    const e2 = buildHashedEvent('b', { x: 2 }, e1.integrityHash);
    const result = verifyHashChain([e1, e2]);
    expect(result.valid).toBe(true);
    expect(result.totalChecked).toBe(2);
  });

  it('detects tampering mid-chain', () => {
    const e1 = buildHashedEvent('a', { x: 1 }, null);
    const e2 = buildHashedEvent('b', { x: 2 }, e1.integrityHash);
    const e3 = buildHashedEvent('c', { x: 3 }, e2.integrityHash);
    // Tamper with e2
    e2.contentHash = 'tampered'.padEnd(64, '0');
    const result = verifyHashChain([e1, e2, e3]);
    expect(result.valid).toBe(false);
    expect(result.brokenAt).toBe(1);
  });
});
