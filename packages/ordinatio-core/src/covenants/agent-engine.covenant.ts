// IHS
/**
 * Agent Engine Module Covenant (C-15)
 *
 * Tier 5 — INTELLIGENCE (What Reasons)
 *
 * THE CORE. AI reasoning infrastructure: Context Engine, Intent Resolution,
 * Module Covenant Registry, LLM provider abstraction. Agents are the primary
 * operators — humans supervise. Provider-agnostic: Claude, OpenAI, Gemini,
 * or future models.
 *
 * In System 1701: Role/tool registries, three-layer memory, chat orchestrator,
 * prompt builder, LLM providers (Claude, OpenAI, Gemini, Mistral, DeepSeek, Grok).
 */

import type { ModuleCovenant } from '../covenant/types';

export const AGENT_ENGINE_COVENANT: ModuleCovenant = {
  // ---------------------------------------------------------------------------
  // Identity
  // ---------------------------------------------------------------------------
  identity: {
    id: 'agent-engine',
    canonicalId: 'C-15',
    version: '0.1.0',
    description:
      'AI reasoning infrastructure. Context Engine assembles cross-module situation awareness. Module Covenant Registry enables runtime capability discovery. LLM-agnostic: provider abstraction supports Claude, OpenAI, Gemini, and future models. Agents are the primary operators.',
    status: 'canonical',
    tier: 'intelligence',
    dedication: 'IHS',
  },

  // ---------------------------------------------------------------------------
  // Domain Model
  // ---------------------------------------------------------------------------
  domain: {
    entities: [
      {
        name: 'AgentRole',
        description: 'Defined agent persona with module access, max risk level, and behavioral guidelines',
        hasContextLayer: false,
      },
      {
        name: 'AgentMemory',
        description: 'Three-layer memory: working (current session), temporary (days), deep (permanent)',
        hasContextLayer: true,
      },
      {
        name: 'AgentInteraction',
        description: 'Record of an agent chat session with messages, tool invocations, and outcomes',
        hasContextLayer: true,
      },
      {
        name: 'ExecutionArtifact',
        description: 'Output of a bounded agent execution: actions taken, mutations made, context snapshot',
        hasContextLayer: false,
      },
    ],

    events: [
      {
        id: 'agent.interaction_started',
        description: 'Agent chat session initiated',
        payloadShape: '{ interactionId, role, userId, page }',
      },
      {
        id: 'agent.tool_invoked',
        description: 'Agent invoked a capability/tool',
        payloadShape: '{ interactionId, capabilityId, risk, approved: boolean }',
      },
      {
        id: 'agent.approval_requested',
        description: 'Agent action requires human approval before proceeding',
        payloadShape: '{ interactionId, capabilityId, risk, description }',
      },
      {
        id: 'agent.execution_completed',
        description: 'Bounded agent execution completed (intermittent pattern)',
        payloadShape: '{ artifactId, role, actionsPerformed: number, duration }',
      },
      {
        id: 'agent.memory_updated',
        description: 'Agent memory was modified (remember/forget)',
        payloadShape: '{ memoryLayer, action: "remember" | "forget", tags: string[] }',
      },
    ],

    subscriptions: [
      'email-engine.email.received',
      'workflow-engine.workflow.approval_requested',
      'automation-fabric.automation.action_fired',
      'security-engine.security.threat_detected',
    ],
  },

  // ---------------------------------------------------------------------------
  // Capabilities
  // ---------------------------------------------------------------------------
  capabilities: [
    // --- Observe ---
    {
      id: 'agent.discover_capabilities',
      description: 'Query available capabilities from Module Covenants, filtered by role access and risk level',
      type: 'query',
      risk: 'observe',
      dataSensitivity: 'none',
      inputs: [
        { name: 'role', type: 'string', required: false, description: 'Agent role to query for' },
        { name: 'maxRisk', type: 'string', required: false, description: 'Maximum risk level to include' },
        { name: 'moduleId', type: 'string', required: false, description: 'Filter to specific module' },
      ],
      output: '{ capabilities: ModuleCapability[], modules: string[] }',
      whenToUse: 'When you need to understand what actions are available. This is self-configuration — no hardcoded tool lists.',
    },
    {
      id: 'agent.get_context',
      description: 'Assemble cross-module context for a situation (entity + page + history)',
      type: 'query',
      risk: 'observe',
      dataSensitivity: 'sensitive',
      inputs: [
        { name: 'entityType', type: 'string', required: false, description: 'Focus entity type' },
        { name: 'entityId', type: 'string', required: false, description: 'Focus entity ID' },
        { name: 'page', type: 'string', required: false, description: 'Current dashboard page' },
        { name: 'tokenBudget', type: 'number', required: false, description: 'Max tokens for context (default 4000)' },
      ],
      output: '{ context: string, tokenCount: number, sources: string[] }',
      whenToUse: 'Before any reasoning — assembles the optimal context from Layer C summaries across all modules.',
    },
    {
      id: 'agent.recall',
      description: 'Retrieve agent memories by tags, entity, or recency',
      type: 'query',
      risk: 'observe',
      dataSensitivity: 'internal',
      inputs: [
        { name: 'tags', type: 'string[]', required: false, description: 'Memory tags to search' },
        { name: 'entityType', type: 'string', required: false, description: 'Entity-scoped memories' },
        { name: 'entityId', type: 'string', required: false, description: 'Entity-scoped memories' },
        { name: 'layer', type: 'string', required: false, description: 'Memory layer: working, temporary, deep' },
      ],
      output: '{ memories: AgentMemory[] }',
      whenToUse: 'When checking if you have prior knowledge about a topic, entity, or user instruction.',
    },
    {
      id: 'agent.get_interaction_history',
      description: 'Get recent interaction history for context continuity',
      type: 'query',
      risk: 'observe',
      dataSensitivity: 'sensitive',
      inputs: [
        { name: 'userId', type: 'string', required: false, description: 'Filter by user' },
        { name: 'limit', type: 'number', required: false, description: 'Max interactions (default 5)' },
      ],
      output: '{ interactions: AgentInteraction[] }',
      whenToUse: 'When you need to understand what was discussed in previous sessions.',
    },
    {
      id: 'agent.list_roles',
      description: 'List available agent roles with their module access and capabilities',
      type: 'query',
      risk: 'observe',
      dataSensitivity: 'none',
      inputs: [],
      output: '{ roles: AgentRole[] }',
      whenToUse: 'When understanding what agent roles exist and what they can do.',
    },

    // --- Act ---
    {
      id: 'agent.remember',
      description: 'Store a memory for future recall',
      type: 'mutation',
      risk: 'act',
      dataSensitivity: 'internal',
      inputs: [
        { name: 'content', type: 'string', required: true, description: 'What to remember' },
        { name: 'tags', type: 'string[]', required: true, description: 'Tags for retrieval' },
        { name: 'layer', type: 'string', required: false, description: 'Memory layer (default: temporary)' },
        { name: 'entityType', type: 'string', required: false, description: 'Scope to entity' },
        { name: 'entityId', type: 'string', required: false, description: 'Scope to entity' },
      ],
      output: '{ memoryId: string }',
      whenToUse: 'When you learn something worth remembering — user preferences, entity facts, operational insights.',
    },
    {
      id: 'agent.forget',
      description: 'Remove a specific memory',
      type: 'mutation',
      risk: 'act',
      dataSensitivity: 'none',
      inputs: [
        { name: 'memoryId', type: 'string', required: true, description: 'Memory to forget' },
      ],
      output: '{ forgotten: boolean }',
      whenToUse: 'When a memory is outdated or incorrect.',
    },
    {
      id: 'agent.invoke_capability',
      description: 'Execute a capability from any module through the governance engine',
      type: 'action',
      risk: 'act',
      dataSensitivity: 'sensitive',
      inputs: [
        { name: 'capabilityId', type: 'string', required: true, description: 'Capability to invoke' },
        { name: 'inputs', type: 'object', required: true, description: 'Capability input parameters' },
      ],
      output: '{ result: object, governanceVerdict: string, auditEntryId: string }',
      whenToUse: 'When invoking a discovered capability. Governance checks are automatic.',
      pitfalls: [
        'Risk level determines whether approval is needed — check the capability risk first',
        'Blocked capabilities return a denied verdict, not an error',
      ],
    },

    // --- Govern ---
    {
      id: 'agent.modify_role',
      description: 'Create or modify an agent role definition. Changes affect what agents can do.',
      type: 'mutation',
      risk: 'govern',
      dataSensitivity: 'internal',
      inputs: [
        { name: 'roleId', type: 'string', required: true, description: 'Role to modify or create' },
        { name: 'modules', type: 'string[]', required: true, description: 'Module access list' },
        { name: 'maxRisk', type: 'string', required: true, description: 'Maximum risk level' },
        { name: 'guidelines', type: 'string', required: false, description: 'Behavioral guidelines' },
      ],
      output: '{ roleId: string, updated: boolean }',
      whenToUse: 'CAREFULLY. Role changes affect what agents can and cannot do system-wide.',
      pitfalls: ['Adding high-risk module access without corresponding approval gates is dangerous'],
    },
    {
      id: 'agent.configure_provider',
      description: 'Set or change the LLM provider for agent roles. Affects reasoning quality and data flow.',
      type: 'mutation',
      risk: 'govern',
      dataSensitivity: 'critical',
      inputs: [
        { name: 'provider', type: 'string', required: true, description: 'Provider ID (claude, openai, gemini, etc.)' },
        { name: 'role', type: 'string', required: false, description: 'Role-specific override (omit for global)' },
        { name: 'trustLevel', type: 'string', required: false, description: 'Data sensitivity trust level for provider' },
      ],
      output: '{ configured: boolean, previousProvider: string }',
      whenToUse: 'CAREFULLY. Changing LLM providers affects data flow (trust policies) and reasoning quality.',
      pitfalls: [
        'Provider trust policies control which tools are accessible — changing may restrict agent capabilities',
        'Some providers may not support all tool calling formats',
      ],
    },
  ],

  // ---------------------------------------------------------------------------
  // Dependencies
  // ---------------------------------------------------------------------------
  dependencies: [
    {
      moduleId: 'entity-registry',
      required: true,
      capabilities: ['entity.search', 'entity.get'],
    },
    {
      moduleId: 'auth-engine',
      required: true,
      capabilities: ['auth.get_session'],
    },
    {
      moduleId: 'settings-engine',
      required: true,
      capabilities: ['settings.get', 'settings.get_flags'],
    },
    {
      moduleId: 'audit-ledger',
      required: true,
      capabilities: ['audit.record', 'audit.get_timeline'],
    },
    {
      moduleId: 'search-engine',
      required: false,
      capabilities: ['search.query'],
    },
  ],

  // ---------------------------------------------------------------------------
  // Invariants
  // ---------------------------------------------------------------------------
  invariants: {
    alwaysTrue: [
      'Agent actions are always auditable — every tool invocation produces an audit entry',
      'Agents cannot exceed their declared permission scope (modules + risk level)',
      'LLM providers are swappable without code changes',
      'Provider trust policies restrict tool access by data sensitivity',
      'Agent memory is tenant-scoped and user-scoped',
      'Context assembly respects token budgets',
    ],
    neverHappens: [
      'An agent invokes a capability outside its role\'s module access',
      'An agent bypasses the governance engine',
      'Agent memory leaks across tenants or users',
      'LLM provider change silently breaks tool calling',
      'Context assembly exceeds the specified token budget',
    ],
  },

  // ---------------------------------------------------------------------------
  // Health Check
  // ---------------------------------------------------------------------------
  healthCheck: async () => ({
    healthy: true,
    message: 'Agent Engine health check — stub implementation',
    checkedAt: new Date(),
  }),
};
