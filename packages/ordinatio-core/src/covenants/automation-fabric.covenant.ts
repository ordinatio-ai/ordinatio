// IHS
/**
 * Automation Fabric Module Covenant (C-09)
 *
 * Tier 3 — GOVERNANCE (What Orders and Rules)
 *
 * Event-driven reactive actions. When X happens, do Y. Automations are defined
 * as data (trigger + conditions + actions), not code. Circuit breaker, retry,
 * idempotency, and dead letter queue are built in.
 *
 * In System 1701: 15 templates, 11 triggers, 30 action types, DI-based
 * action registry, circuit breaker, execution tracking.
 */

import type { ModuleCovenant } from '../covenant/types';

export const AUTOMATION_FABRIC_COVENANT: ModuleCovenant = {
  // ---------------------------------------------------------------------------
  // Identity
  // ---------------------------------------------------------------------------
  identity: {
    id: 'automation-fabric',
    canonicalId: 'C-09',
    version: '0.1.0',
    description:
      'Event-driven automation engine. Triggers + conditions + actions defined as data. Resilience built in: circuit breaker, retry with backoff, idempotency, timeout, rate limiting. Dead letter queue for failed executions.',
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
        name: 'Automation',
        description: 'A rule: when trigger fires and conditions match, execute actions. Active/inactive toggle.',
        hasContextLayer: true,
      },
      {
        name: 'AutomationExecution',
        description: 'Record of a single automation run: trigger event, condition result, actions taken, outcome',
        hasContextLayer: false,
      },
      {
        name: 'DeadLetterEntry',
        description: 'Failed execution that exhausted retries — queued for manual review',
        hasContextLayer: false,
      },
    ],

    events: [
      {
        id: 'automation.executed',
        description: 'Automation ran successfully',
        payloadShape: '{ automationId, executionId, triggerEvent, actionsPerformed: string[] }',
      },
      {
        id: 'automation.failed',
        description: 'Automation execution failed',
        payloadShape: '{ automationId, executionId, error, willRetry: boolean }',
      },
      {
        id: 'automation.dead_lettered',
        description: 'Execution moved to dead letter queue after retries exhausted',
        payloadShape: '{ automationId, executionId, error, retryCount }',
      },
      {
        id: 'automation.action_fired',
        description: 'An individual action within an automation executed',
        payloadShape: '{ automationId, actionType, actionData }',
      },
      {
        id: 'automation.circuit_opened',
        description: 'Circuit breaker opened — automation paused due to repeated failures',
        payloadShape: '{ automationId, failureCount, openedUntil }',
      },
    ],

    subscriptions: [
      'email-engine.email.received',
      'entity-registry.entity_created',
      'entity-registry.entity_updated',
      'workflow-engine.workflow.state_changed',
      'task-engine.task.created',
      'task-engine.task.completed',
    ],
  },

  // ---------------------------------------------------------------------------
  // Capabilities
  // ---------------------------------------------------------------------------
  capabilities: [
    // --- Observe ---
    {
      id: 'automation.list',
      description: 'List all automations with status, trigger type, and last execution info',
      type: 'query',
      risk: 'observe',
      dataSensitivity: 'internal',
      inputs: [
        { name: 'active', type: 'boolean', required: false, description: 'Filter by active/inactive' },
        { name: 'triggerType', type: 'string', required: false, description: 'Filter by trigger type' },
      ],
      output: '{ automations: Automation[], total: number }',
      whenToUse: 'When reviewing what automations exist and their current status.',
    },
    {
      id: 'automation.get_execution_history',
      description: 'Get execution history for an automation',
      type: 'query',
      risk: 'observe',
      dataSensitivity: 'internal',
      inputs: [
        { name: 'automationId', type: 'string', required: true, description: 'The automation ID' },
        { name: 'limit', type: 'number', required: false, description: 'Max results (default 20)' },
      ],
      output: '{ executions: AutomationExecution[] }',
      whenToUse: 'When investigating automation behavior — was it running, did it fail, what did it do?',
    },
    {
      id: 'automation.get_dead_letters',
      description: 'Get failed executions in the dead letter queue',
      type: 'query',
      risk: 'observe',
      dataSensitivity: 'internal',
      inputs: [],
      output: '{ entries: DeadLetterEntry[], count: number }',
      whenToUse: 'When checking for automations that failed and need manual intervention.',
    },
    {
      id: 'automation.get_health',
      description: 'Get health status of the automation system — circuit breaker states, queue depth, error rates',
      type: 'query',
      risk: 'observe',
      dataSensitivity: 'none',
      inputs: [],
      output: '{ healthy: boolean, circuitBreakers: object, queueDepth: number, errorRate: number }',
      whenToUse: 'When checking if the automation system is operating normally.',
    },

    // --- Suggest ---
    {
      id: 'automation.suggest',
      description: 'Suggest a new automation based on observed patterns',
      type: 'mutation',
      risk: 'suggest',
      dataSensitivity: 'none',
      inputs: [
        { name: 'triggerType', type: 'string', required: true, description: 'What event triggers it' },
        { name: 'conditions', type: 'object[]', required: false, description: 'When to run' },
        { name: 'actions', type: 'object[]', required: true, description: 'What to do' },
        { name: 'reason', type: 'string', required: true, description: 'Why this automation would help' },
      ],
      output: '{ suggestionId: string }',
      whenToUse: 'When you observe a repetitive pattern that could be automated.',
    },

    // --- Act ---
    {
      id: 'automation.create',
      description: 'Create a new automation rule',
      type: 'mutation',
      risk: 'act',
      dataSensitivity: 'internal',
      inputs: [
        { name: 'name', type: 'string', required: true, description: 'Automation name' },
        { name: 'triggerType', type: 'string', required: true, description: 'Trigger event type' },
        { name: 'conditions', type: 'object[]', required: false, description: 'Condition rules' },
        { name: 'actions', type: 'object[]', required: true, description: 'Actions to execute' },
        { name: 'active', type: 'boolean', required: false, description: 'Start active (default false)' },
      ],
      output: '{ automationId: string }',
      whenToUse: 'When a new automation rule should be created. Consider suggesting first if unsure.',
    },
    {
      id: 'automation.toggle',
      description: 'Enable or disable an automation',
      type: 'mutation',
      risk: 'act',
      dataSensitivity: 'none',
      inputs: [
        { name: 'automationId', type: 'string', required: true, description: 'The automation' },
        { name: 'active', type: 'boolean', required: true, description: 'Enable or disable' },
      ],
      output: '{ active: boolean }',
      whenToUse: 'When an automation needs to be paused or resumed.',
    },
    {
      id: 'automation.retry_dead_letter',
      description: 'Retry a failed execution from the dead letter queue',
      type: 'action',
      risk: 'act',
      dataSensitivity: 'internal',
      inputs: [
        { name: 'entryId', type: 'string', required: true, description: 'Dead letter entry to retry' },
      ],
      output: '{ retried: boolean, executionId: string }',
      whenToUse: 'When a failed automation should be re-attempted after the root cause is resolved.',
    },
    {
      id: 'automation.emit_event',
      description: 'Emit a custom event that automations can trigger on',
      type: 'action',
      risk: 'act',
      dataSensitivity: 'internal',
      inputs: [
        { name: 'eventType', type: 'string', required: true, description: 'Event type identifier' },
        { name: 'payload', type: 'object', required: true, description: 'Event payload' },
      ],
      output: '{ emitted: boolean, matchedAutomations: number }',
      whenToUse: 'When a custom event should trigger matching automations.',
    },

    // --- Govern ---
    {
      id: 'automation.delete',
      description: 'Delete an automation and its execution history. IRREVERSIBLE.',
      type: 'action',
      risk: 'govern',
      dataSensitivity: 'none',
      inputs: [
        { name: 'automationId', type: 'string', required: true, description: 'The automation to delete' },
        { name: 'confirmDelete', type: 'boolean', required: true, description: 'Must be true' },
      ],
      output: '{ deleted: boolean, executionsRemoved: number }',
      whenToUse: 'RARELY. Only when an automation is no longer needed. Consider disabling instead.',
      pitfalls: ['Irreversible — consider toggling off instead of deleting'],
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
      moduleId: 'auth-engine',
      required: true,
      capabilities: ['auth.get_session'],
    },
    {
      moduleId: 'audit-ledger',
      required: true,
      capabilities: ['audit.record'],
    },
    {
      moduleId: 'email-engine',
      required: false,
      capabilities: ['email.send', 'email.draft'],
    },
    {
      moduleId: 'task-engine',
      required: false,
      capabilities: ['task.create'],
    },
  ],

  // ---------------------------------------------------------------------------
  // Invariants
  // ---------------------------------------------------------------------------
  invariants: {
    alwaysTrue: [
      'Dead letter entries are never silently dropped — they persist until resolved or manually dismissed',
      'Actions are sandboxed to declared permissions — an automation cannot exceed its module access',
      'Circuit breaker activates after configurable consecutive failures',
      'Every execution is recorded with trigger event, conditions evaluated, and actions taken',
      'Automation data is tenant-scoped',
    ],
    neverHappens: [
      'A failed execution is silently discarded',
      'An automation action exceeds its declared permission scope',
      'An inactive automation fires',
      'A dead letter entry disappears without explicit resolution',
    ],
  },

  // ---------------------------------------------------------------------------
  // Health Check
  // ---------------------------------------------------------------------------
  healthCheck: async () => ({
    healthy: true,
    message: 'Automation Fabric health check — stub implementation',
    checkedAt: new Date(),
  }),
};
