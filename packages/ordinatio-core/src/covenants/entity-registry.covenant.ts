// IHS
/**
 * Entity Registry Module Covenant (C-01)
 *
 * Tier 1 — BEING (What Exists)
 *
 * Universal representation of things: people, organizations, objects. Every
 * business has entities it tracks — clients, contacts, vendors, employees.
 * The Entity Registry provides a polymorphic entity model with relationship
 * graph for agent discovery: "who is connected to whom" without joins.
 *
 * In System 1701: Client + Contact modules (separate models, no shared abstraction).
 * Target: unified Entity with type discriminator, relationship graph, three-layer storage.
 */

import type { ModuleCovenant } from '../covenant/types';

export const ENTITY_REGISTRY_COVENANT: ModuleCovenant = {
  // ---------------------------------------------------------------------------
  // Identity
  // ---------------------------------------------------------------------------
  identity: {
    id: 'entity-registry',
    canonicalId: 'C-01',
    version: '0.1.0',
    description:
      'Universal entity management — people, organizations, and objects with typed relationships. Polymorphic entity model with relationship graph. Agents query connections without joins.',
    status: 'canonical',
    tier: 'being',
    dedication: 'IHS',
  },

  // ---------------------------------------------------------------------------
  // Domain Model
  // ---------------------------------------------------------------------------
  domain: {
    entities: [
      {
        name: 'Entity',
        description: 'A person, organization, or object tracked by the system. Polymorphic via entityType discriminator.',
        hasContextLayer: true,
      },
      {
        name: 'EntityRelationship',
        description: 'Typed, directional relationship between two entities (e.g., client-of, employed-by, referred-by)',
        hasContextLayer: false,
      },
      {
        name: 'EntityTag',
        description: 'Categorical label applied to an entity for filtering and grouping',
        hasContextLayer: false,
      },
      {
        name: 'EntityNote',
        description: 'Free-form note attached to an entity with author and timestamp',
        hasContextLayer: true,
      },
    ],

    events: [
      {
        id: 'entity.created',
        description: 'New entity created in the registry',
        payloadShape: '{ entityId, entityType, name, createdBy }',
      },
      {
        id: 'entity.updated',
        description: 'Entity fields modified',
        payloadShape: '{ entityId, entityType, changedFields: string[], updatedBy }',
      },
      {
        id: 'entity.merged',
        description: 'Two entities merged into one (e.g., duplicate contact resolved)',
        payloadShape: '{ survivorId, mergedId, entityType }',
      },
      {
        id: 'entity.relationship_created',
        description: 'New relationship established between entities',
        payloadShape: '{ fromEntityId, toEntityId, relationshipType }',
      },
      {
        id: 'entity.tagged',
        description: 'Tag applied to or removed from an entity',
        payloadShape: '{ entityId, tagId, action: "added" | "removed" }',
      },
      {
        id: 'entity.note_added',
        description: 'Note added to an entity',
        payloadShape: '{ entityId, noteId, authorId }',
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
      id: 'entity.search',
      description: 'Search entities by name, type, tag, or relationship with pagination',
      type: 'query',
      risk: 'observe',
      dataSensitivity: 'internal',
      inputs: [
        { name: 'query', type: 'string', required: false, description: 'Search text (name, email, phone)' },
        { name: 'entityType', type: 'string', required: false, description: 'Filter by type (person, organization, object)' },
        { name: 'tags', type: 'string[]', required: false, description: 'Filter by tags' },
        { name: 'page', type: 'number', required: false, description: 'Page number (1-based)' },
        { name: 'pageSize', type: 'number', required: false, description: 'Items per page (default 20, max 100)' },
      ],
      output: '{ entities: Entity[], total: number, hasMore: boolean }',
      whenToUse: 'When you need to find entities by name, type, or tag. Start here before taking action on a specific entity.',
    },
    {
      id: 'entity.get',
      description: 'Get a single entity with full details, relationships, and recent activity',
      type: 'query',
      risk: 'observe',
      dataSensitivity: 'internal',
      inputs: [
        { name: 'entityId', type: 'string', required: true, description: 'The entity ID' },
        { name: 'includeRelationships', type: 'boolean', required: false, description: 'Include relationship graph' },
        { name: 'includeTimeline', type: 'boolean', required: false, description: 'Include recent activity' },
      ],
      output: '{ entity: Entity, relationships?: EntityRelationship[], timeline?: Activity[] }',
      whenToUse: 'When you need full details about a specific entity, including its connections and history.',
    },
    {
      id: 'entity.get_relationships',
      description: 'Get all relationships for an entity — who/what it is connected to',
      type: 'query',
      risk: 'observe',
      dataSensitivity: 'internal',
      inputs: [
        { name: 'entityId', type: 'string', required: true, description: 'The entity ID' },
        { name: 'relationshipType', type: 'string', required: false, description: 'Filter by relationship type' },
      ],
      output: '{ relationships: EntityRelationship[] }',
      whenToUse: 'When you need to understand an entity\'s connections — related clients, linked orders, associated emails.',
    },
    {
      id: 'entity.list_notes',
      description: 'List notes attached to an entity',
      type: 'query',
      risk: 'observe',
      dataSensitivity: 'sensitive',
      inputs: [
        { name: 'entityId', type: 'string', required: true, description: 'The entity ID' },
      ],
      output: '{ notes: EntityNote[] }',
      whenToUse: 'When you need to review notes or observations recorded about an entity.',
    },
    {
      id: 'entity.resolve',
      description: 'Resolve an entity reference — find the canonical entity for a name, email, or external ID',
      type: 'query',
      risk: 'observe',
      dataSensitivity: 'internal',
      inputs: [
        { name: 'identifier', type: 'string', required: true, description: 'Name, email, phone, or external ID to resolve' },
        { name: 'entityType', type: 'string', required: false, description: 'Expected entity type' },
      ],
      output: '{ entity: Entity | null, confidence: number }',
      whenToUse: 'When you have a reference (name in an email, phone number) and need to find the matching entity.',
    },

    // --- Suggest ---
    {
      id: 'entity.suggest_merge',
      description: 'Suggest merging two entities that appear to be duplicates',
      type: 'mutation',
      risk: 'suggest',
      dataSensitivity: 'internal',
      inputs: [
        { name: 'entityId1', type: 'string', required: true, description: 'First entity' },
        { name: 'entityId2', type: 'string', required: true, description: 'Second entity (potential duplicate)' },
        { name: 'reason', type: 'string', required: true, description: 'Why these appear to be duplicates' },
      ],
      output: '{ suggestionId: string }',
      whenToUse: 'When you discover two entities that appear to represent the same person or thing.',
    },

    // --- Act ---
    {
      id: 'entity.create',
      description: 'Create a new entity in the registry',
      type: 'mutation',
      risk: 'act',
      dataSensitivity: 'internal',
      inputs: [
        { name: 'entityType', type: 'string', required: true, description: 'Entity type (person, organization, object)' },
        { name: 'name', type: 'string', required: true, description: 'Display name' },
        { name: 'email', type: 'string', required: false, description: 'Primary email' },
        { name: 'phone', type: 'string', required: false, description: 'Primary phone' },
        { name: 'metadata', type: 'object', required: false, description: 'Type-specific fields' },
      ],
      output: '{ entityId: string }',
      whenToUse: 'When a genuinely new entity needs to be tracked. Always search first to avoid duplicates.',
      pitfalls: ['Always search before creating — duplicates are hard to merge'],
    },
    {
      id: 'entity.update',
      description: 'Update entity fields',
      type: 'mutation',
      risk: 'act',
      dataSensitivity: 'internal',
      inputs: [
        { name: 'entityId', type: 'string', required: true, description: 'The entity to update' },
        { name: 'fields', type: 'object', required: true, description: 'Fields to update' },
      ],
      output: '{ updated: boolean }',
      whenToUse: 'When entity information needs correction or enrichment.',
    },
    {
      id: 'entity.add_note',
      description: 'Add a note to an entity',
      type: 'mutation',
      risk: 'act',
      dataSensitivity: 'sensitive',
      inputs: [
        { name: 'entityId', type: 'string', required: true, description: 'The entity' },
        { name: 'content', type: 'string', required: true, description: 'Note text' },
      ],
      output: '{ noteId: string }',
      whenToUse: 'When you need to record an observation, instruction, or context about an entity.',
    },
    {
      id: 'entity.link',
      description: 'Create a relationship between two entities',
      type: 'mutation',
      risk: 'act',
      dataSensitivity: 'internal',
      inputs: [
        { name: 'fromEntityId', type: 'string', required: true, description: 'Source entity' },
        { name: 'toEntityId', type: 'string', required: true, description: 'Target entity' },
        { name: 'relationshipType', type: 'string', required: true, description: 'Type of relationship' },
      ],
      output: '{ relationshipId: string }',
      whenToUse: 'When you discover a connection between entities that should be tracked.',
    },

    // --- Govern ---
    {
      id: 'entity.merge',
      description: 'Merge two entities — combines all data, relationships, and history. IRREVERSIBLE.',
      type: 'action',
      risk: 'govern',
      dataSensitivity: 'sensitive',
      inputs: [
        { name: 'survivorId', type: 'string', required: true, description: 'Entity that survives the merge' },
        { name: 'mergedId', type: 'string', required: true, description: 'Entity absorbed into survivor' },
        { name: 'confirmMerge', type: 'boolean', required: true, description: 'Must be true to confirm' },
      ],
      output: '{ merged: boolean, relationshipsMoved: number, notesMoved: number }',
      whenToUse: 'RARELY. Only when confirmed duplicates need to be combined. This is irreversible.',
      pitfalls: [
        'Irreversible — all data from mergedId moves to survivorId',
        'Always confirm with user before proceeding',
      ],
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
      'Every entity has a unique ID, type, and display name',
      'Deletion is soft — entities are deactivated, never physically removed',
      'Entity data is tenant-scoped — never leaks across organizations',
      'Relationships are directional and typed',
      'Every entity modification produces an audit trail entry',
    ],
    neverHappens: [
      'An entity is physically deleted from the database',
      'Entity data crosses tenant boundaries',
      'An entity exists without a type discriminator',
      'A relationship references a non-existent entity',
    ],
  },

  // ---------------------------------------------------------------------------
  // Health Check
  // ---------------------------------------------------------------------------
  healthCheck: async () => ({
    healthy: true,
    message: 'Entity Registry health check — stub implementation',
    checkedAt: new Date(),
  }),
};
