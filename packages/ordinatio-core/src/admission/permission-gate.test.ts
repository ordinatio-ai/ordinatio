// IHS
import { describe, it, expect } from 'vitest';
import { runPermissionGate } from './permission-gate';
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

function makeCovenantWithStatus(
  status: 'canonical' | 'ecclesial' | 'local' | 'experimental',
  capOverrides: Partial<ModuleCapability>[] = [{}],
): ModuleCovenant {
  const capabilities: ModuleCapability[] = capOverrides.map((override, i) => ({
    id: `test.cap_${i}`,
    description: 'A test capability for permission gate validation',
    type: 'query',
    risk: 'observe',
    dataSensitivity: 'none',
    inputs: [],
    output: '{ data: object }',
    whenToUse: 'When you need to test something in the system.',
    ...override,
  }));

  return {
    identity: {
      id: 'test-module',
      canonicalId: status === 'canonical' ? 'C-99' : status === 'ecclesial' ? 'E-99' : status === 'local' ? 'L-99' : 'X-99',
      version: '0.1.0',
      description: 'A test module for permission gate validation',
      status,
      tier: 'being',
      dedication: 'IHS',
    },
    domain: {
      entities: [{ name: 'TestEntity', description: 'A test entity', hasContextLayer: false }],
      events: [{ id: 'test.created', description: 'Entity created', payloadShape: '{ id: string }' }],
      subscriptions: [],
    },
    capabilities,
    dependencies: [],
    invariants: {
      alwaysTrue: ['Test data is always consistent'],
      neverHappens: ['Data corruption never occurs'],
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

describe('Permission Gate', () => {
  describe('all 17 existing covenants', () => {
    for (const cov of ALL_COVENANTS) {
      it(`does not fail for ${cov.identity.id}`, () => {
        const result = runPermissionGate(cov);
        expect(result.gate).toBe('permission');
        // Canonical/ecclesial covenants should NOT fail — they may warn but not error
        expect(result.verdict).not.toBe('fail');
      });
    }
  });

  it('local module with govern risk → error', () => {
    const cov = makeCovenantWithStatus('local', [{ risk: 'govern', type: 'action' }]);
    const result = runPermissionGate(cov);
    expect(result.verdict).toBe('fail');
    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ severity: 'error', message: expect.stringContaining('govern') }),
      ]),
    );
  });

  it('experimental module with govern risk → error', () => {
    const cov = makeCovenantWithStatus('experimental', [{ risk: 'govern', type: 'action' }]);
    const result = runPermissionGate(cov);
    expect(result.verdict).toBe('fail');
  });

  it('local module with critical sensitivity → error', () => {
    const cov = makeCovenantWithStatus('local', [{ dataSensitivity: 'critical' }]);
    const result = runPermissionGate(cov);
    expect(result.verdict).toBe('fail');
    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ severity: 'error', message: expect.stringContaining('critical') }),
      ]),
    );
  });

  it('experimental module with critical sensitivity → error', () => {
    const cov = makeCovenantWithStatus('experimental', [{ dataSensitivity: 'critical' }]);
    const result = runPermissionGate(cov);
    expect(result.verdict).toBe('fail');
  });

  it('ecclesial module with govern risk → warning', () => {
    const cov = makeCovenantWithStatus('ecclesial', [{ risk: 'govern', type: 'action' }]);
    const result = runPermissionGate(cov);
    expect(result.verdict).toBe('warn');
    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ severity: 'warning', message: expect.stringContaining('govern') }),
      ]),
    );
  });

  it('canonical module with full risk range → passes', () => {
    const cov = makeCovenantWithStatus('canonical', [
      { id: 'test.observe', risk: 'observe', type: 'query' },
      { id: 'test.suggest', risk: 'suggest', type: 'mutation' },
      { id: 'test.act', risk: 'act', type: 'mutation' },
      { id: 'test.govern', risk: 'govern', type: 'action' },
    ]);
    const result = runPermissionGate(cov);
    expect(result.verdict).not.toBe('fail');
  });

  it('canonical module with critical sensitivity → passes', () => {
    const cov = makeCovenantWithStatus('canonical', [{ dataSensitivity: 'critical' }]);
    const result = runPermissionGate(cov);
    expect(result.issues.filter(i => i.severity === 'error')).toHaveLength(0);
  });

  it('mutation with observe risk → warning', () => {
    const cov = makeCovenantWithStatus('canonical', [{ type: 'mutation', risk: 'observe' }]);
    const result = runPermissionGate(cov);
    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ severity: 'warning', message: expect.stringContaining('observe') }),
      ]),
    );
  });

  it('action with observe risk → warning', () => {
    const cov = makeCovenantWithStatus('canonical', [{ type: 'action', risk: 'observe' }]);
    const result = runPermissionGate(cov);
    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ severity: 'warning', message: expect.stringContaining('observe') }),
      ]),
    );
  });

  it('query with observe risk → clean pass', () => {
    const cov = makeCovenantWithStatus('local', [{ type: 'query', risk: 'observe' }]);
    const result = runPermissionGate(cov);
    expect(result.verdict).toBe('pass');
    expect(result.issues).toHaveLength(0);
  });

  it('measures positive duration', () => {
    const result = runPermissionGate(makeCovenantWithStatus('local'));
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });
});
