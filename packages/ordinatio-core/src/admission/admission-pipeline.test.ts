// IHS
import { describe, it, expect } from 'vitest';
import { runAdmissionPipeline, canAutoAdmit } from './admission-pipeline';
import type { ModuleCovenant, ModuleCapability } from '../covenant/types';
import type { AdmissionRequest } from './types';
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

const ALL_COVENANTS: readonly ModuleCovenant[] = [
  EMAIL_ENGINE_COVENANT, ENTITY_REGISTRY_COVENANT, AUTH_ENGINE_COVENANT,
  TASK_ENGINE_COVENANT, WORKFLOW_ENGINE_COVENANT, AUTOMATION_FABRIC_COVENANT,
  SETTINGS_ENGINE_COVENANT, SECURITY_ENGINE_COVENANT, AUDIT_LEDGER_COVENANT,
  SEARCH_ENGINE_COVENANT, AGENT_ENGINE_COVENANT, JOB_ENGINE_COVENANT,
  FINANCE_ENGINE_COVENANT, COMMERCE_ENGINE_COVENANT, KNOWLEDGE_ENGINE_COVENANT,
  REPORTING_ENGINE_COVENANT, INVENTORY_ENGINE_COVENANT,
];

/** Convert kebab-case to underscore prefix for capability/event IDs (DOTTED_ID requires [a-z0-9_]) */
function toPrefix(id: string): string {
  return id.replace(/-/g, '_');
}

function makeLocalCovenant(id = 'test-local'): ModuleCovenant {
  const prefix = toPrefix(id);
  return {
    identity: {
      id,
      canonicalId: 'L-99',
      version: '0.1.0',
      description: 'A local test module for pipeline testing purposes',
      status: 'local',
      tier: 'being',
      dedication: 'IHS',
    },
    domain: {
      entities: [{ name: 'TestLocal', description: 'A test entity', hasContextLayer: false }],
      events: [{ id: `${prefix}.created`, description: 'Created', payloadShape: '{ id: string }' }],
      subscriptions: [],
    },
    capabilities: [
      {
        id: `${prefix}.read`,
        description: 'Read test data from the local module',
        type: 'query',
        risk: 'observe',
        dataSensitivity: 'none',
        inputs: [],
        output: '{ data: object }',
        whenToUse: 'When you need to read local test data.',
      },
      {
        id: `${prefix}.write`,
        description: 'Write test data to the local module',
        type: 'mutation',
        risk: 'act',
        dataSensitivity: 'internal',
        inputs: [{ name: 'data', type: 'object', required: true, description: 'Data' }],
        output: '{ success: boolean }',
        whenToUse: 'When you need to write local test data.',
      },
    ],
    dependencies: [],
    invariants: {
      alwaysTrue: ['Data is consistent'],
      neverHappens: ['Corruption occurs'],
    },
    healthCheck: async () => ({ healthy: true, message: 'OK', checkedAt: new Date() }),
  };
}

function makeExperimentalCovenant(id = 'test-experimental'): ModuleCovenant {
  return { ...makeLocalCovenant(id), identity: { ...makeLocalCovenant(id).identity, id, status: 'experimental', canonicalId: 'X-99' } };
}

function makeEcclesialCovenant(id = 'test-ecclesial'): ModuleCovenant {
  return { ...makeLocalCovenant(id), identity: { ...makeLocalCovenant(id).identity, id, status: 'ecclesial', canonicalId: 'E-99' } };
}

function makeCanonicalCovenant(id = 'test-canonical'): ModuleCovenant {
  return { ...makeLocalCovenant(id), identity: { ...makeLocalCovenant(id).identity, id, status: 'canonical', canonicalId: 'C-99' } };
}

