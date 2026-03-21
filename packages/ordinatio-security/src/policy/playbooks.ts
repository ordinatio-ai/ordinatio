// ===========================================
// @ordinatio/security — Security Playbooks
// ===========================================
// Machine-readable incident response sequences.
// Agents follow these without human scripting.
// ===========================================

import type { SecurityPlaybook } from './policy-types';

export const SECURITY_PLAYBOOKS: SecurityPlaybook[] = [
  {
    id: 'playbook-replay-attack',
    name: 'Replay Attack Response',
    trigger: 'replay_attack',
    steps: [
      { action: 'block_source', params: { duration: '1h' }, description: 'Block the source IP/principal for 1 hour' },
      { action: 'quarantine_event', params: {}, description: 'Quarantine the replayed event' },
      { action: 'create_alert', params: { riskLevel: 'HIGH' }, description: 'Create a HIGH-severity alert' },
      { action: 'notify_review', params: {}, description: 'Flag for human review' },
    ],
  },
  {
    id: 'playbook-brute-force',
    name: 'Brute Force Response',
    trigger: 'brute_force',
    steps: [
      { action: 'create_alert', params: { riskLevel: 'HIGH' }, description: 'Create alert for brute force attempt' },
      { action: 'throttle_source', params: { delayMs: 5000 }, description: 'Throttle the source with exponential delay' },
      { action: 'flag_account', params: {}, description: 'Flag the targeted account for monitoring' },
      { action: 'increase_trust_requirement', params: { minTier: 1 }, description: 'Require higher trust tier for this account' },
    ],
  },
  {
    id: 'playbook-suspicious-capsule',
    name: 'Suspicious Capsule Response',
    trigger: 'suspicious_capsule',
    steps: [
      { action: 'halt_processing', params: {}, description: 'Halt capsule processing immediately' },
      { action: 'summarize_capsule', params: {}, description: 'Generate human-readable summary of capsule contents' },
      { action: 'request_confirmation', params: {}, description: 'Present summary to human for approval before proceeding' },
    ],
  },
  {
    id: 'playbook-data-exfiltration',
    name: 'Data Exfiltration Response',
    trigger: 'data_exfiltration',
    steps: [
      { action: 'block_source', params: { duration: '24h' }, description: 'Block the source for 24 hours' },
      { action: 'create_alert', params: { riskLevel: 'CRITICAL' }, description: 'Create CRITICAL alert' },
      { action: 'notify_review', params: { urgent: true }, description: 'Urgent human review required' },
    ],
  },
  {
    id: 'playbook-account-takeover',
    name: 'Account Takeover Response',
    trigger: 'account_takeover',
    steps: [
      { action: 'lock_account', params: {}, description: 'Lock the affected account immediately' },
      { action: 'create_alert', params: { riskLevel: 'CRITICAL' }, description: 'Create CRITICAL alert' },
      { action: 'verify_identity', params: {}, description: 'Require identity re-verification' },
    ],
  },
];

/**
 * Look up the playbook for a given alert type.
 */
export function getPlaybookForAlert(alertType: string): SecurityPlaybook | null {
  return SECURITY_PLAYBOOKS.find(p => p.trigger === alertType) ?? null;
}

/**
 * Get all available playbooks.
 */
export function getAllPlaybooks(): SecurityPlaybook[] {
  return [...SECURITY_PLAYBOOKS];
}

/**
 * Get a playbook by ID.
 */
export function getPlaybookById(id: string): SecurityPlaybook | null {
  return SECURITY_PLAYBOOKS.find(p => p.id === id) ?? null;
}
