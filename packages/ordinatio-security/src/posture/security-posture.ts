// ===========================================
// @ordinatio/security — Security Posture
// ===========================================
// One call = full situational awareness.
// getSecurityPosture() aggregates alerts, policy, enforcement, integrity.
// ===========================================

import type { SecurityDb, SecurityCallbacks, SecurityAlert } from '../types';
import type { SecurityPosture, AlertRecovery } from '../policy/policy-types';
import type { PrincipalContext } from '../principal-context';
import { getActiveAlerts } from '../alert-management';
import { buildAlertRecovery } from '../alert-recovery';

export interface PostureOptions {
  principal?: PrincipalContext;
  orgId?: string;
  /** Skip integrity check (faster) */
  skipIntegrity?: boolean;
  /** Additional blocked actions to report */
  blockedActions?: string[];
  /** Additional policy restrictions to report */
  policyRestrictions?: string[];
}

/**
 * Get the full security posture in a single call.
 * Aggregates: active alerts, policy state, enforcement state, integrity status.
 * Returns recommendations and discoverable _actions.
 */
export async function getSecurityPosture(
  db: SecurityDb,
  options?: PostureOptions,
  callbacks?: SecurityCallbacks
): Promise<SecurityPosture> {
  const orgId = options?.orgId ?? options?.principal?.orgId ?? null;
  const principalId = options?.principal?.principalId ?? null;
  const trustTier = options?.principal?.trustTier ?? 0;

  // Fetch active alerts
  let alerts: SecurityAlert[] = [];
  try {
    alerts = await getActiveAlerts(db);
  } catch (error) {
    callbacks?.log?.error('Failed to fetch alerts for posture', {
      error: error instanceof Error ? error.message : String(error),
    });
  }

  // Build alert summaries with recovery objects
  const activeAlerts = alerts.map(alert => ({
    id: alert.id,
    alertType: alert.alertType,
    riskLevel: alert.riskLevel,
    title: alert.title,
    recovery: buildAlertRecovery(alert),
  }));

  // Compute risk score (0-100)
  const riskScore = computeRiskScore(alerts, trustTier);

  // Determine integrity status
  const integrityStatus: 'verified' | 'unverified' | 'broken' = options?.skipIntegrity
    ? 'unverified'
    : 'unverified'; // Full integrity check would need chain verification

  // Collect recommendations
  const recommendedNextActions = buildRecommendations(alerts, trustTier, riskScore);

  // Merge external restrictions
  const policyRestrictions = options?.policyRestrictions ?? [];
  const blockedActions = options?.blockedActions ?? [];

  // Add alert-based restrictions
  for (const alert of alerts) {
    if (alert.riskLevel === 'CRITICAL') {
      policyRestrictions.push(`CRITICAL alert active: ${alert.alertType}`);
    }
  }

  return {
    orgId,
    principalId,
    trustTier,
    riskScore,
    activeAlerts,
    policyRestrictions,
    blockedActions,
    integrityStatus,
    recommendedNextActions,
    _actions: {
      evaluate_policy: {
        href: '/api/security/policy/evaluate',
        method: 'POST',
        description: 'Evaluate a proposed action against security policies',
      },
      request_review: {
        href: '/api/security/alerts/{alertId}/acknowledge',
        method: 'POST',
        description: 'Acknowledge an alert and begin review',
      },
      quarantine: {
        href: '/api/security/events/{eventId}/quarantine',
        method: 'POST',
        description: 'Quarantine a suspicious event',
      },
      get_playbook: {
        href: '/api/security/playbooks/{alertType}',
        method: 'GET',
        description: 'Get the incident response playbook for an alert type',
      },
    },
  };
}

/**
 * Compute a risk score (0-100) from active alerts and trust tier.
 * Higher = more risk.
 */
function computeRiskScore(alerts: SecurityAlert[], trustTier: 0 | 1 | 2): number {
  let score = 0;

  // Base risk from trust tier (lower trust = higher risk)
  score += (2 - trustTier) * 10; // 0→20, 1→10, 2→0

  // Risk from active alerts
  for (const alert of alerts) {
    switch (alert.riskLevel) {
      case 'CRITICAL': score += 25; break;
      case 'HIGH': score += 15; break;
      case 'MEDIUM': score += 5; break;
      case 'LOW': score += 2; break;
    }
  }

  return Math.min(score, 100);
}

/**
 * Build recommended next actions based on security state.
 */
function buildRecommendations(
  alerts: SecurityAlert[],
  trustTier: 0 | 1 | 2,
  riskScore: number
): string[] {
  const recommendations: string[] = [];

  if (riskScore > 75) {
    recommendations.push('URGENT: Review and resolve critical security alerts');
  }

  const criticalAlerts = alerts.filter(a => a.riskLevel === 'CRITICAL');
  if (criticalAlerts.length > 0) {
    recommendations.push(`Address ${criticalAlerts.length} CRITICAL alert(s) immediately`);
  }

  const unacknowledged = alerts.filter(a => a.status === 'ACTIVE');
  if (unacknowledged.length > 3) {
    recommendations.push(`${unacknowledged.length} alerts require acknowledgement`);
  }

  if (trustTier === 0) {
    recommendations.push('Establish trust: verify identity or provide credentials');
  }

  if (recommendations.length === 0) {
    recommendations.push('Security posture is nominal — continue normal operations');
  }

  return recommendations;
}
