// IHS
import { describe, it, expect } from 'vitest';
import { runSandboxGate } from './sandbox-gate';
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

function makeSandboxCovenant(overrides: Partial<ModuleCovenant> = {}): ModuleCovenant {
  return {
    identity: {
      id: 'sandbox-test',
      canonicalId: 'L-99',
      version: '0.1.0',
      description: 'A test module for sandbox gate validation purposes',
      status: 'local',
      tier: 'being',
      dedication: 'IHS',
    },
    domain: {
      entities: [{ name: 'TestEntity', description: 'A test entity', hasContextLayer: false }],
      events: [{ id: 'sandbox.created', description: 'Created', payloadShape: '{ id: string }' }],
      subscriptions: [],
    },
    capabilities: [
      {
        id: 'sandbox.read',
        description: 'Read sandbox data from the system',
        type: 'query',
        risk: 'observe',
        dataSensitivity: 'none',
        inputs: [],
        output: '{ data: object }',
        whenToUse: 'When you need to read sandbox data.',
      },
      {
        id: 'sandbox.write',
        description: 'Write sandbox data to the system',
        type: 'mutation',
        risk: 'act',
        dataSensitivity: 'internal',
        inputs: [{ name: 'data', type: 'object', required: true, description: 'Data to write' }],
        output: '{ success: boolean }',
        whenToUse: 'When you need to write sandbox data.',
      },
    ],
    dependencies: [],
    invariants: {
      alwaysTrue: ['Data integrity holds'],
      neverHappens: ['Corruption occurs'],
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

describe('Sandbox Gate', () => {
  describe('all 17 existing covenants', () => {
    for (const cov of ALL_COVENANTS) {
      it(`does not fail for ${cov.identity.id}`, async () => {
        const result = await runSandboxGate(cov);
        expect(result.gate).toBe('sandbox');
        expect(result.verdict).not.toBe('fail');
      });
    }
  });

  it('passes with healthy healthCheck', async () => {
    const result = await runSandboxGate(makeSandboxCovenant());
    expect(result.verdict).not.toBe('fail');
    expect(result.issues.filter(i => i.severity === 'error')).toHaveLength(0);
  });

  it('fails when healthCheck returns unhealthy', async () => {
    const cov = makeSandboxCovenant({
      healthCheck: async () => ({ healthy: false, message: 'DB down', checkedAt: new Date() }),
    });
    const result = await runSandboxGate(cov);
    expect(result.verdict).toBe('fail');
    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          severity: 'error',
          message: expect.stringContaining('unhealthy'),
        }),
      ]),
    );
  });

  it('fails when healthCheck throws', async () => {
    const cov = makeSandboxCovenant({
      healthCheck: async () => { throw new Error('Connection refused'); },
    });
    const result = await runSandboxGate(cov);
    expect(result.verdict).toBe('fail');
    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          severity: 'error',
          message: expect.stringContaining('Connection refused'),
        }),
      ]),
    );
  });

  it('fails when healthCheck times out', async () => {
    const cov = makeSandboxCovenant({
      healthCheck: () => new Promise(() => {}), // never resolves
    });
    const result = await runSandboxGate(cov);
    expect(result.verdict).toBe('fail');
    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          severity: 'error',
          message: expect.stringContaining('timed out'),
        }),
      ]),
    );
  }, 10000);

  it('warns when >20 capabilities', async () => {
    const caps: ModuleCapability[] = Array.from({ length: 22 }, (_, i) => ({
      id: `sandbox.cap_${i}`,
      description: `Sandbox capability ${i} for testing`,
      type: 'query' as const,
      risk: 'observe' as const,
      dataSensitivity: 'none' as const,
      inputs: [],
      output: '{ data: object }',
      whenToUse: `When you need sandbox capability ${i}.`,
    }));
    const cov = makeSandboxCovenant({ capabilities: caps });
    const result = await runSandboxGate(cov);
    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          severity: 'warning',
          message: expect.stringContaining('22 capabilities'),
        }),
      ]),
    );
  });

  it('errors when >30 capabilities', async () => {
    const caps: ModuleCapability[] = Array.from({ length: 31 }, (_, i) => ({
      id: `sandbox.cap_${i}`,
      description: `Sandbox capability ${i} for testing`,
      type: 'query' as const,
      risk: 'observe' as const,
      dataSensitivity: 'none' as const,
      inputs: [],
      output: '{ data: object }',
      whenToUse: `When you need sandbox capability ${i}.`,
    }));
    const cov = makeSandboxCovenant({ capabilities: caps });
    const result = await runSandboxGate(cov);
    expect(result.verdict).toBe('fail');
    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          severity: 'error',
          message: expect.stringContaining('31 capabilities'),
        }),
      ]),
    );
  });

  it('warns on act+ mutation with no required inputs', async () => {
    const cov = makeSandboxCovenant({
      capabilities: [
        {
          id: 'sandbox.dangerous',
          description: 'A dangerous mutation with no required inputs',
          type: 'mutation',
          risk: 'act',
          dataSensitivity: 'internal',
          inputs: [
            { name: 'optional', type: 'string', required: false, description: 'Optional input' },
          ],
          output: '{ done: boolean }',
          whenToUse: 'When you need to run the dangerous mutation.',
        },
      ],
    });
    const result = await runSandboxGate(cov);
    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          severity: 'warning',
          message: expect.stringContaining('no required inputs'),
        }),
      ]),
    );
  });

  it('warns on critical sensitivity with observe risk', async () => {
    const cov = makeSandboxCovenant({
      capabilities: [
        {
          id: 'sandbox.sensitive',
          description: 'A critical but observe-only capability for testing',
          type: 'query',
          risk: 'observe',
          dataSensitivity: 'critical',
          inputs: [],
          output: '{ data: object }',
          whenToUse: 'When you need critical data at observe level.',
        },
      ],
    });
    const result = await runSandboxGate(cov);
    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          severity: 'warning',
          message: expect.stringContaining('critical'),
        }),
      ]),
    );
  });

  it('warns on govern risk with many dependencies (blast radius)', async () => {
    const deps = Array.from({ length: 5 }, (_, i) => ({
      moduleId: `dep-module-${i}`,
      required: true,
      capabilities: [`dep${i}.read`],
    }));
    const cov = makeSandboxCovenant({
      capabilities: [
        {
          id: 'sandbox.govern',
          description: 'A govern-level capability with blast radius',
          type: 'action',
          risk: 'govern',
          dataSensitivity: 'sensitive',
          inputs: [{ name: 'confirm', type: 'boolean', required: true, description: 'Confirmation' }],
          output: '{ done: boolean }',
          whenToUse: 'When you need to perform a high-risk governance action.',
          pitfalls: ['Irreversible'],
        },
      ],
      dependencies: deps,
    });
    const result = await runSandboxGate(cov);
    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          severity: 'warning',
          message: expect.stringContaining('blast radius'),
        }),
      ]),
    );
  });

  it('measures positive duration', async () => {
    const result = await runSandboxGate(makeSandboxCovenant());
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });
});
