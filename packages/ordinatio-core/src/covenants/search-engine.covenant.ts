// IHS
/**
 * Search Engine Module Covenant (C-13)
 *
 * Tier 4 — MEMORY (What Records and Retrieves)
 *
 * Cross-module natural language search. "Find emails about the Henderson suit."
 * Respects tenant boundaries — never leaks data across organizations. Learns
 * search patterns for anticipation and suggestion.
 *
 * In System 1701: Order search (full-text across client name, order number,
 * vendorOrderId, fabric code), search-anticipation service. Target: cross-module
 * unified search.
 */

import type { ModuleCovenant } from '../covenant/types';

export const SEARCH_ENGINE_COVENANT: ModuleCovenant = {
  // ---------------------------------------------------------------------------
  // Identity
  // ---------------------------------------------------------------------------
  identity: {
    id: 'search-engine',
    canonicalId: 'C-13',
    version: '0.1.0',
    description:
      'Cross-module natural language search. Queries span entities, emails, orders, tasks, and documents. Tenant-scoped results. Pattern learning for search anticipation and suggestions.',
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
        name: 'SearchIndex',
        description: 'Indexed representation of an entity for fast full-text search',
        hasContextLayer: false,
      },
      {
        name: 'SearchPattern',
        description: 'Learned search pattern for anticipation and suggestion',
        hasContextLayer: false,
      },
    ],

    events: [
      {
        id: 'search.query_executed',
        description: 'A search query was executed',
        payloadShape: '{ query, resultCount, modules: string[], durationMs }',
      },
      {
        id: 'search.index_updated',
        description: 'Search index was updated for an entity',
        payloadShape: '{ entityType, entityId, action: "added" | "updated" | "removed" }',
      },
    ],

    subscriptions: [
      'entity-registry.entity_created',
      'entity-registry.entity_updated',
      'email-engine.email.received',
      'task-engine.task.created',
    ],
  },

  // ---------------------------------------------------------------------------
  // Capabilities
  // ---------------------------------------------------------------------------
  capabilities: [
    // --- Observe ---
    {
      id: 'search.query',
      description: 'Search across all modules with natural language or keyword query',
      type: 'query',
      risk: 'observe',
      dataSensitivity: 'internal',
      inputs: [
        { name: 'query', type: 'string', required: true, description: 'Search text (natural language or keywords)' },
        { name: 'modules', type: 'string[]', required: false, description: 'Limit to specific modules' },
        { name: 'entityType', type: 'string', required: false, description: 'Filter by entity type' },
        { name: 'dateFrom', type: 'string', required: false, description: 'Start of time range' },
        { name: 'dateTo', type: 'string', required: false, description: 'End of time range' },
        { name: 'page', type: 'number', required: false, description: 'Page number (1-based)' },
        { name: 'pageSize', type: 'number', required: false, description: 'Results per page (default 20)' },
      ],
      output: '{ results: SearchResult[], total: number, hasMore: boolean, modules: string[] }',
      whenToUse: 'When looking for information across the system — entities, emails, orders, documents. Start with broad searches and narrow down.',
    },
    {
      id: 'search.suggest',
      description: 'Get search suggestions based on partial query and learned patterns',
      type: 'query',
      risk: 'observe',
      dataSensitivity: 'none',
      inputs: [
        { name: 'prefix', type: 'string', required: true, description: 'Partial search text' },
        { name: 'limit', type: 'number', required: false, description: 'Max suggestions (default 5)' },
      ],
      output: '{ suggestions: string[] }',
      whenToUse: 'When providing autocomplete suggestions as the user types.',
    },
    {
      id: 'search.get_related',
      description: 'Find entities related to a given entity across all modules',
      type: 'query',
      risk: 'observe',
      dataSensitivity: 'internal',
      inputs: [
        { name: 'entityType', type: 'string', required: true, description: 'Source entity type' },
        { name: 'entityId', type: 'string', required: true, description: 'Source entity ID' },
        { name: 'limit', type: 'number', required: false, description: 'Max results (default 10)' },
      ],
      output: '{ related: SearchResult[] }',
      whenToUse: 'When you need to discover what is connected to a specific entity across the system.',
    },

    // --- Act ---
    {
      id: 'search.reindex',
      description: 'Trigger reindexing of a specific entity or module',
      type: 'action',
      risk: 'act',
      dataSensitivity: 'none',
      inputs: [
        { name: 'entityType', type: 'string', required: false, description: 'Entity type to reindex (omit for all)' },
        { name: 'entityId', type: 'string', required: false, description: 'Specific entity to reindex' },
      ],
      output: '{ reindexed: number }',
      whenToUse: 'When search results seem stale or an entity change was not picked up by the index.',
    },
    {
      id: 'search.clear_patterns',
      description: 'Clear learned search patterns for a user',
      type: 'action',
      risk: 'act',
      dataSensitivity: 'none',
      inputs: [],
      output: '{ cleared: boolean }',
      whenToUse: 'When search suggestions are unhelpful and patterns should be reset.',
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
  ],

  // ---------------------------------------------------------------------------
  // Invariants
  // ---------------------------------------------------------------------------
  invariants: {
    alwaysTrue: [
      'Search results respect tenant boundaries — never leak data across organizations',
      'The search index is eventually consistent with source data',
      'Every search query is logged for pattern learning (query text, not results)',
      'Results include source module and entity type for context',
    ],
    neverHappens: [
      'Search results include data from another tenant',
      'A deleted entity appears in search results',
      'Search patterns are shared across users or organizations',
    ],
  },

  // ---------------------------------------------------------------------------
  // Health Check
  // ---------------------------------------------------------------------------
  healthCheck: async () => ({
    healthy: true,
    message: 'Search Engine health check — stub implementation',
    checkedAt: new Date(),
  }),
};
