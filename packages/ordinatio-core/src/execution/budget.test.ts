// IHS
import { describe, it, expect } from 'vitest';
import {
  createBudgetSnapshot,
  recordLlmCall,
  recordAction,
  updateElapsed,
  checkBounds,
  getRemainingBudget,
  toConsumption,
  resolveBounds,
} from './budget';
import type { ExecutionBounds } from './types';
import { DEFAULT_EXECUTION_BOUNDS } from './types';
import type { MachineConfig } from './machine-types';

const TEST_BOUNDS: ExecutionBounds = {
  maxLlmCalls: 5,
  timeoutMs: 10_000,
  maxTokens: 20_000,
  maxActions: 10,
};

function makeMachineConfig(bounds?: Partial<ExecutionBounds>): MachineConfig {
  return {
    trigger: { type: 'event', source: 'test', metadata: {} },
    contextSnapshot: 'test context',
    capabilities: ['cap.read'],
    governancePolicy: {
      organizationId: 'org-1',
      mode: 'startup',
      approvalThreshold: 'govern',
      overrides: [],
    },
    bounds,
  };
}

describe('createBudgetSnapshot', () => {
  it('creates a snapshot with all zeros', () => {
    const snap = createBudgetSnapshot();
    expect(snap.llmCallsUsed).toBe(0);
    expect(snap.tokensUsed).toBe(0);
    expect(snap.actionsExecuted).toBe(0);
    expect(snap.elapsedMs).toBe(0);
  });
});

describe('recordLlmCall', () => {
  it('increments llmCallsUsed and tokensUsed', () => {
    const snap = createBudgetSnapshot();
    const next = recordLlmCall(snap, 1500);
    expect(next.llmCallsUsed).toBe(1);
    expect(next.tokensUsed).toBe(1500);
  });

  it('is immutable (does not modify original)', () => {
    const snap = createBudgetSnapshot();
    recordLlmCall(snap, 500);
    expect(snap.llmCallsUsed).toBe(0);
    expect(snap.tokensUsed).toBe(0);
  });

  it('accumulates across multiple calls', () => {
    let snap = createBudgetSnapshot();
    snap = recordLlmCall(snap, 1000);
    snap = recordLlmCall(snap, 2000);
    expect(snap.llmCallsUsed).toBe(2);
    expect(snap.tokensUsed).toBe(3000);
  });
});

describe('recordAction', () => {
  it('increments actionsExecuted', () => {
    const snap = createBudgetSnapshot();
    const next = recordAction(snap);
    expect(next.actionsExecuted).toBe(1);
  });

  it('is immutable', () => {
    const snap = createBudgetSnapshot();
    recordAction(snap);
    expect(snap.actionsExecuted).toBe(0);
  });
});

describe('updateElapsed', () => {
  it('sets elapsedMs', () => {
    const snap = createBudgetSnapshot();
    const next = updateElapsed(snap, 5000);
    expect(next.elapsedMs).toBe(5000);
  });

  it('is immutable', () => {
    const snap = createBudgetSnapshot();
    updateElapsed(snap, 3000);
    expect(snap.elapsedMs).toBe(0);
  });
});

