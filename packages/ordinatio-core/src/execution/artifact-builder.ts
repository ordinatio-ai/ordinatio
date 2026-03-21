// IHS
/**
 * Artifact Builder (Book IV)
 *
 * Builds ExecutionArtifact records from machine state.
 * Every bounded execution produces exactly one artifact — the immutable
 * record of what happened.
 *
 * DEPENDS ON: execution/types (ExecutionArtifact, ExecutionAction, ExecutionStatus)
 *             execution/machine-types (MachineState, MachinePhase, MachineResult)
 *             execution/budget (toConsumption, checkBounds, resolveBounds)
 */

import type { ExecutionArtifact, ExecutionAction, ExecutionStatus } from './types';
import type { MachineState, MachinePhase, MachineResult } from './machine-types';
import { toConsumption, checkBounds, resolveBounds } from './budget';

/**
 * Generate a unique execution ID.
 * Format: exec-{timestamp}-{nonce}
 */
export function generateExecutionId(): string {
  const timestamp = Date.now();
  const nonce = Math.random().toString(36).slice(2, 8);
  return `exec-${timestamp}-${nonce}`;
}

/**
 * Map a machine phase to an ExecutionStatus.
 */
export function phaseToStatus(phase: MachinePhase, error?: string): ExecutionStatus {
  if (error) return 'failed';

  switch (phase) {
    case 'resting':
      return 'completed';
    case 'paused':
      return 'paused';
    case 'dormant':
      return 'completed';
    default:
      // Still in an active phase — shouldn't normally happen at result time
      return 'completed';
  }
}

/**
 * Build an ExecutionArtifact from the final machine state.
 */
export function buildExecutionArtifact(state: MachineState): ExecutionArtifact {
  const now = new Date();
  const bounds = resolveBounds(state.config);
  const exceeded = checkBounds(state.budget, bounds);
  const status: ExecutionStatus = exceeded.length > 0
    ? 'exceeded_bounds'
    : phaseToStatus(state.phase, state.error);

  const actions: ExecutionAction[] = state.actions.map((action, idx) => ({
    capabilityId: action.capability,
    moduleId: '',
    inputs: action.parameters,
    output: {},
    risk: action.riskLevel,
    verdict: state.governanceDecisions[idx]?.verdict ?? 'approved',
    timestamp: now,
  }));

  return {
    id: state.executionId,
    agentRole: state.config.agentId ?? 'unknown',
    trigger: state.config.trigger,
    status,
    actions,
    contextSnapshot: state.config.contextSnapshot,
    consumption: toConsumption(state.budget),
    continuation: state.continuationToken,
    error: state.error ? { code: 'MACHINE_ERR', message: state.error, retryable: false } : undefined,
    startedAt: state.startedAt,
    endedAt: now,
    organizationId: state.config.organizationId ?? '',
  };
}

/**
 * Build the final MachineResult from machine state.
 */
export function buildMachineResult(state: MachineState): MachineResult {
  const bounds = resolveBounds(state.config);
  const exceeded = checkBounds(state.budget, bounds);
  const artifact = buildExecutionArtifact(state);

  return {
    executionId: state.executionId,
    status: artifact.status,
    artifact,
    budgetUsed: state.budget,
    exceededBounds: exceeded,
  };
}
