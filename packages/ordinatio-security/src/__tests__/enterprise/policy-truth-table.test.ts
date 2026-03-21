// ===========================================
// 1. Policy Decision Table — Security Truth Table
// ===========================================
// Matrix: trust tier × action × issuer × human approval × nonce × TTL
// Each row asserts: final decision, reason, blocked, human required.
// ===========================================

import { describe, it, expect } from 'vitest';
import { evaluatePolicy } from '../../policy/policy-engine';
import { evaluateTrust } from '../../trust/trust-evaluator';
import { shouldBlockAction } from '../../enforcement/action-gate';
import { InMemoryNonceStore } from '../../replay/nonce-store';
import { CompositeBlacklist } from '../../enforcement/blacklist';
import type { SecurityPolicy, PolicyContext } from '../../policy/policy-types';
import { createMockDb, resetIdCounter } from '../test-helpers';

// Standard policy set for truth table
const POLICIES: SecurityPolicy[] = [
  {
    id: 'block-untrusted-payments',
    name: 'Block untrusted payment actions',
    conditions: [
      { field: 'principal.trustTier', operator: 'lte', value: 0 },
      { field: 'action', operator: 'in', value: ['process_payment', 'approve_payment', 'transfer_funds'] },
    ],
    decision: 'deny',
    priority: 100,
  },
  {
    id: 'escalate-high-value',
    name: 'Escalate high-value actions',
    conditions: [
      { field: 'action', operator: 'in', value: ['process_payment', 'transfer_funds', 'delete_data'] },
    ],
    decision: 'escalate',
    priority: 50,
  },
  {
    id: 'block-agents-from-exports',
    name: 'Block agents from data exports',
    conditions: [
      { field: 'principal.principalType', operator: 'eq', value: 'agent' },
      { field: 'action', operator: 'eq', value: 'export_data' },
    ],
    decision: 'deny',
    priority: 90,
  },
  {
    id: 'allow-read',
    name: 'Allow read operations',
    conditions: [
      { field: 'action', operator: 'in', value: ['read_data', 'list_items', 'search'] },
    ],
    decision: 'allow',
    priority: 10,
  },
];

interface TruthTableRow {
  label: string;
  trustTier: 0 | 1 | 2;
  principalType: 'user' | 'agent' | 'automation' | 'system';
  action: string;
  expectedDecision: 'allow' | 'escalate' | 'deny';
  expectedBlocked: boolean;
  expectedHumanRequired: boolean;
}

