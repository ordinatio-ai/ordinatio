// IHS
import { describe, it, expect, vi } from 'vitest';
import {
  runMachine,
  initializeMachine,
  isTerminal,
  getMachinePhase,
  executeStep,
  failMachine,
  pauseMachine,
  resumeMachine,
} from './intermittent-machine';
import type {
  AgentExecutor,
  AgentBrief,
  AgentResult,
  MachineConfig,
  MachineState,
  PlannedAction,
} from './machine-types';
import type { GovernancePolicy } from '../governance/types';

// ---------------------------------------------------------------------------
// Test Helpers
// ---------------------------------------------------------------------------

const STARTUP_POLICY: GovernancePolicy = {
  organizationId: 'org-1',
  mode: 'startup',
  approvalThreshold: 'govern',
  overrides: [],
};

const ENTERPRISE_POLICY: GovernancePolicy = {
  organizationId: 'org-1',
  mode: 'enterprise',
  approvalThreshold: 'act',
  overrides: [],
};

function makeConfig(overrides?: Partial<MachineConfig>): MachineConfig {
  return {
    trigger: { type: 'event', source: 'order-placed', metadata: {} },
    contextSnapshot: 'Order #123 placed by client John Doe',
    capabilities: ['order.read', 'email.send'],
    governancePolicy: STARTUP_POLICY,
    agentId: 'coo-agent',
    organizationId: 'org-1',
    ...overrides,
  };
}

function makeAction(capability: string, riskLevel: PlannedAction['riskLevel']): PlannedAction {
  return { capability, riskLevel, parameters: {}, reasoning: 'test reasoning' };
}

/**
 * Create a mock AgentExecutor that returns the given actions.
 */
function createMockExecutor(actions: PlannedAction[], tokensUsed = 500): AgentExecutor {
  return {
    execute: vi.fn(async (_brief: AgentBrief): Promise<AgentResult> => ({
      actions,
      reasoning: 'Mock reasoning',
      llmCallsUsed: 1,
      tokensUsed,
    })),
  };
}

function createThrowingExecutor(error: string): AgentExecutor {
  return {
    execute: vi.fn(async (): Promise<AgentResult> => {
      throw new Error(error);
    }),
  };
}

// ---------------------------------------------------------------------------
// initializeMachine
// ---------------------------------------------------------------------------

describe('initializeMachine', () => {
  it('creates state with awakening phase', () => {
    const state = initializeMachine(makeConfig());
    expect(state.phase).toBe('awakening');
    expect(state.executionId).toMatch(/^exec-/);
    expect(state.budget.llmCallsUsed).toBe(0);
    expect(state.budget.tokensUsed).toBe(0);
    expect(state.budget.actionsExecuted).toBe(0);
    expect(state.actions).toEqual([]);
    expect(state.governanceDecisions).toEqual([]);
    expect(state.startedAt).toBeInstanceOf(Date);
  });

  it('preserves config in state', () => {
    const config = makeConfig({ agentId: 'test-agent' });
    const state = initializeMachine(config);
    expect(state.config.agentId).toBe('test-agent');
    expect(state.config.trigger.source).toBe('order-placed');
  });
});

// ---------------------------------------------------------------------------
// State Queries
// ---------------------------------------------------------------------------

describe('isTerminal', () => {
  it('returns true for resting', () => {
    const state = initializeMachine(makeConfig());
    expect(isTerminal({ ...state, phase: 'resting' })).toBe(true);
  });

  it('returns true for paused', () => {
    const state = initializeMachine(makeConfig());
    expect(isTerminal({ ...state, phase: 'paused' })).toBe(true);
  });

  it('returns true for dormant', () => {
    const state = initializeMachine(makeConfig());
    expect(isTerminal({ ...state, phase: 'dormant' })).toBe(true);
  });

  it('returns false for awakening', () => {
    const state = initializeMachine(makeConfig());
    expect(isTerminal(state)).toBe(false);
  });

  it('returns false for reasoning', () => {
    const state = initializeMachine(makeConfig());
    expect(isTerminal({ ...state, phase: 'reasoning' })).toBe(false);
  });

  it('returns false for acting', () => {
    const state = initializeMachine(makeConfig());
    expect(isTerminal({ ...state, phase: 'acting' })).toBe(false);
  });

  it('returns false for governance_check', () => {
    const state = initializeMachine(makeConfig());
    expect(isTerminal({ ...state, phase: 'governance_check' })).toBe(false);
  });
});

describe('getMachinePhase', () => {
  it('returns the current phase', () => {
    const state = initializeMachine(makeConfig());
    expect(getMachinePhase(state)).toBe('awakening');
  });
});

// ---------------------------------------------------------------------------
// failMachine
// ---------------------------------------------------------------------------

