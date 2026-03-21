// ===========================================
// 12. Stress / Load Tests
// ===========================================
// Proof at scale: latency, memory, duplicate rate, contention.
// ===========================================

import { describe, it, expect, beforeEach } from 'vitest';
import { evaluateTrust } from '../../trust/trust-evaluator';
import { evaluatePolicy } from '../../policy/policy-engine';
import { InMemoryNonceStore } from '../../replay/nonce-store';
import { buildHashedEvent, verifyEventChain } from '../../integrity/event-hash';
import { buildAlertRecovery } from '../../alert-recovery';
import { shouldBlockAction } from '../../enforcement/action-gate';
import { CompositeBlacklist } from '../../enforcement/blacklist';
import type { SecurityPolicy } from '../../policy/policy-types';
import { createMockDb, resetIdCounter } from '../test-helpers';

describe('trust evaluation at scale', () => {
  it('10k concurrent trust evaluations complete in < 1s', () => {
    const start = Date.now();
    const results = [];
    for (let i = 0; i < 10_000; i++) {
      results.push(evaluateTrust({
        issuer: `vendor-${i % 100}.com`,
        signatureValid: i % 3 !== 0,
        dmarcStatus: i % 5 === 0 ? 'fail' : 'pass',
        nonceValid: i % 7 !== 0,
        ttlValid: i % 11 !== 0,
        orgPolicy: {
          trustedDomains: [`vendor-${i % 100}.com`],
          blockedDomains: i % 50 === 0 ? [`vendor-${i % 100}.com`] : [],
        },
      }));
    }
    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(1000);
    expect(results).toHaveLength(10_000);
    // Verify distribution is reasonable
    const tier0 = results.filter(r => r.trustTier === 0).length;
    const tier1 = results.filter(r => r.trustTier === 1).length;
    expect(tier0).toBeGreaterThan(0);
    expect(tier1).toBeGreaterThan(0);
  });
});

describe('policy evaluation at scale', () => {
  it('1k evaluations against 100 policies in < 500ms', () => {
    const policies: SecurityPolicy[] = Array.from({ length: 100 }, (_, i) => ({
      id: `p-${i}`,
      name: `Policy ${i}`,
      conditions: [
        { field: 'action' as const, operator: 'eq' as const, value: `action-${i}` },
      ],
      decision: (i % 3 === 0 ? 'deny' : i % 3 === 1 ? 'escalate' : 'allow') as 'deny' | 'escalate' | 'allow',
      priority: i,
    }));

    const start = Date.now();
    for (let i = 0; i < 1_000; i++) {
      evaluatePolicy({
        principal: { principalId: `user-${i}`, principalType: 'user', trustTier: (i % 3) as 0 | 1 | 2 },
        action: `action-${i % 100}`,
      }, policies);
    }
    expect(Date.now() - start).toBeLessThan(500);
  });
});

describe('nonce store at scale', () => {
  it('100k nonces with bounded memory', () => {
    const store = new InMemoryNonceStore(10_000, 60_000);
    for (let i = 0; i < 100_000; i++) {
      store.checkAndSet(`nonce-${i}`);
    }
    expect(store.size).toBeLessThanOrEqual(10_000);
  });

  it('no duplicate acceptance under rapid unique nonces', () => {
    const store = new InMemoryNonceStore(50_000, 60_000);
    const seen = new Set<string>();
    for (let i = 0; i < 10_000; i++) {
      const nonce = `n-${i}`;
      const result = store.checkAndSet(nonce);
      expect(result.valid).toBe(true);
      expect(seen.has(nonce)).toBe(false);
      seen.add(nonce);
    }
  });

  it('contention test: interleaved valid and duplicate nonces', () => {
    const store = new InMemoryNonceStore(50_000, 60_000);
    let duplicatesCaught = 0;
    let validAccepted = 0;

    // First pass: insert base nonces
    for (let i = 0; i < 100; i++) {
      store.checkAndSet(`base-${i}`);
    }

    // Second pass: mix of new nonces and replays of base nonces
    for (let i = 0; i < 10_000; i++) {
      const nonce = i % 10 === 0 ? `base-${i % 100}` : `fresh-${i}`;
      const result = store.checkAndSet(nonce);
      if (result.valid) validAccepted++;
      else duplicatesCaught++;
    }

    expect(duplicatesCaught).toBeGreaterThan(0);
    expect(validAccepted).toBeGreaterThan(duplicatesCaught);
  });
});

describe('integrity chain at scale', () => {
  it('1k-event chain builds and verifies', () => {
    const events = [];
    let prevHash: string | null = null;
    const start = Date.now();
    for (let i = 0; i < 1_000; i++) {
      const e = buildHashedEvent(`evt-${i}`, {
        action: `op_${i}`,
        userId: `user-${i % 50}`,
        data: `payload-${i}`,
      }, prevHash);
      events.push(e);
      prevHash = e.integrityHash;
    }
    const buildTime = Date.now() - start;

    const verifyStart = Date.now();
    const result = verifyEventChain(events);
    const verifyTime = Date.now() - verifyStart;

    expect(result.valid).toBe(true);
    expect(result.totalChecked).toBe(1_000);
    expect(buildTime).toBeLessThan(5000);
    expect(verifyTime).toBeLessThan(5000);
  });
});

describe('alert recovery at scale', () => {
  it('10k recovery lookups in < 200ms', () => {
    const types = ['brute_force', 'account_takeover', 'data_exfiltration',
      'csrf_attack', 'injection_attack', 'unknown_type'];
    const start = Date.now();
    for (let i = 0; i < 10_000; i++) {
      buildAlertRecovery({
        alertType: types[i % types.length],
        riskLevel: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'][i % 4] as 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL',
      });
    }
    expect(Date.now() - start).toBeLessThan(200);
  });
});

describe('action gate at scale', () => {
  it('1k simultaneous gate checks', async () => {
    resetIdCounter();
    const db = createMockDb();
    const blacklist = new CompositeBlacklist();
    blacklist.blockIp('bad-ip');
    const nonceStore = new InMemoryNonceStore();

    const start = Date.now();
    const results = await Promise.all(
      Array.from({ length: 1_000 }, (_, i) =>
        shouldBlockAction(db, {
          principal: { principalId: `user-${i}`, principalType: 'user' },
          action: 'read',
          ip: i % 10 === 0 ? 'bad-ip' : `good-ip-${i}`,
          nonce: `nonce-${i}`,
        }, { blacklist, nonceStore })
      )
    );
    const elapsed = Date.now() - start;

    expect(elapsed).toBeLessThan(5000);
    const blocked = results.filter(r => r.blocked);
    const allowed = results.filter(r => !r.blocked);
    expect(blocked.length).toBe(100); // 10% hit bad-ip
    expect(allowed.length).toBe(900);
  });
});