describe('checkBounds', () => {
  it('returns empty when within all bounds', () => {
    const snap = createBudgetSnapshot();
    expect(checkBounds(snap, TEST_BOUNDS)).toEqual([]);
  });

  it('detects time exceeded', () => {
    const snap = updateElapsed(createBudgetSnapshot(), 15_000);
    const exceeded = checkBounds(snap, TEST_BOUNDS);
    expect(exceeded).toHaveLength(1);
    expect(exceeded[0].bound).toBe('timeoutMs');
    expect(exceeded[0].limit).toBe(10_000);
    expect(exceeded[0].actual).toBe(15_000);
  });

  it('detects time at exact boundary', () => {
    const snap = updateElapsed(createBudgetSnapshot(), 10_000);
    const exceeded = checkBounds(snap, TEST_BOUNDS);
    expect(exceeded.some(e => e.bound === 'timeoutMs')).toBe(true);
  });

  it('detects LLM calls exceeded', () => {
    let snap = createBudgetSnapshot();
    for (let i = 0; i < 6; i++) snap = recordLlmCall(snap, 100);
    const exceeded = checkBounds(snap, TEST_BOUNDS);
    expect(exceeded.some(e => e.bound === 'maxLlmCalls')).toBe(true);
  });

  it('detects tokens exceeded', () => {
    const snap = recordLlmCall(createBudgetSnapshot(), 25_000);
    const exceeded = checkBounds(snap, TEST_BOUNDS);
    expect(exceeded.some(e => e.bound === 'maxTokens')).toBe(true);
  });

  it('detects actions exceeded', () => {
    let snap = createBudgetSnapshot();
    for (let i = 0; i < 11; i++) snap = recordAction(snap);
    const exceeded = checkBounds(snap, TEST_BOUNDS);
    expect(exceeded.some(e => e.bound === 'maxActions')).toBe(true);
  });

  it('returns bounds in priority order (time > llm > tokens > actions)', () => {
    let snap = updateElapsed(createBudgetSnapshot(), 15_000);
    for (let i = 0; i < 6; i++) snap = recordLlmCall(snap, 5000);
    for (let i = 0; i < 11; i++) snap = recordAction(snap);
    const exceeded = checkBounds(snap, TEST_BOUNDS);
    expect(exceeded.length).toBeGreaterThanOrEqual(3);
    expect(exceeded[0].bound).toBe('timeoutMs');
    expect(exceeded[1].bound).toBe('maxLlmCalls');
    expect(exceeded[2].bound).toBe('maxTokens');
  });
});

describe('getRemainingBudget', () => {
  it('computes remaining for all dimensions', () => {
    let snap = createBudgetSnapshot();
    snap = recordLlmCall(snap, 5000);
    snap = recordAction(snap);
    snap = updateElapsed(snap, 3000);

    const remaining = getRemainingBudget(snap, TEST_BOUNDS);
    expect(remaining.llmCalls).toBe(4);
    expect(remaining.tokens).toBe(15_000);
    expect(remaining.actions).toBe(9);
    expect(remaining.timeMs).toBe(7000);
  });

  it('clamps to zero when exceeded', () => {
    const snap = updateElapsed(createBudgetSnapshot(), 20_000);
    const remaining = getRemainingBudget(snap, TEST_BOUNDS);
    expect(remaining.timeMs).toBe(0);
  });
});

describe('toConsumption', () => {
  it('maps BudgetSnapshot to ExecutionConsumption', () => {
    let snap = createBudgetSnapshot();
    snap = recordLlmCall(snap, 3000);
    snap = recordAction(snap);
    snap = recordAction(snap);
    snap = updateElapsed(snap, 2500);

    const consumption = toConsumption(snap);
    expect(consumption.llmCalls).toBe(1);
    expect(consumption.tokensUsed).toBe(3000);
    expect(consumption.durationMs).toBe(2500);
    expect(consumption.actionsPerformed).toBe(2);
    expect(consumption.auditEntriesCreated).toBe(2);
  });
});

describe('resolveBounds', () => {
  it('uses defaults when no bounds specified', () => {
    const config = makeMachineConfig();
    const bounds = resolveBounds(config);
    expect(bounds).toEqual(DEFAULT_EXECUTION_BOUNDS);
  });

  it('merges partial overrides with defaults', () => {
    const config = makeMachineConfig({ maxLlmCalls: 3, timeoutMs: 5000 });
    const bounds = resolveBounds(config);
    expect(bounds.maxLlmCalls).toBe(3);
    expect(bounds.timeoutMs).toBe(5000);
    expect(bounds.maxTokens).toBe(DEFAULT_EXECUTION_BOUNDS.maxTokens);
    expect(bounds.maxActions).toBe(DEFAULT_EXECUTION_BOUNDS.maxActions);
  });

  it('respects full overrides', () => {
    const custom: ExecutionBounds = { maxLlmCalls: 1, timeoutMs: 1000, maxTokens: 500, maxActions: 2 };
    const config = makeMachineConfig(custom);
    const bounds = resolveBounds(config);
    expect(bounds).toEqual(custom);
  });
});
