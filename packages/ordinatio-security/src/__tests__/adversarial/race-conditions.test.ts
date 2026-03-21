// ===========================================
// Adversarial Tests: Enforcement Race Conditions
// ===========================================

import { describe, it, expect, beforeEach } from 'vitest';
import { InMemoryBlacklist, CompositeBlacklist } from '../../enforcement/blacklist';
import { InMemoryNonceStore } from '../../replay/nonce-store';
import { shouldBlockAction } from '../../enforcement/action-gate';
import { createMockDb, createMockCallbacks, resetIdCounter } from '../test-helpers';

describe('concurrent blacklist operations', () => {
  it('handles rapid add/remove without corruption', () => {
    const bl = new InMemoryBlacklist();
    // Simulate rapid concurrent operations
    for (let i = 0; i < 100; i++) {
      bl.add(`ip-${i}`);
      if (i % 3 === 0) bl.remove(`ip-${i}`);
    }
    // Verify consistency
    expect(bl.isBlacklisted('ip-0')).toBe(false); // Removed
    expect(bl.isBlacklisted('ip-1')).toBe(true);  // Not removed
    expect(bl.isBlacklisted('ip-3')).toBe(false); // Removed
  });

  it('handles same key added twice', () => {
    const bl = new InMemoryBlacklist();
    bl.add('ip-1');
    bl.add('ip-1'); // Duplicate
    expect(bl.isBlacklisted('ip-1')).toBe(true);
    bl.remove('ip-1');
    expect(bl.isBlacklisted('ip-1')).toBe(false);
  });

  it('handles TTL race (expiry during check)', () => {
    const bl = new InMemoryBlacklist();
    // Add with very short TTL
    bl.add('ip-1', new Date(Date.now() + 1)); // 1ms from now
    // Might or might not be expired by now — either is valid
    const result = bl.isBlacklisted('ip-1');
    expect(typeof result).toBe('boolean');
  });
});

describe('concurrent nonce operations', () => {
  it('rejects same nonce across rapid submissions', () => {
    const store = new InMemoryNonceStore();
    const results = [];
    for (let i = 0; i < 10; i++) {
      results.push(store.checkAndSet('same-nonce'));
    }
    // First should be valid, rest should be duplicates
    expect(results[0].valid).toBe(true);
    for (let i = 1; i < 10; i++) {
      expect(results[i].valid).toBe(false);
      expect(results[i].reason).toBe('duplicate');
    }
  });

  it('handles capacity overflow under load', () => {
    const store = new InMemoryNonceStore(10, 60_000);
    // Add 20 nonces to a store with capacity 10
    for (let i = 0; i < 20; i++) {
      store.checkAndSet(`nonce-${i}`);
    }
    expect(store.size).toBeLessThanOrEqual(10);
  });

  it('handles interleaved valid and invalid nonces', () => {
    const store = new InMemoryNonceStore();
    expect(store.checkAndSet('a').valid).toBe(true);
    expect(store.checkAndSet('b').valid).toBe(true);
    expect(store.checkAndSet('a').valid).toBe(false); // Replay
    expect(store.checkAndSet('c').valid).toBe(true);
    expect(store.checkAndSet('b').valid).toBe(false); // Replay
  });
});

describe('concurrent action gate checks', () => {
  let db: ReturnType<typeof createMockDb>;
  let callbacks: ReturnType<typeof createMockCallbacks>;

  beforeEach(() => {
    resetIdCounter();
    db = createMockDb();
    callbacks = createMockCallbacks();
  });

  it('handles multiple simultaneous checks', async () => {
    const blacklist = new CompositeBlacklist();
    blacklist.blockIp('bad-ip');

    const results = await Promise.all([
      shouldBlockAction(db, {
        principal: { principalId: 'u1', principalType: 'user' },
        action: 'read',
        ip: 'good-ip',
      }, { blacklist }, callbacks),
      shouldBlockAction(db, {
        principal: { principalId: 'u2', principalType: 'user' },
        action: 'read',
        ip: 'bad-ip',
      }, { blacklist }, callbacks),
      shouldBlockAction(db, {
        principal: { principalId: 'u3', principalType: 'user' },
        action: 'read',
        ip: 'good-ip-2',
      }, { blacklist }, callbacks),
    ]);

    expect(results[0].blocked).toBe(false);
    expect(results[1].blocked).toBe(true);
    expect(results[2].blocked).toBe(false);
  });

  it('nonce store rejects replay across concurrent checks', async () => {
    const nonceStore = new InMemoryNonceStore();

    const results = await Promise.all([
      shouldBlockAction(db, {
        principal: { principalId: 'u1', principalType: 'user' },
        action: 'submit',
        nonce: 'shared-nonce',
      }, { nonceStore }, callbacks),
      shouldBlockAction(db, {
        principal: { principalId: 'u2', principalType: 'user' },
        action: 'submit',
        nonce: 'shared-nonce',
      }, { nonceStore }, callbacks),
    ]);

    // One should succeed, one should be blocked
    const blocked = results.filter(r => r.blocked);
    const allowed = results.filter(r => !r.blocked);
    expect(blocked).toHaveLength(1);
    expect(allowed).toHaveLength(1);
  });

  it('handles empty config gracefully under load', async () => {
    const results = await Promise.all(
      Array.from({ length: 20 }, (_, i) =>
        shouldBlockAction(db, {
          principal: { principalId: `user-${i}`, principalType: 'user' },
          action: 'read',
        }, {}, callbacks)
      )
    );
    expect(results.every(r => !r.blocked)).toBe(true);
  });

  it('composite blacklist handles multi-dimension check', async () => {
    const blacklist = new CompositeBlacklist();
    blacklist.blockIp('1.2.3.4');
    blacklist.blockPrincipal('user-bad');
    blacklist.blockOrg('org-evil');

    // Check all 3 dimensions hit
    const r1 = await shouldBlockAction(db, {
      principal: { principalId: 'user-bad', principalType: 'user' },
      action: 'read',
      ip: '1.2.3.4',
    }, { blacklist });
    expect(r1.blocked).toBe(true);

    // IP blocked even with good principal
    const r2 = await shouldBlockAction(db, {
      principal: { principalId: 'user-good', principalType: 'user' },
      action: 'read',
      ip: '1.2.3.4',
    }, { blacklist });
    expect(r2.blocked).toBe(true);
  });
});

describe('adversarial input to enforcement', () => {
  it('handles empty string keys in blacklist', () => {
    const bl = new InMemoryBlacklist();
    bl.add('');
    expect(bl.isBlacklisted('')).toBe(true);
  });

  it('handles very long keys in blacklist', () => {
    const bl = new InMemoryBlacklist();
    const longKey = 'x'.repeat(10_000);
    bl.add(longKey);
    expect(bl.isBlacklisted(longKey)).toBe(true);
  });

  it('handles special characters in nonce', () => {
    const store = new InMemoryNonceStore();
    const specialNonces = [
      '\x00\x01\x02',
      '"><script>alert(1)</script>',
      "'; DROP TABLE nonces; --",
      '\u{1F600}\u{1F601}',
      '../../../etc/passwd',
    ];
    for (const nonce of specialNonces) {
      const result = store.checkAndSet(nonce);
      expect(result.valid).toBe(true);
    }
    // Replays should all be rejected
    for (const nonce of specialNonces) {
      expect(store.checkAndSet(nonce).valid).toBe(false);
    }
  });
});
