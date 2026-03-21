// IHS
/**
 * Intermittent Machine — Main Engine (Book IV)
 *
 * The runtime that awakens agents, enforces execution bounds, evaluates
 * governance policies, and produces immutable ExecutionArtifacts.
 *
 * Lifecycle: dormant → awakening → reasoning → (governance_check → acting)* → resting
 *
 * Book IV mandates:
 * - Dormancy as default state
 * - Bounded execution (time, LLM calls, tokens, actions)
 * - Stateless intelligence (context reconstructed each cycle)
 * - Governance evaluation before every action
 * - Pause → approval → resume via ContinuationToken
 * - Silence as success (no output = healthy system)
 *
 * Follows Phase 4's council-orchestrator.ts pattern:
 * - Pure async functions
 * - Immutable state transitions
 * - Pluggable executor interface (AgentExecutor)
 * - Main loop with bound/stall checks
 *
 * DEPENDS ON: execution/machine-types, execution/types
 *             execution/awakening (classifyAwakening, isAwakeningRequired)
 *             execution/budget (createBudgetSnapshot, recordLlmCall, recordAction, etc.)
 *             execution/governance-eval (evaluateCapability, buildPauseContinuation)
 *             execution/artifact-builder (buildMachineResult, generateExecutionId)
 */

import type { ExecutionBounds } from './types';
import type {
  AgentExecutor,
  AgentBrief,
  MachineConfig,
  MachineState,
  MachinePhase,
  MachineResult,
  PlannedAction,
  BudgetSnapshot,
} from './machine-types';
import type { GovernanceDecision } from '../governance/types';
import type { ContinuationToken } from './types';
import { classifyAwakening, isAwakeningRequired } from './awakening';
import {
  createBudgetSnapshot,
  recordLlmCall,
  recordAction,
  updateElapsed,
  checkBounds,
  resolveBounds,
} from './budget';
import { evaluateCapability, buildPauseContinuation } from './governance-eval';
import { buildMachineResult, generateExecutionId } from './artifact-builder';

// ---------------------------------------------------------------------------
// State Initialization
// ---------------------------------------------------------------------------

/**
 * Initialize a fresh machine state from config.
 */
export function initializeMachine(config: MachineConfig): MachineState {
  return {
    executionId: generateExecutionId(),
    config,
    phase: 'awakening',
    budget: createBudgetSnapshot(),
    actions: [],
    governanceDecisions: [],
    startedAt: new Date(),
  };
}

// ---------------------------------------------------------------------------
// State Queries
// ---------------------------------------------------------------------------

/**
 * Check if the machine is in a terminal phase.
 */
export function isTerminal(state: MachineState): boolean {
  return state.phase === 'resting' || state.phase === 'paused' || state.phase === 'dormant';
}

/**
 * Get the current machine phase.
 */
export function getMachinePhase(state: MachineState): MachinePhase {
  return state.phase;
}

// ---------------------------------------------------------------------------
// State Transitions (Immutable)
// ---------------------------------------------------------------------------

/**
 * Transition the machine to a failed state.
 */
export function failMachine(state: MachineState, error: string): MachineState {
  return {
    ...state,
    phase: 'resting',
    error,
    budget: updateElapsed(state.budget, Date.now() - state.startedAt.getTime()),
  };
}

/**
 * Transition the machine to a paused state with a continuation token.
 */
export function pauseMachine(
  state: MachineState,
  reason: string,
  continuation: ContinuationToken,
): MachineState {
  return {
    ...state,
    phase: 'paused',
    pauseReason: reason,
    continuationToken: continuation,
    budget: updateElapsed(state.budget, Date.now() - state.startedAt.getTime()),
  };
}

/**
 * Resume a paused machine from a continuation token.
 * Restores budget and completed actions from the token's state.
 */
export function resumeMachine(
  state: MachineState,
  continuation: ContinuationToken,
): MachineState {
  const restored = continuation.state as {
    budgetSnapshot?: BudgetSnapshot;
    completedActions?: readonly PlannedAction[];
    governanceDecisions?: readonly GovernanceDecision[];
  };

  return {
    ...state,
    phase: 'governance_check',
    pauseReason: undefined,
    continuationToken: undefined,
    budget: restored.budgetSnapshot ?? state.budget,
    actions: restored.completedActions ?? state.actions,
    governanceDecisions: restored.governanceDecisions ?? state.governanceDecisions,
  };
}

