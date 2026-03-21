// ===========================================
// ORDINATIO JOBS v2.0 — Trust Gate
// ===========================================
// Checks trust tier against DAG node risk
// levels before execution. High-risk actions
// require sufficient trust or explicit approval.
// ===========================================

import type { AutomationDag, DagNode } from './dag-types';
import type { HypermediaAction } from '../types';

// ---- Trust Check Result ----

export interface TrustCheckResult {
  /** Whether execution is allowed at this trust level. */
  allowed: boolean;
  /** The principal's trust tier. */
  trustTier: number;
  /** The minimum trust tier required by the DAG. */
  requiredTier: number;
  /** Whether human approval is required regardless of trust. */
  approvalRequired: boolean;
  /** Actions in the DAG that are blocked at this trust level. */
  blockedActions: string[];
  /** Actions that require explicit approval. */
  approvalActions: string[];
  /** Reason for denial (if not allowed). */
  reason?: string;

  _actions?: Record<string, HypermediaAction>;
}

// ---- Trust Policy ----

/**
 * Maps risk levels to required trust tiers.
 * Default: low=0, medium=0, high=1, critical=2.
 */
export interface TrustPolicy {
  low: number;
  medium: number;
  high: number;
  critical: number;
}

export const DEFAULT_TRUST_POLICY: TrustPolicy = {
  low: 0,
  medium: 0,
  high: 1,
  critical: 2,
};

// ---- Trust Evaluation ----

/**
 * Check if a DAG can be executed at the given trust tier.
 * Examines every node's risk level and determines if the
 * principal has sufficient trust.
 */
export function checkAutomationTrust(
  dag: AutomationDag,
  trustTier: number,
  policy?: TrustPolicy,
): TrustCheckResult {
  const effectivePolicy = policy ?? DEFAULT_TRUST_POLICY;

  let requiredTier = 0;
  const blockedActions: string[] = [];
  const approvalActions: string[] = [];
  let approvalRequired = false;

  for (const node of dag.nodes) {
    if (node.type !== 'action' && node.type !== 'approval') continue;

    const nodeRisk = node.riskLevel ?? inferRiskFromAction(node);
    const required = effectivePolicy[nodeRisk];

    if (required > requiredTier) {
      requiredTier = required;
    }

    if (required > trustTier) {
      blockedActions.push(node.label);
    }

    // Approval nodes always require approval
    if (node.type === 'approval') {
      approvalRequired = true;
      approvalActions.push(node.label);
    }

    // Critical actions always require approval regardless of trust
    if (nodeRisk === 'critical') {
      approvalRequired = true;
      approvalActions.push(node.label);
    }
  }

  const allowed = blockedActions.length === 0;

  const actions: Record<string, HypermediaAction> = {};
  if (!allowed) {
    actions.escalate = { intent: 'Request higher trust tier for execution' };
    actions.request_approval = { intent: 'Request manual approval to bypass trust requirement' };
  }
  if (approvalRequired && allowed) {
    actions.request_approval = { intent: 'Submit for required approval before execution' };
  }
  if (allowed && !approvalRequired) {
    actions.execute = { intent: 'Execute — trust level sufficient' };
  }

  return {
    allowed,
    trustTier,
    requiredTier,
    approvalRequired,
    blockedActions,
    approvalActions: [...new Set(approvalActions)],
    reason: !allowed
      ? `Trust tier ${trustTier} is insufficient. Required: ${requiredTier}. Blocked: ${blockedActions.join(', ')}`
      : undefined,
    _actions: Object.keys(actions).length > 0 ? actions : undefined,
  };
}

/**
 * Compute the highest risk level across all nodes in a DAG.
 */
export function getMaxRiskLevel(dag: AutomationDag): 'low' | 'medium' | 'high' | 'critical' {
  const order = { low: 0, medium: 1, high: 2, critical: 3 };
  let highest: 'low' | 'medium' | 'high' | 'critical' = 'low';

  for (const node of dag.nodes) {
    const risk = node.riskLevel ?? inferRiskFromAction(node);
    if (order[risk] > order[highest]) highest = risk;
  }

  return highest;
}

// ---- Internal ----

function inferRiskFromAction(node: DagNode): 'low' | 'medium' | 'high' | 'critical' {
  if (node.type !== 'action' || !node.action) return 'low';

  const type = node.action.actionType;
  if (type.includes('DELETE')) return 'high';
  if (type === 'SEND_EMAIL' || type === 'REPLY_TO_EMAIL' || type === 'FORWARD_EMAIL') return 'medium';
  if (type === 'CALL_WEBHOOK') return 'medium';
  if (type === 'UPDATE_ORDER_STATUS') return 'medium';
  return 'low';
}
