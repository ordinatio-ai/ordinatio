// ===========================================
// @ordinatio/security — Alert Recovery
// ===========================================
// Transforms alerts from notifications into decision packets.
// Every alert includes: impact, recovery action, followups.
// ===========================================

import type { RiskLevel, SecurityAlert } from './types';
import type { AlertRecovery, AlertImpact } from './policy/policy-types';

interface AlertRecoveryTemplate {
  impact: AlertImpact;
  action: string;
  reason: string;
  allowedFollowups: string[];
}

/**
 * Per-alert-type recovery templates.
 * Key is the alert type prefix — matched against alertType field.
 */
const ALERT_RECOVERY_MAP: Record<string, AlertRecoveryTemplate> = {
  brute_force: {
    impact: 'degrade_gracefully',
    action: 'Increase authentication requirements for the targeted account',
    reason: 'Multiple failed login attempts detected from a single source',
    allowedFollowups: ['acknowledge_alert', 'block_ip', 'lock_account', 'review_logs'],
  },
  brute_force_ip: {
    impact: 'degrade_gracefully',
    action: 'Throttle requests from the attacking IP address',
    reason: 'Brute force attack detected from specific IP',
    allowedFollowups: ['acknowledge_alert', 'block_ip', 'review_logs'],
  },
  account_takeover: {
    impact: 'halt_execution',
    action: 'Lock the affected account and require identity re-verification',
    reason: 'Login from unknown IP after recent password change',
    allowedFollowups: ['lock_account', 'verify_identity', 'review_sessions'],
  },
  privilege_escalation: {
    impact: 'halt_execution',
    action: 'Revoke elevated permissions and audit recent actions',
    reason: 'Repeated permission denials suggest unauthorized access attempt',
    allowedFollowups: ['revoke_permissions', 'audit_actions', 'lock_account'],
  },
  data_exfiltration: {
    impact: 'halt_execution',
    action: 'Block data export operations and review all recent exports',
    reason: 'Abnormal volume of data export operations detected',
    allowedFollowups: ['block_exports', 'audit_exports', 'lock_account', 'notify_admin'],
  },
  suspicious_patterns: {
    impact: 'continue_monitoring',
    action: 'Increase monitoring level and flag for human review',
    reason: 'Activity patterns deviate from established baselines',
    allowedFollowups: ['acknowledge_alert', 'increase_monitoring', 'review_logs'],
  },
  rate_limit: {
    impact: 'degrade_gracefully',
    action: 'Apply progressive throttling to the source',
    reason: 'API rate limits exceeded repeatedly',
    allowedFollowups: ['acknowledge_alert', 'throttle_source', 'block_ip'],
  },
  csrf_attack: {
    impact: 'halt_execution',
    action: 'Invalidate all sessions for the affected user and rotate CSRF tokens',
    reason: 'Multiple CSRF validation failures indicate possible attack',
    allowedFollowups: ['invalidate_sessions', 'rotate_tokens', 'review_logs'],
  },
  injection_attack: {
    impact: 'degrade_gracefully',
    action: 'Block the source and review input validation rules',
    reason: 'Multiple blocked inputs suggest injection attack attempt',
    allowedFollowups: ['block_ip', 'review_validation', 'acknowledge_alert'],
  },
  coordinated_attack: {
    impact: 'halt_execution',
    action: 'Lock all affected accounts and increase security posture',
    reason: 'Multiple account lockouts suggest coordinated attack',
    allowedFollowups: ['lock_accounts', 'block_ip_range', 'notify_admin'],
  },
  webhook_spoofing: {
    impact: 'degrade_gracefully',
    action: 'Reject webhooks from the source and verify signatures',
    reason: 'Multiple invalid webhook signatures from same source',
    allowedFollowups: ['block_source', 'verify_signatures', 'review_integration'],
  },
};

/**
 * Default recovery for unknown alert types.
 */
const DEFAULT_RECOVERY: AlertRecoveryTemplate = {
  impact: 'continue_monitoring',
  action: 'Review the alert details and determine appropriate response',
  reason: 'Unknown alert type — manual review recommended',
  allowedFollowups: ['acknowledge_alert', 'review_logs', 'escalate_to_human'],
};

/**
 * Build an AlertRecovery for a given alert.
 * Maps alert type to a recovery template with impact + action + followups.
 */
export function buildAlertRecovery(alert: SecurityAlert | { alertType: string; riskLevel: RiskLevel }): AlertRecovery {
  const template = findRecoveryTemplate(alert.alertType);

  // Override impact based on risk level if higher than template
  let impact = template.impact;
  if (alert.riskLevel === 'CRITICAL' && impact !== 'halt_execution') {
    impact = 'halt_execution';
  }

  return {
    impact,
    action: template.action,
    reason: template.reason,
    allowedFollowups: template.allowedFollowups,
  };
}

/**
 * Find the recovery template for an alert type.
 * Tries exact match first, then prefix match.
 */
function findRecoveryTemplate(alertType: string): AlertRecoveryTemplate {
  // Exact match
  if (ALERT_RECOVERY_MAP[alertType]) {
    return ALERT_RECOVERY_MAP[alertType];
  }

  // Prefix match (e.g., "brute_force_sustained" matches "brute_force")
  for (const [key, template] of Object.entries(ALERT_RECOVERY_MAP)) {
    if (alertType.startsWith(key)) {
      return template;
    }
  }

  return DEFAULT_RECOVERY;
}

/**
 * Get all known alert recovery templates.
 */
export function getAllRecoveryTemplates(): Record<string, AlertRecoveryTemplate> {
  return { ...ALERT_RECOVERY_MAP };
}
