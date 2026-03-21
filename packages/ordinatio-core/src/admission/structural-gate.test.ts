// IHS
import { describe, it, expect } from 'vitest';
import { runStructuralGate } from './structural-gate';
import type { ModuleCovenant } from '../covenant/types';
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

function makeValidCovenant(overrides: Partial<ModuleCovenant> = {}): ModuleCovenant {
  return {
    identity: {
      id: 'test-module',
      canonicalId: 'X-01',
      version: '0.1.0',
      description: 'A test module for structural gate validation',
      status: 'local',
      tier: 'being',
      dedication: 'IHS',
    },
    domain: {
      entities: [{ name: 'TestEntity', description: 'A test entity', hasContextLayer: false }],
      events: [{ id: 'test.created', description: 'Entity created', payloadShape: '{ id: string }' }],
      subscriptions: [],
    },
    capabilities: [
      {
        id: 'test.read',
        description: 'Read test data from the system',
        type: 'query',
        risk: 'observe',
        dataSensitivity: 'none',
        inputs: [],
        output: '{ data: object }',
        whenToUse: 'When you need to read test data from the system.',
      },
      {
        id: 'test.write',
        description: 'Write test data to the system',
        type: 'mutation',
        risk: 'act',
        dataSensitivity: 'internal',
        inputs: [{ name: 'data', type: 'object', required: true, description: 'Data to write' }],
        output: '{ success: boolean }',
        whenToUse: 'When you need to persist test data to the system.',
      },
    ],
    dependencies: [],
    invariants: {
      alwaysTrue: ['Test data is always consistent'],
      neverHappens: ['Data corruption never occurs'],
    },
    healthCheck: async () => ({ healthy: true, message: 'OK', checkedAt: new Date() }),
    ...overrides,
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

describe('Structural Gate', () => {
  describe('all 17 existing covenants', () => {
    for (const cov of ALL_COVENANTS) {
      it(`passes for ${cov.identity.id}`, () => {
        const result = runStructuralGate(cov);
        expect(result.gate).toBe('structural');
        expect(result.verdict).not.toBe('fail');
        expect(result.durationMs).toBeGreaterThanOrEqual(0);
      });
    }
  });

  it('passes a valid local covenant', () => {
    const result = runStructuralGate(makeValidCovenant());
    expect(result.verdict).not.toBe('fail');
    expect(result.issues.filter(i => i.severity === 'error')).toHaveLength(0);
  });

  it('fails for invalid covenant (missing identity)', () => {
    const bad = makeValidCovenant({
      identity: {
        id: '',
        canonicalId: 'INVALID',
        version: 'bad',
        description: 'short',
        status: 'canonical',
        tier: 'being',
        dedication: 'IHS',
      },
    });
    const result = runStructuralGate(bad);
    expect(result.verdict).toBe('fail');
    expect(result.issues.some(i => i.severity === 'error')).toBe(true);
  });

  it('detects duplicate module ID', () => {
    const cov = makeValidCovenant();
    const result = runStructuralGate(cov, ['test-module']);
    expect(result.verdict).toBe('fail');
    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ severity: 'error', message: expect.stringContaining('already registered') }),
      ]),
    );
  });

  it('warns on excessive complexity', () => {
    // Create a covenant with many heavy capabilities + entities + events + deps to push score high
    const manyCaps = Array.from({ length: 25 }, (_, i) => ({
      id: `test.cap_${i}`,
      description: `Test capability number ${i} for complexity testing`,
      type: 'composite' as const,  // heaviest weight (4)
      risk: 'act' as const,
      dataSensitivity: 'internal' as const,
      inputs: [{ name: 'data', type: 'object', required: true, description: 'Input data' }],
      output: '{ result: boolean }',
      whenToUse: `When you need action ${i} in the system.`,
    }));
    const manyEntities = Array.from({ length: 10 }, (_, i) => ({
      name: `Entity${i}`,
      description: `Entity ${i}`,
      hasContextLayer: false,
    }));
    const manyEvents = Array.from({ length: 12 }, (_, i) => ({
      id: `test.event_${i}`,
      description: `Event ${i}`,
      payloadShape: '{ id: string }',
    }));
    const manyDeps = Array.from({ length: 7 }, (_, i) => ({
      moduleId: `dep-${i}`,
      required: false,
      capabilities: [`dep${i}.read`],
    }));
    const cov = makeValidCovenant({
      capabilities: manyCaps,
      domain: { entities: manyEntities, events: manyEvents, subscriptions: [] },
      dependencies: manyDeps,
    });
    const result = runStructuralGate(cov);
    // Should have complexity warning
    const complexityIssues = result.issues.filter(i => i.path === 'complexity');
    expect(complexityIssues.length).toBeGreaterThanOrEqual(1);
    expect(complexityIssues[0].severity).toBe('warning');
  });

  it('attaches validationResult and complexityReport to metadata', () => {
    const result = runStructuralGate(makeValidCovenant());
    expect(result.metadata).toBeDefined();
    expect(result.metadata!.validationResult).toBeDefined();
    expect(result.metadata!.complexityReport).toBeDefined();
  });

  it('measures positive duration', () => {
    const result = runStructuralGate(makeValidCovenant());
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });
});
