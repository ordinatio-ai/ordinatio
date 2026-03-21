// IHS
import { describe, it, expect } from 'vitest';
import {
  generateExecutionId,
  phaseToStatus,
  buildExecutionArtifact,
  buildMachineResult,
} from './artifact-builder';
import type { MachineState } from './machine-types';
import type { GovernancePolicy } from '../governance/types';

const STARTUP_POLICY: GovernancePolicy = {
  organizationId: 'org-1',
  mode: 'startup',
  approvalThreshold: 'govern',
  overrides: [],
};

function makeMachineState(overrides?: Partial<MachineState>): MachineState {
  return {
    executionId: 'exec-test-001',
    config: {
      trigger: { type: 'event', source: 'order-placed', metadata: {} },
      contextSnapshot: 'test context snapshot',
      capabilities: ['order.read', 'email.send'],
      governancePolicy: STARTUP_POLICY,
      agentId: 'coo-agent',
      organizationId: 'org-1',
    },
    phase: 'resting',
    budget: { llmCallsUsed: 2, tokensUsed: 3000, actionsExecuted: 1, elapsedMs: 5000 },
    actions: [
      { capability: 'order.read', riskLevel: 'observe', parameters: { id: '123' }, reasoning: 'Check order' },
    ],
    governanceDecisions: [
      {
        verdict: 'approved',
        capabilityId: 'order.read',
        risk: 'observe',
        threshold: 'govern',
        reason: 'Low risk',
        decidedAt: new Date(),
      },
    ],
    startedAt: new Date(),
    ...overrides,
  };
}

describe('generateExecutionId', () => {
  it('produces exec-{timestamp}-{nonce} format', () => {
    const id = generateExecutionId();
    expect(id).toMatch(/^exec-\d+-[a-z0-9]+$/);
  });

  it('produces unique IDs', () => {
    const ids = new Set(Array.from({ length: 10 }, () => generateExecutionId()));
    expect(ids.size).toBe(10);
  });
});

describe('phaseToStatus', () => {
  it('maps resting to completed', () => {
    expect(phaseToStatus('resting')).toBe('completed');
  });

  it('maps paused to paused', () => {
    expect(phaseToStatus('paused')).toBe('paused');
  });

  it('maps dormant to completed', () => {
    expect(phaseToStatus('dormant')).toBe('completed');
  });

  it('maps any phase with error to failed', () => {
    expect(phaseToStatus('reasoning', 'something broke')).toBe('failed');
    expect(phaseToStatus('resting', 'late error')).toBe('failed');
  });

  it('maps active phases without error to completed', () => {
    expect(phaseToStatus('awakening')).toBe('completed');
    expect(phaseToStatus('reasoning')).toBe('completed');
    expect(phaseToStatus('acting')).toBe('completed');
    expect(phaseToStatus('governance_check')).toBe('completed');
  });
});

describe('buildExecutionArtifact', () => {
  it('builds completed artifact from resting state', () => {
    const state = makeMachineState();
    const artifact = buildExecutionArtifact(state);

    expect(artifact.id).toBe('exec-test-001');
    expect(artifact.agentRole).toBe('coo-agent');
    expect(artifact.status).toBe('completed');
    expect(artifact.actions).toHaveLength(1);
    expect(artifact.actions[0].capabilityId).toBe('order.read');
    expect(artifact.actions[0].verdict).toBe('approved');
    expect(artifact.contextSnapshot).toBe('test context snapshot');
    expect(artifact.consumption.llmCalls).toBe(2);
    expect(artifact.consumption.tokensUsed).toBe(3000);
    expect(artifact.consumption.durationMs).toBe(5000);
    expect(artifact.organizationId).toBe('org-1');
  });

  it('builds failed artifact with error', () => {
    const state = makeMachineState({ error: 'LLM timeout' });
    const artifact = buildExecutionArtifact(state);

    expect(artifact.status).toBe('failed');
    expect(artifact.error).toBeDefined();
    expect(artifact.error!.message).toBe('LLM timeout');
  });

  it('builds paused artifact with continuation', () => {
    const continuation = {
      id: 'cont-1',
      awaitingApproval: 'Approve order.create',
      pausedAtCapability: 'order.create',
      state: {},
      expiresAt: new Date(Date.now() + 86400000),
      parentArtifactId: 'exec-test-001',
    };
    const state = makeMachineState({ phase: 'paused', continuationToken: continuation });
    const artifact = buildExecutionArtifact(state);

    expect(artifact.status).toBe('paused');
    expect(artifact.continuation).toBeDefined();
    expect(artifact.continuation!.pausedAtCapability).toBe('order.create');
  });

  it('builds exceeded_bounds artifact when budget exceeded', () => {
    const state = makeMachineState({
      budget: { llmCallsUsed: 100, tokensUsed: 100_000, actionsExecuted: 50, elapsedMs: 60_000 },
    });
    const artifact = buildExecutionArtifact(state);
    expect(artifact.status).toBe('exceeded_bounds');
  });
});

describe('buildMachineResult', () => {
  it('wraps artifact with budget and exceeded bounds', () => {
    const state = makeMachineState();
    const result = buildMachineResult(state);

    expect(result.executionId).toBe('exec-test-001');
    expect(result.status).toBe('completed');
    expect(result.artifact).toBeDefined();
    expect(result.budgetUsed.llmCallsUsed).toBe(2);
    expect(result.exceededBounds).toEqual([]);
  });

  it('includes exceeded bounds when over budget', () => {
    const state = makeMachineState({
      budget: { llmCallsUsed: 100, tokensUsed: 100_000, actionsExecuted: 50, elapsedMs: 60_000 },
    });
    const result = buildMachineResult(state);
    expect(result.exceededBounds.length).toBeGreaterThan(0);
    expect(result.status).toBe('exceeded_bounds');
  });
});
