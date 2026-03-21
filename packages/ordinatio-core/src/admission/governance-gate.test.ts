// IHS
import { describe, it, expect } from 'vitest';
import { runGovernanceGate } from './governance-gate';
import type { ModuleCovenant, ModuleCapability } from '../covenant/types';
import {
  EMAIL_ENGINE_COVENANT,
  ENTITY_REGISTRY_COVENANT,
  AUTH_ENGINE_COVENANT,
  TASK_ENGINE_COVENANT,
  WORKFLOW_ENGINE_COVENANT,
  AUTOMATION_FABRIC_COVENANT,
  SETTINGS_ENGINE_COVENANT,
  SECURITY_ENGINE_COVENANT,
  AUDIT_LEDGER_COVENANT,
  SEARCH_ENGINE_COVENANT,
  AGENT_ENGINE_COVENANT,
  JOB_ENGINE_COVENANT,
  FINANCE_ENGINE_COVENANT,
  COMMERCE_ENGINE_COVENANT,
  KNOWLEDGE_ENGINE_COVENANT,
  REPORTING_ENGINE_COVENANT,
  INVENTORY_ENGINE_COVENANT,
} from '../covenants';

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

function makeCovenantWithCaps(caps: Partial<ModuleCapability>[]): ModuleCovenant {
  const capabilities: ModuleCapability[] = caps.map((override, i) => ({
    id: `test.cap_${i}`,
    description: 'A test capability for governance gate testing',
    type: 'query',
    risk: 'observe',
    dataSensitivity: 'none',
    inputs: [],
    output: '{ data: object }',
    whenToUse: 'When you need to use this test capability.',
    ...override,
  }));

  return {
    identity: {
      id: 'test-governance',
      canonicalId: 'L-99',
      version: '0.1.0',
      description: 'A test module for governance gate validation',
      status: 'local',
      tier: 'being',
      dedication: 'IHS',
    },
    domain: {
      entities: [{ name: 'TestEntity', description: 'A test entity', hasContextLayer: false }],
      events: [{ id: 'test.created', description: 'Created', payloadShape: '{ id: string }' }],
      subscriptions: [],
    },
    capabilities,
    dependencies: [],
    invariants: {
      alwaysTrue: ['Data integrity holds'],
      neverHappens: ['Corruption occurs'],
    },
    healthCheck: async () => ({ healthy: true, message: 'OK', checkedAt: new Date() }),
  };
}

const ALL_COVENANTS: readonly ModuleCovenant[] = [
  EMAIL_ENGINE_COVENANT, ENTITY_REGISTRY_COVENANT, AUTH_ENGINE_COVENANT,
  TASK_ENGINE_COVENANT, WORKFLOW_ENGINE_COVENANT, AUTOMATION_FABRIC_COVENANT,
  SETTINGS_ENGINE_COVENANT, SECURITY_ENGINE_COVENANT, AUDIT_LEDGER_COVENANT,
  SEARCH_ENGINE_COVENANT, AGENT_ENGINE_COVENANT, JOB_ENGINE_COVENANT,
  FINANCE_ENGINE_COVENANT, COMMERCE_ENGINE_COVENANT, KNOWLEDGE_ENGINE_COVENANT,
  REPORTING_ENGINE_COVENANT, INVENTORY_ENGINE_COVENANT,
];

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Governance Gate', () => {
  describe('all 17 existing covenants', () => {
    for (const cov of ALL_COVENANTS) {
      it(`does not fail for ${cov.identity.id}`, () => {
        const result = runGovernanceGate(cov);
        expect(result.gate).toBe('governance');
        expect(result.verdict).not.toBe('fail');
      });
    }
  });

  it('warns on govern risk without pitfalls', () => {
    const cov = makeCovenantWithCaps([{
      id: 'test.dangerous',
      risk: 'govern',
      type: 'action',
      // No pitfalls
    }]);
    const result = runGovernanceGate(cov);
    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          severity: 'warning',
          message: expect.stringContaining('pitfalls'),
        }),
      ]),
    );
  });

  it('does not warn on govern risk with pitfalls', () => {
    const cov = makeCovenantWithCaps([{
      id: 'test.dangerous',
      risk: 'govern',
      type: 'action',
      pitfalls: ['This is irreversible'],
    }]);
    const result = runGovernanceGate(cov);
    const pitfallIssues = result.issues.filter(i => i.message.includes('pitfalls'));
    expect(pitfallIssues).toHaveLength(0);
  });

  it('warns on empty whenToUse for act+ capability', () => {
    const cov = makeCovenantWithCaps([{
      id: 'test.action',
      risk: 'act',
      type: 'mutation',
      whenToUse: 'short', // <10 chars
    }]);
    const result = runGovernanceGate(cov);
    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          severity: 'warning',
          message: expect.stringContaining('whenToUse'),
        }),
      ]),
    );
  });

  it('warns on empty description for act+ capability', () => {
    const cov = makeCovenantWithCaps([{
      id: 'test.action',
      risk: 'act',
      type: 'mutation',
      description: 'tiny', // <10 chars
    }]);
    const result = runGovernanceGate(cov);
    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          severity: 'warning',
          message: expect.stringContaining('description'),
        }),
      ]),
    );
  });

  it('does not warn on observe capability with short whenToUse', () => {
    const cov = makeCovenantWithCaps([{
      id: 'test.read',
      risk: 'observe',
      type: 'query',
      whenToUse: 'read', // Short but observe-level
      description: 'read stuff',
    }]);
    const result = runGovernanceGate(cov);
    // observe-level should not trigger act+ documentation warnings
    const docIssues = result.issues.filter(i =>
      i.message.includes('whenToUse') || i.message.includes('description'),
    );
    expect(docIssues).toHaveLength(0);
  });

  it('errors on invalid risk value', () => {
    const cov = makeCovenantWithCaps([{
      risk: 'invalid' as any,
    }]);
    const result = runGovernanceGate(cov);
    expect(result.verdict).toBe('fail');
    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          severity: 'error',
          message: expect.stringContaining('invalid risk'),
        }),
      ]),
    );
  });

  it('errors on invalid dataSensitivity value', () => {
    const cov = makeCovenantWithCaps([{
      dataSensitivity: 'top-secret' as any,
    }]);
    const result = runGovernanceGate(cov);
    expect(result.verdict).toBe('fail');
    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          severity: 'error',
          message: expect.stringContaining('data sensitivity'),
        }),
      ]),
    );
  });

  it('errors when healthCheck is not a function', () => {
    const cov = makeCovenantWithCaps([]);
    const noHealth = { ...cov, healthCheck: 'not-a-function' as any };
    const result = runGovernanceGate(noHealth);
    expect(result.verdict).toBe('fail');
    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          severity: 'error',
          message: expect.stringContaining('Health check'),
        }),
      ]),
    );
  });

  it('measures positive duration', () => {
    const result = runGovernanceGate(makeCovenantWithCaps([{ risk: 'observe' }]));
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });
});
