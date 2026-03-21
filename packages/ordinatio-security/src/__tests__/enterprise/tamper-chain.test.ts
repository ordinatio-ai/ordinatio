// ===========================================
// 3. Tamper-Evident Log Chain Tests
// ===========================================
// Intentionally corrupt the chain. Assert:
// - verification fails
// - exact break point identified
// - system marks integrity failure
// ===========================================

import { describe, it, expect } from 'vitest';
import {
  buildHashedEvent,
  verifyEventChain,
  computeEventHash,
} from '../../integrity/event-hash';
import { verifyHashChain, verifyContentIntegrity } from '../../integrity/verification';
import { summarizePosture } from '../../posture/security-summary';
import type { SecurityPosture } from '../../policy/policy-types';

function buildChain(length: number) {
  const events = [];
  let prevHash: string | null = null;
  for (let i = 0; i < length; i++) {
    const e = buildHashedEvent(`evt-${i}`, {
      action: `step_${i}`,
      timestamp: new Date(2026, 0, 1, 0, 0, i).toISOString(),
      userId: 'user-1',
    }, prevHash);
    events.push(e);
    prevHash = e.integrityHash;
  }
  return events;
}

describe('modify one historical event', () => {
  it('detects content modification at start of chain', () => {
    const chain = buildChain(10);
    chain[0].contentHash = computeEventHash({ action: 'TAMPERED', timestamp: 'fake' });
    const result = verifyEventChain(chain);
    expect(result.valid).toBe(false);
    expect(result.brokenAt).toBe(0);
    expect(result.eventId).toBe('evt-0');
  });

  it('detects content modification in middle of chain', () => {
    const chain = buildChain(10);
    chain[5].contentHash = computeEventHash({ action: 'TAMPERED' });
    const result = verifyEventChain(chain);
    expect(result.valid).toBe(false);
    expect(result.brokenAt).toBe(5);
    expect(result.eventId).toBe('evt-5');
  });

  it('detects content modification at end of chain', () => {
    const chain = buildChain(10);
    chain[9].contentHash = computeEventHash({ action: 'TAMPERED' });
    const result = verifyEventChain(chain);
    expect(result.valid).toBe(false);
    expect(result.brokenAt).toBe(9);
  });
});

describe('delete one event', () => {
  it('detects gap when middle event removed', () => {
    const chain = buildChain(10);
    chain.splice(5, 1); // Remove event at index 5
    const result = verifyEventChain(chain);
    expect(result.valid).toBe(false);
    expect(result.brokenAt).toBe(5); // Now evt-6 has wrong prevHash
  });

  it('detects gap when first event removed', () => {
    const chain = buildChain(5);
    chain.shift();
    const result = verifyEventChain(chain);
    expect(result.valid).toBe(false);
    expect(result.brokenAt).toBe(0); // evt-1 expects evt-0's hash as prevHash
  });

  it('detects gap when last event removed', () => {
    const chain = buildChain(5);
    const removed = chain.pop()!;
    // Chain is now shorter but valid — removing the end doesn't break remaining
    const result = verifyEventChain(chain);
    expect(result.valid).toBe(true); // Truncation doesn't break existing chain
    expect(result.totalChecked).toBe(4);
  });
});

describe('reorder events', () => {
  it('detects swapped adjacent events', () => {
    const chain = buildChain(5);
    [chain[2], chain[3]] = [chain[3], chain[2]]; // Swap
    const result = verifyEventChain(chain);
    expect(result.valid).toBe(false);
  });

  it('detects reversed chain', () => {
    const chain = buildChain(5);
    chain.reverse();
    const result = verifyEventChain(chain);
    expect(result.valid).toBe(false);
    expect(result.brokenAt).toBe(0); // First event now has wrong prevHash
  });
});

describe('insert fake event', () => {
  it('detects injected event in middle', () => {
    const chain = buildChain(5);
    const fake = buildHashedEvent('fake-evt', { action: 'INJECTED' }, chain[2].integrityHash);
    chain.splice(3, 0, fake); // Insert after position 2
    const result = verifyEventChain(chain);
    expect(result.valid).toBe(false);
    // The original evt-3 now has wrong prevHash (expects evt-2, gets fake)
    expect(result.brokenAt).toBe(4);
  });

  it('detects fake event prepended to chain', () => {
    const chain = buildChain(5);
    const fake = buildHashedEvent('fake-first', { action: 'INJECTED' }, null);
    chain.unshift(fake);
    const result = verifyEventChain(chain);
    expect(result.valid).toBe(false);
    expect(result.brokenAt).toBe(1); // evt-0 expects null prevHash, gets fake's hash
  });
});

describe('audit summary reports tampering', () => {
  it('broken integrity reflected in posture summary', () => {
    const posture: SecurityPosture = {
      orgId: 'org-1',
      principalId: 'user-1',
      trustTier: 1,
      riskScore: 30,
      activeAlerts: [],
      policyRestrictions: [],
      blockedActions: [],
      integrityStatus: 'broken',
      recommendedNextActions: ['Investigate integrity failure'],
      _actions: {},
    };

    const summary = summarizePosture(posture);
    expect(summary).toContain('integrity is broken');
    expect(summary).toContain('tampering');
  });
});

describe('generic hash chain (verifyHashChain)', () => {
  it('works for non-event entries (ledger, artifacts)', () => {
    const entries = buildChain(5); // Same structure
    const result = verifyHashChain(entries);
    expect(result.valid).toBe(true);
  });

  it('detects tampering via generic verifier', () => {
    const entries = buildChain(5);
    entries[2].contentHash = 'tampered'.padEnd(64, '0');
    const result = verifyHashChain(entries);
    expect(result.valid).toBe(false);
    expect(result.brokenAt).toBe(2);
    expect(result.entryId).toBe('evt-2');
  });
});

describe('content integrity verification', () => {
  it('verifies unmodified content', () => {
    const content = { amount: 5000, currency: 'USD', recipient: 'vendor-1' };
    const hash = computeEventHash(content);
    const result = verifyContentIntegrity(content, hash);
    expect(result.valid).toBe(true);
  });

  it('detects single field change', () => {
    const original = { amount: 5000, currency: 'USD' };
    const hash = computeEventHash(original);
    const tampered = { amount: 50000, currency: 'USD' }; // Extra zero
    const result = verifyContentIntegrity(tampered, hash);
    expect(result.valid).toBe(false);
  });

  it('detects field addition', () => {
    const original = { amount: 5000 };
    const hash = computeEventHash(original);
    const result = verifyContentIntegrity({ amount: 5000, approved: true }, hash);
    expect(result.valid).toBe(false);
  });

  it('detects field removal', () => {
    const original = { amount: 5000, approved: false };
    const hash = computeEventHash(original);
    const result = verifyContentIntegrity({ amount: 5000 }, hash);
    expect(result.valid).toBe(false);
  });
});
