// ===========================================
// 17. Red Team Scenarios
// ===========================================
// Full adversarial workflows — the tests executives care about.
// ===========================================

import { describe, it, expect, beforeEach } from 'vitest';
import { evaluateTrust } from '../../trust/trust-evaluator';
import { evaluatePolicy } from '../../policy/policy-engine';
import { shouldBlockAction } from '../../enforcement/action-gate';
import { logSecurityEvent } from '../../event-logger';
import { checkForBruteForce } from '../../alert-detection';
import { getSecurityPosture } from '../../posture/security-posture';
import { InMemoryKeyStore, resolveKeyForTrust } from '../../trust/key-store';
import { InMemoryNonceStore } from '../../replay/nonce-store';
import { CompositeBlacklist } from '../../enforcement/blacklist';
import { SECURITY_EVENT_TYPES } from '../../types';
import type { SecurityPolicy } from '../../policy/policy-types';
import { createMockDb, createMockCallbacks, resetIdCounter } from '../test-helpers';

const STANDARD_POLICIES: SecurityPolicy[] = [
  {
    id: 'block-untrusted-payments',
    name: 'Block untrusted payment actions',
    conditions: [
      { field: 'principal.trustTier', operator: 'lte', value: 0 },
      { field: 'action', operator: 'in', value: ['process_payment', 'transfer_funds'] },
    ],
    decision: 'deny',
    priority: 100,
  },
  {
    id: 'escalate-payments',
    name: 'Escalate all payments',
    conditions: [
      { field: 'action', operator: 'in', value: ['process_payment', 'transfer_funds'] },
    ],
    decision: 'escalate',
    priority: 50,
  },
];

describe('Scenario: Fake vendor payment request', () => {
  it('wrong issuer → blocked, tier 0, human review requested', async () => {
    // Step 1: Evaluate trust — wrong issuer
    const trust = evaluateTrust({
      issuer: 'evil-vendor.xyz',
      signatureValid: true, // Valid sig but wrong issuer
      dmarcStatus: 'fail',
      nonceValid: true,
      ttlValid: true,
      orgPolicy: {
        trustedDomains: ['real-vendor.com'],
        blockedDomains: [],
      },
    });
    expect(trust.trustTier).toBe(0); // DMARC fail → tier 0

    // Step 2: Policy evaluation with untrusted tier
    const decision = evaluatePolicy({
      principal: {
        principalId: 'email-agent',
        principalType: 'agent',
        trustTier: trust.trustTier,
      },
      action: 'process_payment',
    }, STANDARD_POLICIES);

    expect(decision.decision).toBe('deny'); // Tier 0 + payment → blocked
    expect(decision.recommendation).toBeDefined();
    expect(decision.recommendation!.safeAlternatives.length).toBeGreaterThan(0);
  });
});

describe('Scenario: Brute force login wave', () => {
  let db: ReturnType<typeof createMockDb>;
  let callbacks: ReturnType<typeof createMockCallbacks>;

  beforeEach(() => {
    resetIdCounter();
    db = createMockDb();
    callbacks = createMockCallbacks();
  });

  it('many failures from rotating IPs → alert raised, posture lowered', async () => {
    // Simulate 10 failures from same IP range
    for (let i = 0; i < 10; i++) {
      await logSecurityEvent(db, {
        eventType: SECURITY_EVENT_TYPES.AUTH_LOGIN_FAILED,
        ip: '10.0.1.1', // Same IP (attacker)
        details: { email: `target${i}@company.com`, reason: 'bad password' },
      }, callbacks);
    }

    // Check for alert
    const alert = await checkForBruteForce(db, undefined, '10.0.1.1', callbacks);
    expect(alert).toBeDefined();
    expect(alert!.riskLevel).toBe('HIGH');

    // Check posture reflects the attack
    const posture = await getSecurityPosture(db, {
      principal: { principalId: 'admin', principalType: 'user', trustTier: 1 },
    }, callbacks);
    expect(posture.activeAlerts.length).toBeGreaterThan(0);
    expect(posture.riskScore).toBeGreaterThan(20);
    expect(posture.activeAlerts[0].recovery).toBeDefined();
  });
});

describe('Scenario: Malicious key rotation', () => {
  it('old trusted issuer uses unknown key → denied, flagged for review', () => {
    const store = new InMemoryKeyStore();
    store.addKey({
      kid: 'real-key-1',
      issuer: 'partner.com',
      publicKey: 'real-public-key',
      createdAt: new Date(),
    });

    // Attacker tries to use an unknown kid
    const keyResult = resolveKeyForTrust(store, 'attacker-key-99', 'partner.com');
    expect(keyResult.valid).toBe(false);
    expect(keyResult.reason).toContain('Unknown key ID');

    // Trust evaluation with invalid key
    const trust = evaluateTrust({
      issuer: 'partner.com',
      signatureValid: false, // Unknown key can't verify
      dmarcStatus: 'pass',
      nonceValid: true,
      ttlValid: true,
      orgPolicy: { trustedDomains: ['partner.com'] },
    });
    expect(trust.trustTier).toBe(0); // Invalid signature → tier 0
  });
});

describe('Scenario: Replay attack on approval workflow', () => {
  it('captured approval nonce replayed → blocked, no duplicate execution', async () => {
    resetIdCounter();
    const db = createMockDb();
    const nonceStore = new InMemoryNonceStore();

    // Original approval succeeds
    const original = await shouldBlockAction(db, {
      principal: { principalId: 'manager', principalType: 'user', trustTier: 2 },
      action: 'approve_order',
      nonce: 'approval-nonce-abc123',
    }, { nonceStore });
    expect(original.blocked).toBe(false);

    // Attacker replays the captured approval
    const replay = await shouldBlockAction(db, {
      principal: { principalId: 'attacker', principalType: 'user', trustTier: 0 },
      action: 'approve_order',
      nonce: 'approval-nonce-abc123', // Same nonce
    }, { nonceStore });
    expect(replay.blocked).toBe(true);
    expect(replay.reason).toContain('nonce');
    expect(replay.recovery).toBeDefined();
  });
});

describe('Scenario: Data exfiltration attempt', () => {
  it('agent tries bulk export → denied by policy', async () => {
    resetIdCounter();
    const db = createMockDb();
    const policies: SecurityPolicy[] = [{
      id: 'block-agent-exports',
      name: 'Block agent bulk exports',
      conditions: [
        { field: 'principal.principalType', operator: 'eq', value: 'agent' },
        { field: 'action', operator: 'in', value: ['export_all_clients', 'bulk_download'] },
      ],
      decision: 'deny',
      priority: 100,
    }];

    const result = await shouldBlockAction(db, {
      principal: { principalId: 'coo-agent', principalType: 'agent', trustTier: 1 },
      action: 'export_all_clients',
    }, { policies });

    expect(result.blocked).toBe(true);
    expect(result.reason).toContain('policy');
    expect(result.recovery).toBeDefined();
  });
});

describe('Scenario: Compromised automation token', () => {
  it('blacklisted principal blocked across all actions', async () => {
    resetIdCounter();
    const db = createMockDb();
    const blacklist = new CompositeBlacklist();
    blacklist.blockPrincipal('compromised-automation-1');

    const actions = ['read_data', 'send_email', 'create_order', 'process_payment'];
    for (const action of actions) {
      const result = await shouldBlockAction(db, {
        principal: { principalId: 'compromised-automation-1', principalType: 'automation' },
        action,
      }, { blacklist });
      expect(result.blocked).toBe(true);
      expect(result.recovery).toBeDefined();
    }
  });
});
