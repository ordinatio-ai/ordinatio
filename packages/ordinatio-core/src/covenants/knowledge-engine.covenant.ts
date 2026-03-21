// IHS
/**
 * Knowledge Engine Module Covenant (E-05)
 *
 * Ecclesial Extension
 *
 * Organizational knowledge base — structured knowledge entries that agents
 * and humans can create, query, and maintain. Entity-scoped knowledge for
 * contextual recall. Feeds into the Context Engine (C-15).
 *
 * In System 1701: Agent knowledge service, entity knowledge service,
 * knowledge tools for COO agent.
 */

import type { ModuleCovenant } from '../covenant/types';

export const KNOWLEDGE_ENGINE_COVENANT: ModuleCovenant = {
  // ---------------------------------------------------------------------------
  // Identity
  // ---------------------------------------------------------------------------
  identity: {
    id: 'knowledge-engine',
    canonicalId: 'E-05',
    version: '0.1.0',
    description:
      'Organizational knowledge base. Structured entries with tags, entity scoping, and versioning. Agents create knowledge from observations. Humans curate and correct. Feeds into Context Engine for situational awareness.',
    status: 'ecclesial',
    tier: 'memory',
    dedication: 'IHS',
  },

  // ---------------------------------------------------------------------------
  // Domain Model
  // ---------------------------------------------------------------------------
  domain: {
    entities: [
      {
        name: 'KnowledgeEntry',
        description: 'A piece of organizational knowledge — fact, procedure, preference, or insight',
        hasContextLayer: true,
      },
      {
        name: 'KnowledgeCategory',
        description: 'Organizational category for knowledge entries (FAQ, procedure, policy, insight)',
        hasContextLayer: false,
      },
    ],

    events: [
      {
        id: 'knowledge.entry_created',
        description: 'New knowledge entry added',
        payloadShape: '{ entryId, title, category, createdBy, entityScope? }',
      },
      {
        id: 'knowledge.entry_updated',
        description: 'Knowledge entry modified',
        payloadShape: '{ entryId, updatedBy, changedFields: string[] }',
      },
      {
        id: 'knowledge.entry_archived',
        description: 'Knowledge entry archived (no longer current)',
        payloadShape: '{ entryId, archivedBy, reason }',
      },
    ],

    subscriptions: [
      'entity-registry.entity_created',  // Auto-create knowledge stub for new entities
      'agent-engine.agent.memory_updated', // Agent observations may become knowledge
    ],
  },

  // ---------------------------------------------------------------------------
  // Capabilities
  // ---------------------------------------------------------------------------
  capabilities: [
    // --- Observe ---
    {
      id: 'knowledge.search',
      description: 'Search knowledge entries by text, tags, category, or entity scope',
      type: 'query',
      risk: 'observe',
      dataSensitivity: 'internal',
      inputs: [
        { name: 'query', type: 'string', required: false, description: 'Search text' },
        { name: 'tags', type: 'string[]', required: false, description: 'Filter by tags' },
        { name: 'category', type: 'string', required: false, description: 'Filter by category' },
        { name: 'entityType', type: 'string', required: false, description: 'Scoped to entity type' },
        { name: 'entityId', type: 'string', required: false, description: 'Scoped to specific entity' },
      ],
      output: '{ entries: KnowledgeEntry[], total: number }',
      whenToUse: 'When looking for organizational knowledge — procedures, facts, or entity-specific information.',
    },
    {
      id: 'knowledge.get',
      description: 'Get a single knowledge entry with full content and version history',
      type: 'query',
      risk: 'observe',
      dataSensitivity: 'internal',
      inputs: [
        { name: 'entryId', type: 'string', required: true, description: 'The entry ID' },
      ],
      output: '{ entry: KnowledgeEntry, versions: number }',
      whenToUse: 'When you need the full content of a specific knowledge entry.',
    },
    {
      id: 'knowledge.get_for_entity',
      description: 'Get all knowledge scoped to a specific entity',
      type: 'query',
      risk: 'observe',
      dataSensitivity: 'internal',
      inputs: [
        { name: 'entityType', type: 'string', required: true, description: 'Entity type' },
        { name: 'entityId', type: 'string', required: true, description: 'Entity ID' },
      ],
      output: '{ entries: KnowledgeEntry[] }',
      whenToUse: 'When assembling context for a specific entity — what do we know about this client/order/vendor?',
    },

    // --- Act ---
    {
      id: 'knowledge.create',
      description: 'Create a new knowledge entry',
      type: 'mutation',
      risk: 'act',
      dataSensitivity: 'internal',
      inputs: [
        { name: 'title', type: 'string', required: true, description: 'Entry title' },
        { name: 'content', type: 'string', required: true, description: 'Entry content (markdown)' },
        { name: 'tags', type: 'string[]', required: false, description: 'Tags for discovery' },
        { name: 'category', type: 'string', required: false, description: 'Knowledge category' },
        { name: 'entityType', type: 'string', required: false, description: 'Scope to entity type' },
        { name: 'entityId', type: 'string', required: false, description: 'Scope to specific entity' },
      ],
      output: '{ entryId: string }',
      whenToUse: 'When you learn something worth recording — a fact, procedure, or insight about the organization.',
    },
    {
      id: 'knowledge.update',
      description: 'Update an existing knowledge entry (creates a new version)',
      type: 'mutation',
      risk: 'act',
      dataSensitivity: 'internal',
      inputs: [
        { name: 'entryId', type: 'string', required: true, description: 'Entry to update' },
        { name: 'content', type: 'string', required: true, description: 'Updated content' },
      ],
      output: '{ updated: boolean, version: number }',
      whenToUse: 'When knowledge needs correction or enrichment.',
    },
    {
      id: 'knowledge.archive',
      description: 'Archive a knowledge entry — marks as no longer current but preserves history',
      type: 'mutation',
      risk: 'act',
      dataSensitivity: 'none',
      inputs: [
        { name: 'entryId', type: 'string', required: true, description: 'Entry to archive' },
        { name: 'reason', type: 'string', required: false, description: 'Why it is being archived' },
      ],
      output: '{ archived: boolean }',
      whenToUse: 'When knowledge is outdated or no longer relevant.',
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
      moduleId: 'search-engine',
      required: false,
      capabilities: ['search.reindex'],
    },
    {
      moduleId: 'agent-engine',
      required: false,
      capabilities: ['agent.recall'],
    },
  ],

  // ---------------------------------------------------------------------------
  // Invariants
  // ---------------------------------------------------------------------------
  invariants: {
    alwaysTrue: [
      'Knowledge entries are versioned — updates create new versions, not overwrites',
      'Archived entries are preserved (soft delete), not physically removed',
      'Entity-scoped knowledge is discoverable via entity lookup',
      'Knowledge data is tenant-scoped',
      'Every modification records actor and timestamp',
    ],
    neverHappens: [
      'A knowledge entry is physically deleted — only archived',
      'Version history is lost on update',
      'Knowledge data crosses tenant boundaries',
    ],
  },

  // ---------------------------------------------------------------------------
  // Health Check
  // ---------------------------------------------------------------------------
  healthCheck: async () => ({
    healthy: true,
    message: 'Knowledge Engine health check — stub implementation',
    checkedAt: new Date(),
  }),
};