function makeRequest(covenant: ModuleCovenant, overrides: Partial<AdmissionRequest> = {}): AdmissionRequest {
  return {
    covenant,
    existingCovenants: ALL_COVENANTS,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Admission Pipeline', () => {
  describe('all 17 existing covenants produce decisions', () => {
    for (const cov of ALL_COVENANTS) {
      it(`produces a decision for ${cov.identity.id}`, async () => {
        // Run against OTHER covenants (exclude self to avoid duplicate ID)
        const others = ALL_COVENANTS.filter(c => c.identity.id !== cov.identity.id);
        const decision = await runAdmissionPipeline(makeRequest(cov, { existingCovenants: others }));
        expect(decision.moduleId).toBe(cov.identity.id);
        expect(decision.moduleStatus).toBe(cov.identity.status);
        expect(decision.verdict).toBeDefined();
        expect(decision.gates.length).toBeGreaterThan(0);
        expect(decision.durationMs).toBeGreaterThanOrEqual(0);
      });
    }
  });

  it('local module with clean gates → admitted', async () => {
    const decision = await runAdmissionPipeline(makeRequest(makeLocalCovenant()));
    expect(decision.verdict).toBe('admitted');
    expect(decision.errorCount).toBe(0);
    expect(decision.warningCount).toBe(0);
    expect(decision.rejectionReasons).toHaveLength(0);
  });

  it('local module with warnings → admitted_conditional', async () => {
    // mutation + observe risk triggers permission gate warning
    const cov = makeLocalCovenant('test-warned');
    const warned: ModuleCovenant = {
      ...cov,
      capabilities: [
        {
          id: 'test_warned.dangerous',
          description: 'A mutation at observe risk to trigger warning',
          type: 'mutation',
          risk: 'observe',
          dataSensitivity: 'none',
          inputs: [],
          output: '{ done: boolean }',
          whenToUse: 'Testing warning conditions in pipeline.',
        },
      ],
    };
    const decision = await runAdmissionPipeline(makeRequest(warned));
    expect(decision.verdict).toBe('admitted_conditional');
    expect(decision.warningCount).toBeGreaterThan(0);
  });

  it('experimental module → admitted_conditional', async () => {
    const decision = await runAdmissionPipeline(makeRequest(makeExperimentalCovenant()));
    expect(decision.verdict).toBe('admitted_conditional');
  });

  it('ecclesial module → deferred (requires_cross_enterprise_review)', async () => {
    const decision = await runAdmissionPipeline(makeRequest(makeEcclesialCovenant()));
    expect(decision.verdict).toBe('deferred');
    expect(decision.deferralReason).toBe('requires_cross_enterprise_review');
  });

  it('canonical module → deferred (requires_council_disputation)', async () => {
    const decision = await runAdmissionPipeline(makeRequest(makeCanonicalCovenant()));
    expect(decision.verdict).toBe('deferred');
    expect(decision.deferralReason).toBe('requires_council_disputation');
  });

  it('invalid module → rejected', async () => {
    const bad: ModuleCovenant = {
      identity: {
        id: '',
        canonicalId: 'INVALID',
        version: 'bad',
        description: 'short',
        status: 'local',
        tier: 'being',
        dedication: 'IHS',
      },
      domain: { entities: [], events: [], subscriptions: [] },
      capabilities: [],
      dependencies: [],
      invariants: { alwaysTrue: [], neverHappens: [] },
      healthCheck: async () => ({ healthy: true, message: 'OK', checkedAt: new Date() }),
    };
    const decision = await runAdmissionPipeline(makeRequest(bad));
    expect(decision.verdict).toBe('rejected');
    expect(decision.rejectionReasons.length).toBeGreaterThan(0);
  });

  it('skipGates works', async () => {
    const decision = await runAdmissionPipeline(
      makeRequest(makeLocalCovenant(), { skipGates: ['sandbox'] }),
    );
    const gateIds = decision.gates.map(g => g.gate);
    expect(gateIds).not.toContain('sandbox');
    expect(gateIds).toContain('structural');
    expect(gateIds).toContain('permission');
    expect(gateIds).toContain('conflict');
    expect(gateIds).toContain('governance');
  });

  it('early termination on structural failure', async () => {
    const bad: ModuleCovenant = {
      identity: {
        id: '',
        canonicalId: 'BAD',
        version: 'x',
        description: 'tiny',
        status: 'local',
        tier: 'being',
        dedication: 'IHS',
      },
      domain: { entities: [], events: [], subscriptions: [] },
      capabilities: [],
      dependencies: [],
      invariants: { alwaysTrue: [], neverHappens: [] },
      healthCheck: async () => ({ healthy: true, message: 'OK', checkedAt: new Date() }),
    };
    const decision = await runAdmissionPipeline(makeRequest(bad));
    expect(decision.verdict).toBe('rejected');
    // Should only have structural and possibly permission gates (early termination)
    const gateIds = decision.gates.map(g => g.gate);
    expect(gateIds).toContain('structural');
    // Should NOT have sandbox (skipped due to early termination)
    expect(gateIds).not.toContain('sandbox');
  });

  it('includes complexityReport and validationResult from structural gate', async () => {
    const decision = await runAdmissionPipeline(makeRequest(makeLocalCovenant()));
    expect(decision.complexityReport).toBeDefined();
    expect(decision.complexityReport!.moduleId).toBe('test-local');
    expect(decision.validationResult).toBeDefined();
    expect(decision.validationResult!.moduleId).toBe('test-local');
  });

  it('positive timing on all decisions', async () => {
    const decision = await runAdmissionPipeline(makeRequest(makeLocalCovenant()));
    expect(decision.durationMs).toBeGreaterThanOrEqual(0);
    for (const gate of decision.gates) {
      expect(gate.durationMs).toBeGreaterThanOrEqual(0);
    }
  });
});

describe('canAutoAdmit', () => {
  it('returns true for admitted verdict', async () => {
    const decision = await runAdmissionPipeline(makeRequest(makeLocalCovenant()));
    expect(canAutoAdmit(decision)).toBe(true);
  });

  it('returns false for admitted_conditional', async () => {
    const decision = await runAdmissionPipeline(makeRequest(makeExperimentalCovenant()));
    expect(canAutoAdmit(decision)).toBe(false);
  });

  it('returns false for deferred', async () => {
    const decision = await runAdmissionPipeline(makeRequest(makeCanonicalCovenant()));
    expect(canAutoAdmit(decision)).toBe(false);
  });

  it('returns false for rejected', async () => {
    const bad: ModuleCovenant = {
      identity: { id: '', canonicalId: 'BAD', version: 'x', description: 'tiny', status: 'local', tier: 'being', dedication: 'IHS' },
      domain: { entities: [], events: [], subscriptions: [] },
      capabilities: [],
      dependencies: [],
      invariants: { alwaysTrue: [], neverHappens: [] },
      healthCheck: async () => ({ healthy: true, message: 'OK', checkedAt: new Date() }),
    };
    const decision = await runAdmissionPipeline(makeRequest(bad));
    expect(canAutoAdmit(decision)).toBe(false);
  });
});