// ---------------------------------------------------------------------------
// Step Execution
// ---------------------------------------------------------------------------

/**
 * Execute one step of the machine: reasoning → governance → acting.
 * Called by the main loop. Returns new state.
 */
export async function executeStep(
  state: MachineState,
  executor: AgentExecutor,
): Promise<MachineState> {
  const bounds = resolveBounds(state.config);

  // Phase: Reasoning — call the agent
  const reasoningState: MachineState = { ...state, phase: 'reasoning' };

  const brief: AgentBrief = {
    executionId: state.executionId,
    trigger: state.config.trigger,
    contextSnapshot: state.config.contextSnapshot,
    capabilities: [...state.config.capabilities],
    bounds,
    governancePolicy: state.config.governancePolicy,
    priorArtifacts: state.config.priorArtifacts,
    continuationToken: state.continuationToken,
  };

  let agentResult;
  try {
    agentResult = await executor.execute(brief);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return failMachine(reasoningState, `Agent executor threw: ${msg}`);
  }

  // Record LLM call budget
  let budget = recordLlmCall(state.budget, agentResult.tokensUsed);
  budget = updateElapsed(budget, Date.now() - state.startedAt.getTime());

  // Check bounds after LLM call
  const postLlmExceeded = checkBounds(budget, bounds);
  if (postLlmExceeded.length > 0) {
    return {
      ...state,
      phase: 'resting',
      budget,
    };
  }

  // No actions planned — successful empty execution
  if (agentResult.actions.length === 0) {
    return {
      ...state,
      phase: 'resting',
      budget,
    };
  }

  // Process each planned action
  let currentActions = [...state.actions];
  let currentDecisions = [...state.governanceDecisions];
  let currentBudget = budget;

  for (const action of agentResult.actions) {
    // Phase: Governance check
    const decision = evaluateCapability(
      action,
      state.config.governancePolicy,
      state.config.governancePolicyOverrides,
    );
    currentDecisions = [...currentDecisions, decision];

    if (decision.verdict === 'requires_approval') {
      // Pause for approval
      const pauseState: MachineState = {
        ...state,
        phase: 'governance_check',
        budget: currentBudget,
        actions: currentActions,
        governanceDecisions: currentDecisions,
      };
      const continuation = buildPauseContinuation(pauseState, action);
      return pauseMachine(pauseState, `Approval required: ${action.capability}`, continuation);
    }

    // Approved — execute action
    currentActions = [...currentActions, action];
    currentBudget = recordAction(currentBudget);
    currentBudget = updateElapsed(currentBudget, Date.now() - state.startedAt.getTime());

    // Check bounds after each action
    const postActionExceeded = checkBounds(currentBudget, bounds);
    if (postActionExceeded.length > 0) {
      return {
        ...state,
        phase: 'resting',
        budget: currentBudget,
        actions: currentActions,
        governanceDecisions: currentDecisions,
      };
    }
  }

  // All actions processed successfully
  return {
    ...state,
    phase: 'resting',
    budget: currentBudget,
    actions: currentActions,
    governanceDecisions: currentDecisions,
  };
}

// ---------------------------------------------------------------------------
// Main Machine Loop
// ---------------------------------------------------------------------------

/**
 * Run a complete machine execution: wake → reason → act → rest.
 *
 * 1. Initialize machine state
 * 2. Classify awakening (skip if noise)
 * 3. If continuation, resume from paused state
 * 4. Execute step (reasoning → governance → acting)
 * 5. Build result
 */
export async function runMachine(
  executor: AgentExecutor,
  config: MachineConfig,
): Promise<MachineResult> {
  let state = initializeMachine(config);

  // Check if awakening is required
  if (!isAwakeningRequired(config.trigger)) {
    state = { ...state, phase: 'resting' };
    return buildMachineResult(state);
  }

  // Classify the awakening (for audit/context)
  classifyAwakening(config.trigger);

  // Handle continuation (resume from pause)
  if (config.trigger.type === 'continuation' && config.priorArtifacts?.length) {
    const lastArtifact = config.priorArtifacts[config.priorArtifacts.length - 1];
    if (lastArtifact.continuation) {
      state = resumeMachine(state, lastArtifact.continuation);
    }
  }

  // Execute the agent step
  state = await executeStep(state, executor);

  return buildMachineResult(state);
}
