// IHS
/**
 * Governance Evaluation (Book IV + Book V)
 *
 * Pure governance evaluation for the Intermittent Machine.
 * Uses RISK_ORDINAL from governance/types.ts for numeric risk comparison.
 *
 * "Every capability invocation must pass through governance before execution.
 * Governance is not RBAC bolted on — it IS the interaction pattern."
 *
 * DEPENDS ON: governance/types (RiskLevel, RISK_ORDINAL, GovernancePolicy, GovernancePolicyOverride, GovernanceDecision, GovernanceVerdict)
 *             execution/machine-types (PlannedAction, MachineState, ContinuationToken)
 */

import type {
  RiskLevel,
  GovernancePolicy,
  GovernancePolicyOverride,
  GovernanceDecision,
} from '../governance/types';
import { RISK_ORDINAL } from '../governance/types';
import type { ContinuationToken } from './types';
import type { PlannedAction, MachineState } from './machine-types';

/**
 * Find a capability-specific override in the policy.
 * Supports exact match and wildcard ('*') overrides.
 */
export function findOverride(
  capability: string,
  overrides: readonly GovernancePolicyOverride[],
): GovernancePolicyOverride | undefined {
  // Exact match first
  const exact = overrides.find(o => o.capabilityId === capability);
  if (exact) return exact;

  // Wildcard fallback
  return overrides.find(o => o.capabilityId === '*');
}

/**
 * Evaluate whether a planned action should proceed, based on governance policy.
 *
 * Logic:
 * 1. Check for capability-specific override
 * 2. Compare action risk against policy threshold
 * 3. If risk <= threshold → approved
 * 4. If risk > threshold → requires_approval (can be escalated)
 */
export function evaluateCapability(
  action: PlannedAction,
  policy: GovernancePolicy,
  overrides?: readonly GovernancePolicyOverride[],
): GovernanceDecision {
  const now = new Date();
  const allOverrides = overrides ?? policy.overrides;

  // Check for override
  const override = findOverride(action.capability, allOverrides);
  const effectiveThreshold: RiskLevel = override
    ? override.effectiveRisk
    : policy.approvalThreshold;

  const actionRisk = RISK_ORDINAL[action.riskLevel];
  const threshold = RISK_ORDINAL[effectiveThreshold];

  if (actionRisk < threshold) {
    return {
      verdict: 'approved',
      capabilityId: action.capability,
      risk: action.riskLevel,
      threshold: effectiveThreshold,
      reason: override
        ? `Risk ${action.riskLevel} below override threshold ${effectiveThreshold} (${override.reason})`
        : `Risk ${action.riskLevel} below policy threshold ${effectiveThreshold}`,
      decidedAt: now,
    };
  }

  // Risk meets or exceeds threshold — requires approval
  return {
    verdict: 'requires_approval',
    capabilityId: action.capability,
    risk: action.riskLevel,
    threshold: effectiveThreshold,
    reason: override
      ? `Risk ${action.riskLevel} meets/exceeds override threshold ${effectiveThreshold} (${override.reason})`
      : `Risk ${action.riskLevel} meets/exceeds policy threshold ${effectiveThreshold}`,
    decidedAt: now,
  };
}

/**
 * Check if an action requires human approval before execution.
 */
export function requiresApproval(action: PlannedAction, policy: GovernancePolicy): boolean {
  const decision = evaluateCapability(action, policy);
  return decision.verdict === 'requires_approval';
}

/**
 * Build a ContinuationToken for pausing the machine at a governance gate.
 */
export function buildPauseContinuation(
  state: MachineState,
  action: PlannedAction,
): ContinuationToken {
  const CONTINUATION_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

  return {
    id: `cont-${state.executionId}-${Date.now()}`,
    awaitingApproval: `Approve ${action.capability} (risk: ${action.riskLevel})`,
    pausedAtCapability: action.capability,
    state: {
      executionId: state.executionId,
      pendingAction: action,
      budgetSnapshot: state.budget,
      completedActions: state.actions,
      governanceDecisions: state.governanceDecisions,
    },
    expiresAt: new Date(Date.now() + CONTINUATION_TTL_MS),
    parentArtifactId: state.executionId,
  };
}
