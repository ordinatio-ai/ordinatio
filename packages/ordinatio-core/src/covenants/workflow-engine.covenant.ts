// IHS
/**
 * Workflow Engine Module Covenant (C-08)
 *
 * Tier 3 — GOVERNANCE (What Orders and Rules)
 *
 * Multi-step processes with state transitions. Workflow definitions are data
 * — agents can create, modify, and instantiate workflows. Approval gates are
 * native workflow steps, not bolted on.
 *
 * In System 1701: Order status machine with any→any transitions (Rule 5).
 * Approval queue for order review. Target: generic state machine where order
 * status becomes one instance of a universal workflow definition.
 */

import type { ModuleCovenant } from '../covenant/types';

export const WORKFLOW_ENGINE_COVENANT: ModuleCovenant = {
  // ---------------------------------------------------------------------------
  // Identity
  // ---------------------------------------------------------------------------
  identity: {
    id: 'workflow-engine',
    canonicalId: 'C-08',
    version: '0.1.0',
    description:
      'Generic state machine engine. Workflow definitions (states, transitions, guards, approval gates) are data — not code. Agents create and modify workflows. Approval gates are native steps.',
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
        name: 'WorkflowDefinition',
        description: 'Template defining states, transitions, guards, and approval gates for a process',
        hasContextLayer: false,
      },
      {
        name: 'WorkflowInstance',
        description: 'A running instance of a workflow definition, tracking current state and history',
        hasContextLayer: true,
      },
      {
        name: 'WorkflowTransition',
        description: 'Record of a state transition: from, to, actor, timestamp, reason',
        hasContextLayer: false,
      },
    ],

    events: [
      {
        id: 'workflow.instance_created',
        description: 'New workflow instance started',
        payloadShape: '{ instanceId, definitionId, entityType, entityId, initialState }',
      },
      {
        id: 'workflow.state_changed',
        description: 'Workflow transitioned to a new state',
        payloadShape: '{ instanceId, fromState, toState, actor, reason? }',
      },
      {
        id: 'workflow.approval_requested',
        description: 'Workflow reached an approval gate — waiting for human decision',
        payloadShape: '{ instanceId, state, approvers: string[] }',
      },
      {
        id: 'workflow.completed',
        description: 'Workflow reached a terminal state',
        payloadShape: '{ instanceId, finalState, duration }',
      },
    ],

    subscriptions: [
      'entity-registry.entity_updated', // Workflow may react to entity changes
    ],
  },

  // ---------------------------------------------------------------------------
  // Capabilities
  // ---------------------------------------------------------------------------
  capabilities: [
    // --- Observe ---
    {
      id: 'workflow.get_instance',
      description: 'Get current state and history of a workflow instance',
      type: 'query',
      risk: 'observe',
      dataSensitivity: 'internal',
      inputs: [
        { name: 'instanceId', type: 'string', required: true, description: 'The workflow instance ID' },
      ],
      output: '{ instance: WorkflowInstance, transitions: WorkflowTransition[], availableTransitions: string[] }',
      whenToUse: 'When you need to know the current state of a process and what transitions are available.',
    },
    {
      id: 'workflow.list_pending_approvals',
      description: 'List workflow instances waiting for approval',
      type: 'query',
      risk: 'observe',
      dataSensitivity: 'internal',
      inputs: [
        { name: 'approverId', type: 'string', required: false, description: 'Filter by specific approver' },
      ],
      output: '{ approvals: WorkflowInstance[] }',
      whenToUse: 'When checking what items need human approval.',
    },
    {
      id: 'workflow.get_definition',
      description: 'Get a workflow definition with all states, transitions, and guards',
      type: 'query',
      risk: 'observe',
      dataSensitivity: 'none',
      inputs: [
        { name: 'definitionId', type: 'string', required: true, description: 'The workflow definition ID' },
      ],
      output: '{ definition: WorkflowDefinition }',
      whenToUse: 'When you need to understand the rules of a process — what states exist and how they connect.',
    },

    // --- Act ---
    {
      id: 'workflow.transition',
      description: 'Transition a workflow instance to a new state',
      type: 'action',
      risk: 'act',
      dataSensitivity: 'internal',
      inputs: [
        { name: 'instanceId', type: 'string', required: true, description: 'The workflow instance' },
        { name: 'toState', type: 'string', required: true, description: 'Target state' },
        { name: 'reason', type: 'string', required: false, description: 'Reason for transition' },
      ],
      output: '{ transitioned: boolean, newState: string }',
      whenToUse: 'When a process needs to move to the next step. Guards are checked automatically.',
      pitfalls: ['Guards may reject the transition — check availableTransitions first'],
    },
    {
      id: 'workflow.approve',
      description: 'Approve a workflow at an approval gate, allowing it to proceed',
      type: 'action',
      risk: 'act',
      dataSensitivity: 'internal',
      inputs: [
        { name: 'instanceId', type: 'string', required: true, description: 'The workflow instance' },
        { name: 'decision', type: 'string', required: true, description: 'approve or reject', allowedValues: ['approve', 'reject'] },
        { name: 'reason', type: 'string', required: false, description: 'Reason for decision' },
      ],
      output: '{ decided: boolean, newState: string }',
      whenToUse: 'When a human has reviewed and decided on a pending approval.',
    },
    {
      id: 'workflow.create_instance',
      description: 'Start a new workflow instance for an entity',
      type: 'mutation',
      risk: 'act',
      dataSensitivity: 'internal',
      inputs: [
        { name: 'definitionId', type: 'string', required: true, description: 'Which workflow to start' },
        { name: 'entityType', type: 'string', required: true, description: 'Entity type this workflow governs' },
        { name: 'entityId', type: 'string', required: true, description: 'Entity ID' },
      ],
      output: '{ instanceId: string, initialState: string }',
      whenToUse: 'When a process needs to begin (e.g., new order → order workflow).',
    },

    // --- Govern ---
    {
      id: 'workflow.modify_definition',
      description: 'Create or modify a workflow definition. Changes affect future instances only.',
      type: 'mutation',
      risk: 'govern',
      dataSensitivity: 'none',
      inputs: [
        { name: 'definitionId', type: 'string', required: false, description: 'ID to update (omit for create)' },
        { name: 'name', type: 'string', required: true, description: 'Workflow name' },
        { name: 'states', type: 'object[]', required: true, description: 'State definitions' },
        { name: 'transitions', type: 'object[]', required: true, description: 'Transition rules' },
      ],
      output: '{ definitionId: string, version: number }',
      whenToUse: 'CAREFULLY. Modifying workflow definitions changes how processes work for the entire organization.',
      pitfalls: ['Changes only affect NEW instances — existing instances continue with their original definition'],
    },
  ],

  // ---------------------------------------------------------------------------
  // Dependencies
  // ---------------------------------------------------------------------------
  dependencies: [
    {
      moduleId: 'entity-registry',
      required: true,
      capabilities: ['entity.get'],
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
      'Every state transition is recorded with actor, timestamp, and reason',
      'Workflow instances reference an immutable snapshot of their definition at creation time',
      'Guards are evaluated before every transition — invalid transitions are rejected',
      'Approval gates block progression until a human decides',
      'Workflow data is tenant-scoped',
    ],
    neverHappens: [
      'A transition bypasses its guard conditions',
      'An approval gate is skipped without human decision',
      'A running instance is affected by changes to its workflow definition',
      'Transition history is modified after recording',
    ],
  },

  // ---------------------------------------------------------------------------
  // Health Check
  // ---------------------------------------------------------------------------
  healthCheck: async () => ({
    healthy: true,
    message: 'Workflow Engine health check — stub implementation',
    checkedAt: new Date(),
  }),
};
