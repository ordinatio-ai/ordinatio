// ===========================================
// @ordinatio/security — Policy Engine
// ===========================================
// evaluatePolicy(): the single function for deciding
// whether an action should proceed, escalate, or be denied.
// Every denial includes machine-readable recovery guidance.
// ===========================================

import type {
  SecurityPolicy,
  PolicyContext,
  PolicyDecision,
  PolicyCondition,
  PolicyRecommendation,
} from './policy-types';

/**
 * Evaluate a proposed action against a set of security policies.
 * Policies are evaluated in priority order (highest first).
 * First matching policy wins.
 *
 * If no policy matches, the action is allowed by default.
 * Every denial includes recommendation with nextAction and safeAlternatives.
 */
export function evaluatePolicy(
  context: PolicyContext,
  policies: SecurityPolicy[]
): PolicyDecision {
  const trustTier = context.principal.trustTier ?? 0;

  // Sort by priority descending
  const sorted = [...policies].sort((a, b) => b.priority - a.priority);

  for (const policy of sorted) {
    if (matchesConditions(context, policy.conditions)) {
      const decision: PolicyDecision = {
        decision: policy.decision,
        policyId: policy.id,
        policyName: policy.name,
        trustTier,
        reasons: [`Matched policy: ${policy.name} (priority ${policy.priority})`],
        requiresHuman: policy.decision === 'escalate',
        constraints: policy.constraints ?? {},
      };

      if (policy.decision === 'deny' || policy.decision === 'escalate') {
        decision.recommendation = buildRecommendation(context, policy);
      }

      return decision;
    }
  }

  // No policy matched — default allow
  return {
    decision: 'allow',
    trustTier,
    reasons: ['No matching policy — default allow'],
    requiresHuman: false,
    constraints: {},
  };
}

/**
 * Check if a context matches all conditions of a policy.
 * All conditions must match (AND logic).
 */
function matchesConditions(
  context: PolicyContext,
  conditions: PolicyCondition[]
): boolean {
  for (const condition of conditions) {
    if (!matchesCondition(context, condition)) {
      return false;
    }
  }
  return true;
}

/**
 * Evaluate a single condition against the policy context.
 * Supports field-path access into the context object.
 */
function matchesCondition(
  context: PolicyContext,
  condition: PolicyCondition
): boolean {
  const value = getFieldValue(context, condition.field);

  switch (condition.operator) {
    case 'eq':
      return value === condition.value;
    case 'neq':
      return value !== condition.value;
    case 'in':
      if (!Array.isArray(condition.value)) return false;
      return condition.value.includes(value);
    case 'gte':
      return typeof value === 'number' && typeof condition.value === 'number' && value >= condition.value;
    case 'lte':
      return typeof value === 'number' && typeof condition.value === 'number' && value <= condition.value;
    default:
      return false;
  }
}

/**
 * Get a field value from the context using dot-path notation.
 * e.g., "principal.principalType" → context.principal.principalType
 */
function getFieldValue(context: PolicyContext, field: string): unknown {
  const parts = field.split('.');
  let current: unknown = context;

  for (const part of parts) {
    if (current === null || current === undefined || typeof current !== 'object') {
      return undefined;
    }
    current = (current as Record<string, unknown>)[part];
  }

  return current;
}

/**
 * Build recovery recommendation for denied/escalated actions.
 */
function buildRecommendation(
  context: PolicyContext,
  policy: SecurityPolicy
): PolicyRecommendation {
  if (policy.decision === 'escalate') {
    return {
      nextAction: 'Request human approval before proceeding',
      safeAlternatives: [
        'Retry with lower risk level',
        'Request elevated trust tier',
        'Provide additional verification',
      ],
    };
  }

  // Deny
  return {
    nextAction: `Action "${context.action}" is blocked by policy "${policy.name}"`,
    safeAlternatives: [
      'Use an action with lower risk classification',
      'Contact administrator to update policy',
      'Escalate to human operator',
    ],
  };
}

/**
 * Quick check: would this action be denied by any policy?
 */
export function wouldBeDenied(
  context: PolicyContext,
  policies: SecurityPolicy[]
): boolean {
  const decision = evaluatePolicy(context, policies);
  return decision.decision === 'deny';
}