const TRUTH_TABLE: TruthTableRow[] = [
  // Tier 0 + payment → DENY (policy: block-untrusted-payments)
  { label: 'T0 user payment', trustTier: 0, principalType: 'user', action: 'process_payment', expectedDecision: 'deny', expectedBlocked: true, expectedHumanRequired: false },
  { label: 'T0 agent payment', trustTier: 0, principalType: 'agent', action: 'approve_payment', expectedDecision: 'deny', expectedBlocked: true, expectedHumanRequired: false },
  { label: 'T0 auto transfer', trustTier: 0, principalType: 'automation', action: 'transfer_funds', expectedDecision: 'deny', expectedBlocked: true, expectedHumanRequired: false },

  // Tier 1/2 + payment → ESCALATE (policy: escalate-high-value)
  { label: 'T1 user payment', trustTier: 1, principalType: 'user', action: 'process_payment', expectedDecision: 'escalate', expectedBlocked: false, expectedHumanRequired: true },
  { label: 'T2 user payment', trustTier: 2, principalType: 'user', action: 'process_payment', expectedDecision: 'escalate', expectedBlocked: false, expectedHumanRequired: true },
  { label: 'T1 user transfer', trustTier: 1, principalType: 'user', action: 'transfer_funds', expectedDecision: 'escalate', expectedBlocked: false, expectedHumanRequired: true },

  // Agent + export → DENY (policy: block-agents-from-exports)
  { label: 'T1 agent export', trustTier: 1, principalType: 'agent', action: 'export_data', expectedDecision: 'deny', expectedBlocked: true, expectedHumanRequired: false },
  { label: 'T2 agent export', trustTier: 2, principalType: 'agent', action: 'export_data', expectedDecision: 'deny', expectedBlocked: true, expectedHumanRequired: false },

  // User + export → ALLOW (no matching deny policy)
  { label: 'T1 user export', trustTier: 1, principalType: 'user', action: 'export_data', expectedDecision: 'allow', expectedBlocked: false, expectedHumanRequired: false },

  // Read operations → ALLOW
  { label: 'T0 user read', trustTier: 0, principalType: 'user', action: 'read_data', expectedDecision: 'allow', expectedBlocked: false, expectedHumanRequired: false },
  { label: 'T1 agent search', trustTier: 1, principalType: 'agent', action: 'search', expectedDecision: 'allow', expectedBlocked: false, expectedHumanRequired: false },
  { label: 'T2 auto list', trustTier: 2, principalType: 'automation', action: 'list_items', expectedDecision: 'allow', expectedBlocked: false, expectedHumanRequired: false },

  // Unknown action → DEFAULT ALLOW (no matching policy)
  { label: 'T0 user unknown', trustTier: 0, principalType: 'user', action: 'custom_action', expectedDecision: 'allow', expectedBlocked: false, expectedHumanRequired: false },
  { label: 'T2 system unknown', trustTier: 2, principalType: 'system', action: 'internal_op', expectedDecision: 'allow', expectedBlocked: false, expectedHumanRequired: false },

  // Delete → ESCALATE (policy: escalate-high-value)
  { label: 'T1 user delete', trustTier: 1, principalType: 'user', action: 'delete_data', expectedDecision: 'escalate', expectedBlocked: false, expectedHumanRequired: true },
  { label: 'T0 agent delete', trustTier: 0, principalType: 'agent', action: 'delete_data', expectedDecision: 'escalate', expectedBlocked: false, expectedHumanRequired: true },
];

describe('Policy Decision Truth Table', () => {
  for (const row of TRUTH_TABLE) {
    it(`[${row.label}] → ${row.expectedDecision}`, () => {
      const context: PolicyContext = {
        principal: {
          principalId: 'test-principal',
          principalType: row.principalType,
          trustTier: row.trustTier,
        },
        action: row.action,
      };

      const decision = evaluatePolicy(context, POLICIES);

      expect(decision.decision).toBe(row.expectedDecision);
      expect(decision.requiresHuman).toBe(row.expectedHumanRequired);
      expect(decision.reasons.length).toBeGreaterThan(0);

      if (row.expectedDecision === 'deny' || row.expectedDecision === 'escalate') {
        expect(decision.recommendation).toBeDefined();
        expect(decision.recommendation!.safeAlternatives.length).toBeGreaterThan(0);
      }
    });
  }
});

