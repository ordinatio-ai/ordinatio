// ===========================================
// @ordinatio/security — Security Summary
// ===========================================
// Natural language summaries for agents and dashboards.
// Token-efficient format for LLM context windows.
// ===========================================

import type { SecurityAlert } from '../types';
import type { SecurityPosture, AlertRecovery } from '../policy/policy-types';

/**
 * Summarize the full security posture as human-readable text.
 * Designed for LLM context windows — concise and actionable.
 */
export function summarizePosture(posture: SecurityPosture): string {
  const lines: string[] = [];

  // Header
  const trustLabel = posture.trustTier === 2 ? 'high-stakes trusted'
    : posture.trustTier === 1 ? 'verified'
    : 'untrusted';
  lines.push(`Security Posture: ${trustLabel} (tier ${posture.trustTier}, risk ${posture.riskScore}/100)`);

  // Active alerts
  if (posture.activeAlerts.length === 0) {
    lines.push('No active security alerts.');
  } else {
    const critical = posture.activeAlerts.filter(a => a.riskLevel === 'CRITICAL').length;
    const high = posture.activeAlerts.filter(a => a.riskLevel === 'HIGH').length;
    const rest = posture.activeAlerts.length - critical - high;

    lines.push(`Active alerts: ${posture.activeAlerts.length} total`);
    if (critical > 0) lines.push(`  CRITICAL: ${critical}`);
    if (high > 0) lines.push(`  HIGH: ${high}`);
    if (rest > 0) lines.push(`  Other: ${rest}`);

    // Show top 3 alerts
    for (const alert of posture.activeAlerts.slice(0, 3)) {
      lines.push(`  - [${alert.riskLevel}] ${alert.title}`);
      if (alert.recovery) {
        lines.push(`    Action: ${alert.recovery.action}`);
      }
    }
  }

  // Policy restrictions
  if (posture.policyRestrictions.length > 0) {
    lines.push(`Restrictions: ${posture.policyRestrictions.join('; ')}`);
  }

  // Blocked actions
  if (posture.blockedActions.length > 0) {
    lines.push(`Blocked: ${posture.blockedActions.join(', ')}`);
  }

  // Integrity
  if (posture.integrityStatus === 'broken') {
    lines.push('WARNING: Event chain integrity is broken — investigate tampering');
  }

  // Recommendations
  if (posture.recommendedNextActions.length > 0) {
    lines.push('Recommended:');
    for (const action of posture.recommendedNextActions.slice(0, 3)) {
      lines.push(`  - ${action}`);
    }
  }

  return lines.join('\n');
}

/**
 * Summarize a single alert as one sentence with recovery guidance.
 */
export function summarizeAlert(alert: SecurityAlert & { recovery?: AlertRecovery }): string {
  const parts = [`[${alert.riskLevel}] ${alert.title}`];

  if (alert.affectedIp) {
    parts.push(`from IP ${alert.affectedIp}`);
  }

  if (alert.eventCount > 1) {
    parts.push(`(${alert.eventCount} events in ${alert.windowMinutes}min)`);
  }

  let summary = parts.join(' ');

  if (alert.recovery) {
    summary += `. Recovery: ${alert.recovery.action}`;
  }

  return summary;
}

/**
 * Quick check: does the security posture require attention?
 */
export function postureNeedsAttention(posture: SecurityPosture): boolean {
  return (
    posture.riskScore > 50 ||
    posture.activeAlerts.some(a => a.riskLevel === 'CRITICAL' || a.riskLevel === 'HIGH') ||
    posture.integrityStatus === 'broken' ||
    posture.blockedActions.length > 0
  );
}
