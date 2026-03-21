// ===========================================
// @ordinatio/security — Severity Enforcement Rules
// ===========================================
// Maps risk levels to default enforcement actions.
// ===========================================

import type { RiskLevel } from '../types';
import type { EnforcementAction } from './policy-types';

/**
 * Default enforcement action per risk level.
 * CRITICAL → block, HIGH → throttle, MEDIUM → log, LOW → allow
 */
export const SEVERITY_ENFORCEMENT_MAP: Record<RiskLevel, EnforcementAction> = {
  CRITICAL: 'block',
  HIGH: 'throttle',
  MEDIUM: 'log',
  LOW: 'allow',
};

/**
 * Get the default enforcement action for a risk level.
 */
export function getSeverityAction(riskLevel: RiskLevel): EnforcementAction {
  return SEVERITY_ENFORCEMENT_MAP[riskLevel] ?? 'log';
}

/**
 * Check if a risk level warrants blocking.
 */
export function shouldBlock(riskLevel: RiskLevel): boolean {
  return getSeverityAction(riskLevel) === 'block';
}

/**
 * Check if a risk level warrants throttling.
 */
export function shouldThrottle(riskLevel: RiskLevel): boolean {
  const action = getSeverityAction(riskLevel);
  return action === 'throttle' || action === 'block';
}
