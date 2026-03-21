// IHS
/**
 * Security Engine Module Covenant (C-11)
 *
 * Tier 3 — GOVERNANCE (What Orders and Rules)
 *
 * Threat detection, security event logging, and alert management. Security
 * context feeds into the Context Engine so agents are aware of threats.
 * Pattern detection identifies brute force, account takeover, and anomalous
 * access patterns.
 *
 * In System 1701: 40+ security event types, risk-level classification,
 * brute force detection, alert management, security audit service.
 */

import type { ModuleCovenant } from '../covenant/types';

export const SECURITY_ENGINE_COVENANT: ModuleCovenant = {
  // ---------------------------------------------------------------------------
  // Identity
  // ---------------------------------------------------------------------------
  identity: {
    id: 'security-engine',
    canonicalId: 'C-11',
    version: '0.1.0',
    description:
      'Threat detection and security monitoring. 40+ event types with risk classification. Pattern detection for brute force, account takeover, and anomalous access. Alert lifecycle: create → acknowledge → resolve.',
    status: 'canonical',
    tier: 'governance',
    dedication: 'IHS',
  },

  // ---------------------------------------------------------------------------
  // Domain Model
  // ---------------------------------------------------------------------------
  domain: {
    entities: [
      {
        name: 'SecurityEvent',
        description: 'Recorded security-relevant event with type, risk level, actor, and context',
        hasContextLayer: false,
      },
      {
        name: 'SecurityAlert',
        description: 'Active alert generated from pattern detection — requires acknowledgement',
        hasContextLayer: true,
      },
    ],

    events: [
      {
        id: 'security.event_logged',
        description: 'A security event was recorded',
        payloadShape: '{ eventType, riskLevel, actorId?, ip?, userAgent? }',
      },
      {
        id: 'security.alert_created',
        description: 'A security alert was created from pattern detection',
        payloadShape: '{ alertId, alertType, severity, description }',
      },
      {
        id: 'security.threat_detected',
        description: 'Active threat detected — may trigger automated response',
        payloadShape: '{ threatType, severity, sourceIp?, targetUserId? }',
      },
      {
        id: 'security.alert_resolved',
        description: 'A security alert was resolved',
        payloadShape: '{ alertId, resolvedBy, resolution }',
      },
    ],

    subscriptions: [
      'auth-engine.auth.login_failure',  // Track failed logins for brute force detection
      'auth-engine.auth.account_locked', // Escalate to alert
    ],
  },

  // ---------------------------------------------------------------------------
  // Capabilities
  // ---------------------------------------------------------------------------
  capabilities: [
    // --- Observe ---
    {
      id: 'security.get_events',
      description: 'Query security events with filtering by type, risk level, time range, and actor',
      type: 'query',
      risk: 'observe',
      dataSensitivity: 'sensitive',
      inputs: [
        { name: 'eventType', type: 'string', required: false, description: 'Filter by event type' },
        { name: 'riskLevel', type: 'string', required: false, description: 'Minimum risk level' },
        { name: 'dateFrom', type: 'string', required: false, description: 'Start of time range (ISO)' },
        { name: 'dateTo', type: 'string', required: false, description: 'End of time range (ISO)' },
        { name: 'limit', type: 'number', required: false, description: 'Max results (default 50)' },
      ],
      output: '{ events: SecurityEvent[], total: number }',
      whenToUse: 'When investigating security incidents or reviewing recent security activity.',
    },
    {
      id: 'security.get_alerts',
      description: 'List active security alerts',
      type: 'query',
      risk: 'observe',
      dataSensitivity: 'sensitive',
      inputs: [
        { name: 'status', type: 'string', required: false, description: 'Filter: active, acknowledged, resolved' },
        { name: 'severity', type: 'string', required: false, description: 'Minimum severity' },
      ],
      output: '{ alerts: SecurityAlert[], count: number }',
      whenToUse: 'When checking for active threats or unresolved security issues.',
    },
    {
      id: 'security.get_audit_summary',
      description: 'Get security posture summary — dependency vulnerabilities, outdated packages',
      type: 'query',
      risk: 'observe',
      dataSensitivity: 'internal',
      inputs: [],
      output: '{ vulnerabilities: number, outdatedPackages: number, lastScanAt: string }',
      whenToUse: 'When reviewing the overall security posture of the system.',
    },

    // --- Act ---
    {
      id: 'security.log_event',
      description: 'Record a security event from any module',
      type: 'mutation',
      risk: 'act',
      dataSensitivity: 'sensitive',
      inputs: [
        { name: 'eventType', type: 'string', required: true, description: 'Security event type' },
        { name: 'riskLevel', type: 'string', required: true, description: 'Risk classification' },
        { name: 'details', type: 'object', required: false, description: 'Event-specific details' },
      ],
      output: '{ eventId: string }',
      whenToUse: 'When a security-relevant event occurs in any module and needs to be recorded.',
    },
    {
      id: 'security.acknowledge_alert',
      description: 'Acknowledge a security alert — marks it as being investigated',
      type: 'mutation',
      risk: 'act',
      dataSensitivity: 'internal',
      inputs: [
        { name: 'alertId', type: 'string', required: true, description: 'The alert to acknowledge' },
        { name: 'note', type: 'string', required: false, description: 'Investigation note' },
      ],
      output: '{ acknowledged: boolean }',
      whenToUse: 'When you have seen an alert and are beginning investigation.',
    },
    {
      id: 'security.resolve_alert',
      description: 'Resolve a security alert with resolution details',
      type: 'mutation',
      risk: 'act',
      dataSensitivity: 'internal',
      inputs: [
        { name: 'alertId', type: 'string', required: true, description: 'The alert to resolve' },
        { name: 'resolution', type: 'string', required: true, description: 'How the threat was resolved' },
      ],
      output: '{ resolved: boolean }',
      whenToUse: 'When a security alert has been investigated and the threat is mitigated.',
    },

    // --- Govern ---
    {
      id: 'security.update_alert_patterns',
      description: 'Modify threat detection patterns. Changes affect what triggers alerts system-wide.',
      type: 'mutation',
      risk: 'govern',
      dataSensitivity: 'internal',
      inputs: [
        { name: 'patternId', type: 'string', required: true, description: 'Pattern to update' },
        { name: 'config', type: 'object', required: true, description: 'Updated pattern configuration' },
      ],
      output: '{ updated: boolean }',
      whenToUse: 'CAREFULLY. Modifying detection patterns affects system-wide security monitoring.',
      pitfalls: ['Weakening patterns may allow threats to go undetected'],
    },
  ],

  // ---------------------------------------------------------------------------
  // Dependencies
  // ---------------------------------------------------------------------------
  dependencies: [
    {
      moduleId: 'auth-engine',
      required: true,
      capabilities: ['auth.get_session', 'auth.revoke_session'],
    },
    {
      moduleId: 'audit-ledger',
      required: true,
      capabilities: ['audit.record'],
    },
  ],

  // ---------------------------------------------------------------------------
  // Invariants
  // ---------------------------------------------------------------------------
  invariants: {
    alwaysTrue: [
      'Security events are append-only — never modified after recording',
      'Alert detection runs continuously against incoming events',
      'Every alert has a lifecycle: created → acknowledged → resolved',
      'Security data is tenant-scoped — events from one org never visible to another',
      'Failed authentication attempts are always recorded as security events',
    ],
    neverHappens: [
      'A security event is modified or deleted after recording',
      'An alert is created without a corresponding detection pattern match',
      'Security events leak across tenant boundaries',
      'Threat detection is silently disabled',
    ],
  },

  // ---------------------------------------------------------------------------
  // Health Check
  // ---------------------------------------------------------------------------
  healthCheck: async () => ({
    healthy: true,
    message: 'Security Engine health check — stub implementation',
    checkedAt: new Date(),
  }),
};