describe('Trust + Policy Combined Truth Table', () => {
  interface CombinedRow {
    label: string;
    trustInput: Parameters<typeof evaluateTrust>[0];
    action: string;
    expectedTier: 0 | 1 | 2;
    expectedPolicyDecision: 'allow' | 'escalate' | 'deny';
  }

  const COMBINED: CombinedRow[] = [
    {
      label: 'Trusted issuer + payment → escalate',
      trustInput: {
        issuer: 'vendor.com',
        signatureValid: true,
        dmarcStatus: 'pass',
        nonceValid: true,
        ttlValid: true,
        orgPolicy: { trustedDomains: ['vendor.com'] },
      },
      action: 'process_payment',
      expectedTier: 1,
      expectedPolicyDecision: 'escalate',
    },
    {
      label: 'Untrusted issuer + payment → deny',
      trustInput: {
        issuer: 'unknown.com',
        signatureValid: false,
        dmarcStatus: 'fail',
      },
      action: 'process_payment',
      expectedTier: 0,
      expectedPolicyDecision: 'deny',
    },
    {
      label: 'High-stakes issuer + read → allow',
      trustInput: {
        issuer: 'bank.com',
        signatureValid: true,
        dmarcStatus: 'pass',
        nonceValid: true,
        ttlValid: true,
        orgPolicy: { trustedDomains: ['bank.com'], highStakesDomains: ['bank.com'] },
      },
      action: 'read_data',
      expectedTier: 2,
      expectedPolicyDecision: 'allow',
    },
    {
      label: 'Replayed nonce + any action → tier 0',
      trustInput: {
        issuer: 'vendor.com',
        signatureValid: true,
        dmarcStatus: 'pass',
        nonceValid: false,
        ttlValid: true,
        orgPolicy: { trustedDomains: ['vendor.com'] },
      },
      action: 'read_data',
      expectedTier: 0,
      expectedPolicyDecision: 'allow', // Read is allowed even at tier 0
    },
    {
      label: 'Expired TTL + failed sig → deny at tier 0',
      trustInput: {
        issuer: 'vendor.com',
        signatureValid: false,
        dmarcStatus: 'pass',
        nonceValid: true,
        ttlValid: false,
      },
      action: 'process_payment',
      expectedTier: 0,
      expectedPolicyDecision: 'deny',
    },
  ];

  for (const row of COMBINED) {
    it(row.label, () => {
      const trust = evaluateTrust(row.trustInput);
      expect(trust.trustTier).toBe(row.expectedTier);

      const decision = evaluatePolicy({
        principal: {
          principalId: 'test',
          principalType: 'user',
          trustTier: trust.trustTier,
        },
        action: row.action,
      }, POLICIES);

      expect(decision.decision).toBe(row.expectedPolicyDecision);
    });
  }
});

describe('Action Gate Integration Truth Table', () => {
  it('blacklisted IP + valid trust → blocked', async () => {
    resetIdCounter();
    const db = createMockDb();
    const blacklist = new CompositeBlacklist();
    blacklist.blockIp('1.2.3.4');

    const result = await shouldBlockAction(db, {
      principal: { principalId: 'u1', principalType: 'user', trustTier: 2 },
      action: 'read_data',
      ip: '1.2.3.4',
    }, { blacklist, policies: POLICIES });

    expect(result.blocked).toBe(true);
    expect(result.recovery).toBeDefined();
  });

  it('replayed nonce + valid everything else → blocked', async () => {
    resetIdCounter();
    const db = createMockDb();
    const nonceStore = new InMemoryNonceStore();
    nonceStore.checkAndSet('nonce-1');

    const result = await shouldBlockAction(db, {
      principal: { principalId: 'u1', principalType: 'user', trustTier: 2 },
      action: 'read_data',
      nonce: 'nonce-1',
    }, { nonceStore, policies: POLICIES });

    expect(result.blocked).toBe(true);
    expect(result.reason).toContain('nonce');
  });

  it('valid nonce + deny policy → blocked by policy', async () => {
    resetIdCounter();
    const db = createMockDb();
    const nonceStore = new InMemoryNonceStore();

    const result = await shouldBlockAction(db, {
      principal: { principalId: 'agent-coo', principalType: 'agent', trustTier: 1 },
      action: 'export_data',
      nonce: 'fresh-nonce',
    }, { nonceStore, policies: POLICIES });

    expect(result.blocked).toBe(true);
    expect(result.reason).toContain('policy');
  });

  it('all gates pass → not blocked', async () => {
    resetIdCounter();
    const db = createMockDb();

    const result = await shouldBlockAction(db, {
      principal: { principalId: 'u1', principalType: 'user', trustTier: 2 },
      action: 'read_data',
      nonce: 'fresh',
    }, {
      blacklist: new CompositeBlacklist(),
      nonceStore: new InMemoryNonceStore(),
      policies: POLICIES,
    });

    expect(result.blocked).toBe(false);
  });
});