describe('failMachine', () => {
  it('transitions to resting with error', () => {
    const state = initializeMachine(makeConfig());
    const failed = failMachine(state, 'something broke');
    expect(failed.phase).toBe('resting');
    expect(failed.error).toBe('something broke');
  });

  it('is immutable', () => {
    const state = initializeMachine(makeConfig());
    failMachine(state, 'error');
    expect(state.phase).toBe('awakening');
    expect(state.error).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// pauseMachine / resumeMachine
// ---------------------------------------------------------------------------

describe('pauseMachine', () => {
  it('transitions to paused with continuation', () => {
    const state = initializeMachine(makeConfig());
    const continuation = {
      id: 'cont-1',
      awaitingApproval: 'Approve order.create',
      pausedAtCapability: 'order.create',
      state: {},
      expiresAt: new Date(Date.now() + 86400000),
      parentArtifactId: state.executionId,
    };
    const paused = pauseMachine(state, 'Approval needed', continuation);
    expect(paused.phase).toBe('paused');
    expect(paused.pauseReason).toBe('Approval needed');
    expect(paused.continuationToken).toBeDefined();
    expect(paused.continuationToken!.pausedAtCapability).toBe('order.create');
  });
});

describe('resumeMachine', () => {
  it('restores state from continuation token', () => {
    const state = initializeMachine(makeConfig());
    const budget = { llmCallsUsed: 1, tokensUsed: 500, actionsExecuted: 1, elapsedMs: 2000 };
    const completedActions = [makeAction('order.read', 'observe')];
    const continuation = {
      id: 'cont-1',
      awaitingApproval: 'Approve',
      pausedAtCapability: 'order.create',
      state: { budgetSnapshot: budget, completedActions },
      expiresAt: new Date(Date.now() + 86400000),
      parentArtifactId: state.executionId,
    };
    const resumed = resumeMachine(state, continuation);
    expect(resumed.phase).toBe('governance_check');
    expect(resumed.pauseReason).toBeUndefined();
    expect(resumed.continuationToken).toBeUndefined();
    expect(resumed.budget).toEqual(budget);
    expect(resumed.actions).toEqual(completedActions);
  });
});

// ---------------------------------------------------------------------------
// executeStep
// ---------------------------------------------------------------------------

describe('executeStep', () => {
  it('processes observe actions without governance pause', async () => {
    const state = initializeMachine(makeConfig());
    const executor = createMockExecutor([makeAction('order.read', 'observe')]);
    const result = await executeStep(state, executor);

    expect(result.phase).toBe('resting');
    expect(result.actions).toHaveLength(1);
    expect(result.governanceDecisions).toHaveLength(1);
    expect(result.governanceDecisions[0].verdict).toBe('approved');
  });

  it('handles empty actions gracefully', async () => {
    const state = initializeMachine(makeConfig());
    const executor = createMockExecutor([]);
    const result = await executeStep(state, executor);

    expect(result.phase).toBe('resting');
    expect(result.actions).toEqual([]);
  });

  it('handles executor error', async () => {
    const state = initializeMachine(makeConfig());
    const executor = createThrowingExecutor('LLM timeout');
    const result = await executeStep(state, executor);

    expect(result.phase).toBe('resting');
    expect(result.error).toContain('LLM timeout');
  });

  it('pauses for governance when action exceeds threshold', async () => {
    const config = makeConfig({ governancePolicy: ENTERPRISE_POLICY });
    const state = initializeMachine(config);
    const executor = createMockExecutor([makeAction('order.create', 'act')]);
    const result = await executeStep(state, executor);

    expect(result.phase).toBe('paused');
    expect(result.pauseReason).toContain('order.create');
    expect(result.continuationToken).toBeDefined();
  });

  it('processes multiple actions in sequence', async () => {
    const state = initializeMachine(makeConfig());
    const executor = createMockExecutor([
      makeAction('order.read', 'observe'),
      makeAction('client.get', 'observe'),
    ]);
    const result = await executeStep(state, executor);

    expect(result.phase).toBe('resting');
    expect(result.actions).toHaveLength(2);
    expect(result.governanceDecisions).toHaveLength(2);
  });

  it('stops at first governance pause in mixed actions', async () => {
    const config = makeConfig({ governancePolicy: ENTERPRISE_POLICY });
    const state = initializeMachine(config);
    const executor = createMockExecutor([
      makeAction('order.read', 'observe'),
      makeAction('order.create', 'act'),
      makeAction('email.send', 'suggest'),
    ]);
    const result = await executeStep(state, executor);

    expect(result.phase).toBe('paused');
    // First action (observe) should have been recorded
    expect(result.actions).toHaveLength(1);
    // Two governance decisions: approved + requires_approval
    expect(result.governanceDecisions).toHaveLength(2);
  });

  it('records budget from LLM call', async () => {
    const state = initializeMachine(makeConfig());
    const executor = createMockExecutor([makeAction('cap', 'observe')], 2000);
    const result = await executeStep(state, executor);

    expect(result.budget.llmCallsUsed).toBe(1);
    expect(result.budget.tokensUsed).toBe(2000);
    expect(result.budget.actionsExecuted).toBe(1);
  });

  it('stops when LLM call exceeds token budget', async () => {
    const config = makeConfig({ bounds: { maxTokens: 100 } });
    const state = initializeMachine(config);
    const executor = createMockExecutor([makeAction('cap', 'observe')], 5000);
    const result = await executeStep(state, executor);

    // Should stop before processing actions (token budget exceeded after LLM call)
    expect(result.phase).toBe('resting');
    expect(result.actions).toEqual([]);
  });

  it('stops when action count exceeds budget', async () => {
    const config = makeConfig({ bounds: { maxActions: 1 } });
    const state = initializeMachine(config);
    const executor = createMockExecutor([
      makeAction('cap.a', 'observe'),
      makeAction('cap.b', 'observe'),
    ]);
    const result = await executeStep(state, executor);

    // First action recorded, second stopped by bounds
    expect(result.actions).toHaveLength(1);
    expect(result.phase).toBe('resting');
  });
});

// ---------------------------------------------------------------------------
// runMachine (full cycle)
// ---------------------------------------------------------------------------

describe('runMachine', () => {
  it('runs a complete wake → reason → act → rest cycle', async () => {
    const config = makeConfig();
    const executor = createMockExecutor([makeAction('order.read', 'observe')]);
    const result = await runMachine(executor, config);

    expect(result.status).toBe('completed');
    expect(result.artifact.agentRole).toBe('coo-agent');
    expect(result.artifact.actions).toHaveLength(1);
    expect(result.budgetUsed.llmCallsUsed).toBe(1);
    expect(result.exceededBounds).toEqual([]);
  });

  it('returns immediately for noise triggers', async () => {
    const config = makeConfig({
      trigger: { type: 'system', source: 'heartbeat', metadata: {} },
    });
    const executor = createMockExecutor([makeAction('cap', 'observe')]);
    const result = await runMachine(executor, config);

    expect(result.status).toBe('completed');
    expect(result.artifact.actions).toHaveLength(0);
    expect((executor.execute as ReturnType<typeof vi.fn>)).not.toHaveBeenCalled();
  });

  it('produces failed result when executor throws', async () => {
    const config = makeConfig();
    const executor = createThrowingExecutor('Connection refused');
    const result = await runMachine(executor, config);

    expect(result.status).toBe('failed');
    expect(result.artifact.error).toBeDefined();
    expect(result.artifact.error!.message).toContain('Connection refused');
  });

  it('produces paused result when governance blocks', async () => {
    const config = makeConfig({ governancePolicy: ENTERPRISE_POLICY });
    const executor = createMockExecutor([makeAction('order.create', 'act')]);
    const result = await runMachine(executor, config);

    expect(result.status).toBe('paused');
    expect(result.artifact.continuation).toBeDefined();
    expect(result.artifact.continuation!.pausedAtCapability).toBe('order.create');
  });

  it('produces exceeded_bounds when budget exceeded', async () => {
    const config = makeConfig({ bounds: { maxTokens: 100 } });
    const executor = createMockExecutor([makeAction('cap', 'observe')], 5000);
    const result = await runMachine(executor, config);

    expect(result.status).toBe('exceeded_bounds');
    expect(result.exceededBounds.length).toBeGreaterThan(0);
  });

  it('handles empty actions (silence is success)', async () => {
    const config = makeConfig();
    const executor = createMockExecutor([]);
    const result = await runMachine(executor, config);

    expect(result.status).toBe('completed');
    expect(result.artifact.actions).toHaveLength(0);
  });

  it('populates execution timing in artifact', async () => {
    const config = makeConfig();
    const executor = createMockExecutor([makeAction('cap', 'observe')]);
    const result = await runMachine(executor, config);

    expect(result.artifact.startedAt).toBeInstanceOf(Date);
    expect(result.artifact.endedAt).toBeInstanceOf(Date);
    expect(result.artifact.endedAt.getTime()).toBeGreaterThanOrEqual(
      result.artifact.startedAt.getTime(),
    );
  });

  it('populates organization and trigger in artifact', async () => {
    const config = makeConfig();
    const executor = createMockExecutor([]);
    const result = await runMachine(executor, config);

    expect(result.artifact.organizationId).toBe('org-1');
    expect(result.artifact.trigger.source).toBe('order-placed');
  });
});
