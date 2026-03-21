// ===========================================
// Adversarial Tests: Integrity Tampering
// ===========================================

import { describe, it, expect } from 'vitest';
import {
  computeEventHash,
  verifyEventChain,
  buildHashedEvent,
} from '../../integrity/event-hash';
import { verifyHashChain } from '../../integrity/verification';

describe('integrity tampering attacks', () => {
  it('detects modified event content (single bit flip)', () => {
    const e1 = buildHashedEvent('evt-1', { amount: 100 }, null);
    const e2 = buildHashedEvent('evt-2', { amount: 200 }, e1.integrityHash);
    // Tamper: change amount
    e1.contentHash = computeEventHash({ amount: 101 });
    const result = verifyEventChain([e1, e2]);
    expect(result.valid).toBe(false);
  });

  it('detects injected false hash', () => {
    const e1 = buildHashedEvent('evt-1', { data: 'real' }, null);
    const fakeHash = 'deadbeef'.repeat(8);
    e1.integrityHash = fakeHash;
    const result = verifyEventChain([e1]);
    expect(result.valid).toBe(false);
  });

  it('detects truncated chain (missing middle event)', () => {
    const e1 = buildHashedEvent('evt-1', { step: 1 }, null);
    const e2 = buildHashedEvent('evt-2', { step: 2 }, e1.integrityHash);
    const e3 = buildHashedEvent('evt-3', { step: 3 }, e2.integrityHash);
    // Skip e2
    const result = verifyEventChain([e1, e3]);
    expect(result.valid).toBe(false);
    expect(result.brokenAt).toBe(1);
  });

  it('detects reordered events', () => {
    const e1 = buildHashedEvent('evt-1', { step: 1 }, null);
    const e2 = buildHashedEvent('evt-2', { step: 2 }, e1.integrityHash);
    const e3 = buildHashedEvent('evt-3', { step: 3 }, e2.integrityHash);
    // Swap e2 and e3
    const result = verifyEventChain([e1, e3, e2]);
    expect(result.valid).toBe(false);
  });

  it('detects event with null integrityHash', () => {
    const e1 = buildHashedEvent('evt-1', { test: true }, null);
    (e1 as { integrityHash: string | null }).integrityHash = null as unknown as string;
    const result = verifyEventChain([e1]);
    expect(result.valid).toBe(false);
  });

  it('detects replaced event (same ID, different content)', () => {
    const e1 = buildHashedEvent('evt-1', { action: 'approve' }, null);
    const e2 = buildHashedEvent('evt-2', { action: 'transfer' }, e1.integrityHash);
    // Replace e1 with different content but keep the ID
    const e1Fake = buildHashedEvent('evt-1', { action: 'reject' }, null);
    const result = verifyEventChain([e1Fake, e2]);
    expect(result.valid).toBe(false);
  });

  it('handles event with empty content', () => {
    const e = buildHashedEvent('evt-1', {}, null);
    const result = verifyEventChain([e]);
    expect(result.valid).toBe(true);
  });

  it('handles chain of 100 events', () => {
    const events = [];
    let prevHash: string | null = null;
    for (let i = 0; i < 100; i++) {
      const e = buildHashedEvent(`evt-${i}`, { index: i }, prevHash);
      events.push(e);
      prevHash = e.integrityHash;
    }
    const result = verifyEventChain(events);
    expect(result.valid).toBe(true);
    expect(result.totalChecked).toBe(100);
  });

  it('detects tampering at end of long chain', () => {
    const events = [];
    let prevHash: string | null = null;
    for (let i = 0; i < 50; i++) {
      const e = buildHashedEvent(`evt-${i}`, { index: i }, prevHash);
      events.push(e);
      prevHash = e.integrityHash;
    }
    // Tamper with last event
    events[49].contentHash = 'tampered'.padEnd(64, '0');
    const result = verifyEventChain(events);
    expect(result.valid).toBe(false);
    expect(result.brokenAt).toBe(49);
  });

  it('generic verifyHashChain catches same attacks', () => {
    const e1 = buildHashedEvent('a', { x: 1 }, null);
    const e2 = buildHashedEvent('b', { x: 2 }, e1.integrityHash);
    e1.contentHash = 'modified'.padEnd(64, '0');
    const result = verifyHashChain([e1, e2]);
    expect(result.valid).toBe(false);
  });

  it('detects genesis event with wrong prevHash', () => {
    const e1 = buildHashedEvent('evt-1', { test: true }, null);
    e1.prevHash = 'not-null';
    const result = verifyEventChain([e1]);
    expect(result.valid).toBe(false);
  });

  it('handles special characters in event content', () => {
    const e = buildHashedEvent('evt-1', {
      message: '"><script>alert(1)</script>',
      data: "'; DROP TABLE events; --",
    }, null);
    const result = verifyEventChain([e]);
    expect(result.valid).toBe(true);
  });

  it('handles unicode in event content', () => {
    const e = buildHashedEvent('evt-1', {
      name: '\u0000\uD800\uFFFE',
      emoji: '\u{1F600}',
    }, null);
    expect(e.contentHash).toHaveLength(64);
  });

  it('handles very large content', () => {
    const bigContent: Record<string, unknown> = {};
    for (let i = 0; i < 1000; i++) {
      bigContent[`field_${i}`] = `value_${i}`.repeat(10);
    }
    const e = buildHashedEvent('evt-1', bigContent, null);
    expect(e.contentHash).toHaveLength(64);
    const result = verifyEventChain([e]);
    expect(result.valid).toBe(true);
  });
});
