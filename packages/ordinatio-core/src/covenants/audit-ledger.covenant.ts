// IHS
/**
 * Audit Ledger Module Covenant (C-12)
 *
 * Tier 4 — MEMORY (What Records and Retrieves)
 *
 * Immutable record of what occurred. Append-only — no mutation, no deletion.
 * Every capability invocation produces an audit entry with checksummed chain.
 * This is not "turn on logging" — it is the execution substrate.
 *
 * In System 1701: Activity Feed with 57 action types, severity levels,
 * sticky notifications. Target: append-only ledger with hash-chain integrity.
 */

import type { ModuleCovenant } from '../covenant/types';

export const AUDIT_LEDGER_COVENANT: ModuleCovenant = {
  // ---------------------------------------------------------------------------
  // Identity
  // ---------------------------------------------------------------------------
  identity: {
    id: 'audit-ledger',
    canonicalId: 'C-12',
    version: '0.1.0',
    description:
      'Append-only audit ledger. Every capability invocation produces an entry with hash-chain integrity (SHA-256 checksums). The execution substrate — what happened, when, by whom, in what context.',
    status: 'canonical',
    tier: 'memory',
    dedication: 'IHS',
  },

  // ---------------------------------------------------------------------------
  // Domain Model
  // ---------------------------------------------------------------------------
  domain: {
    entities: [
      {
        name: 'AuditEntry',
        description: 'Immutable record of a capability invocation: capability, actor, inputs, output, checksum, timestamp',
        hasContextLayer: false,
      },
    ],

    events: [
      {
        id: 'audit.entry_recorded',
        description: 'New audit entry appended to the ledger',
        payloadShape: '{ entryId, capabilityId, moduleId, actorType, risk }',
      },
      {
        id: 'audit.integrity_violation',
        description: 'Hash chain verification failed — ledger may have been tampered with',
        payloadShape: '{ entryId, expectedChecksum, actualChecksum }',
      },
    ],

    subscriptions: [],
  },

  // ---------------------------------------------------------------------------
  // Capabilities
  // ---------------------------------------------------------------------------
  capabilities: [
    // --- Observe ---
    {
      id: 'audit.query',
      description: 'Query audit entries with filtering by module, capability, actor, time range, and risk level',
      type: 'query',
      risk: 'observe',
      dataSensitivity: 'sensitive',
      inputs: [
        { name: 'moduleId', type: 'string', required: false, description: 'Filter by source module' },
        { name: 'capabilityId', type: 'string', required: false, description: 'Filter by capability' },
        { name: 'actorId', type: 'string', required: false, description: 'Filter by actor (user or agent)' },
        { name: 'dateFrom', type: 'string', required: false, description: 'Start of time range (ISO)' },
        { name: 'dateTo', type: 'string', required: false, description: 'End of time range (ISO)' },
        { name: 'risk', type: 'string', required: false, description: 'Filter by risk level' },
        { name: 'limit', type: 'number', required: false, description: 'Max results (default 50)' },
      ],
      output: '{ entries: AuditEntry[], total: number }',
      whenToUse: 'When investigating what happened — who did what, when, and why.',
    },
    {
      id: 'audit.get_entry',
      description: 'Get a single audit entry with full details including checksum chain',
      type: 'query',
      risk: 'observe',
      dataSensitivity: 'sensitive',
      inputs: [
        { name: 'entryId', type: 'string', required: true, description: 'The audit entry ID' },
      ],
      output: '{ entry: AuditEntry, previousEntry?: AuditEntry }',
      whenToUse: 'When you need the full context of a specific action including its chain integrity.',
    },
    {
      id: 'audit.get_timeline',
      description: 'Get the audit timeline for a specific entity — all actions that affected it',
      type: 'query',
      risk: 'observe',
      dataSensitivity: 'sensitive',
      inputs: [
        { name: 'entityType', type: 'string', required: true, description: 'Entity type' },
        { name: 'entityId', type: 'string', required: true, description: 'Entity ID' },
        { name: 'limit', type: 'number', required: false, description: 'Max results (default 20)' },
      ],
      output: '{ entries: AuditEntry[] }',
      whenToUse: 'When reviewing the complete history of actions on a specific entity.',
    },

    // --- Act ---
    {
      id: 'audit.record',
      description: 'Append an audit entry to the ledger. Called automatically by the governance engine.',
      type: 'mutation',
      risk: 'act',
      dataSensitivity: 'sensitive',
      inputs: [
        { name: 'capabilityId', type: 'string', required: true, description: 'Capability that was invoked' },
        { name: 'moduleId', type: 'string', required: true, description: 'Source module' },
        { name: 'actorType', type: 'string', required: true, description: 'user, agent, system, or automation' },
        { name: 'actorId', type: 'string', required: true, description: 'Actor identifier' },
        { name: 'inputs', type: 'object', required: true, description: 'Sanitized input parameters' },
        { name: 'output', type: 'object', required: true, description: 'Output summary' },
        { name: 'risk', type: 'string', required: true, description: 'Risk level of the capability' },
      ],
      output: '{ entryId: string, checksum: string }',
      whenToUse: 'Automatically called by the governance engine after every capability invocation. Rarely called directly.',
    },
    {
      id: 'audit.verify_chain',
      description: 'Verify hash chain integrity for a range of audit entries',
      type: 'query',
      risk: 'act',
      dataSensitivity: 'sensitive',
      inputs: [
        { name: 'fromEntryId', type: 'string', required: false, description: 'Start of range (omit for beginning)' },
        { name: 'toEntryId', type: 'string', required: false, description: 'End of range (omit for latest)' },
      ],
      output: '{ valid: boolean, entriesChecked: number, firstInvalidEntry?: string }',
      whenToUse: 'When verifying that the audit ledger has not been tampered with.',
    },
  ],

  // ---------------------------------------------------------------------------
  // Dependencies
  // ---------------------------------------------------------------------------
  dependencies: [
    {
      moduleId: 'auth-engine',
      required: true,
      capabilities: ['auth.get_session'],
    },
  ],

  // ---------------------------------------------------------------------------
  // Invariants
  // ---------------------------------------------------------------------------
  invariants: {
    alwaysTrue: [
      'The ledger is append-only — entries are never modified or deleted',
      'Every entry has a SHA-256 checksum linking it to the previous entry',
      'Every capability invocation produces an audit entry',
      'Audit data is tenant-scoped — entries from one org are invisible to another',
      'Sanitized inputs are stored — no secrets, passwords, or tokens in entries',
    ],
    neverHappens: [
      'An audit entry is modified after creation',
      'An audit entry is deleted',
      'The hash chain is broken without an integrity_violation event',
      'Credentials or secrets appear in audit entry inputs',
      'Audit data crosses tenant boundaries',
    ],
  },

  // ---------------------------------------------------------------------------
  // Health Check
  // ---------------------------------------------------------------------------
  healthCheck: async () => ({
    healthy: true,
    message: 'Audit Ledger health check — stub implementation',
    checkedAt: new Date(),
  }),
};
