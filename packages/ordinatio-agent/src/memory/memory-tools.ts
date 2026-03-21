// ===========================================
// AGENT MEMORY TOOLS
// ===========================================
// Tool definitions for the agent memory system.
// Shared across ALL agent roles — every agent
// can remember, recall, and forget.
// Pure data, no imports beyond types.
// ===========================================

import type { AgentTool } from '../types';

export const MEMORY_TOOLS: AgentTool[] = [
  // -------------------------------------------
  // REMEMBER — Create a new memory
  // -------------------------------------------
  {
    name: 'remember',
    description: 'Store a new observation, fact, or preference in agent memory. Use TEMPORARY for short-lived observations (auto-expires). Use DEEP for permanent knowledge.',
    module: 'memory',
    method: 'POST',
    endpoint: '/api/agent/memory',
    auth: 'session_cookie',
    params: [
      { name: 'summary', type: 'string', required: true, description: 'Short summary (injected into future context windows)' },
      { name: 'detail', type: 'string', required: false, description: 'Full detail (loaded on demand when memory is recalled)' },
      { name: 'layer', type: 'string', required: true, description: 'Memory layer', allowedValues: ['TEMPORARY', 'DEEP'] },
      { name: 'tags', type: 'string[]', required: false, description: 'Tag names for retrieval (created if they don\'t exist)' },
      { name: 'clientId', type: 'string', required: false, description: 'Scope memory to a specific client' },
      { name: 'orderId', type: 'string', required: false, description: 'Scope memory to a specific order' },
      { name: 'expiresIn', type: 'number', required: false, description: 'Minutes until expiry (TEMPORARY only, default: 1440 = 24h)' },
    ],
    example: {
      summary: 'Client prefers navy over black for suits',
      layer: 'DEEP',
      tags: ['preference', 'color'],
      clientId: 'clxyz123',
    },
    responseShape: '{ id, summary, layer, tags: [{ tag: { name } }], createdAt }',
    whenToUse: 'When you learn something worth remembering — client preferences, vendor patterns, business observations. Use DEEP for permanent facts, TEMPORARY for short-lived notes.',
    pitfalls: [
      'TEMPORARY memories auto-expire — use expiresIn to control lifetime',
      'Tags are the primary retrieval mechanism — always add relevant tags',
      'Entity-scoped memories (clientId/orderId) auto-load when working with that entity',
    ],
    dataSensitivity: 'internal',
  },

  // -------------------------------------------
  // RECALL — Search and retrieve memories
  // -------------------------------------------
  {
    name: 'recall',
    description: 'Search agent memories by tags, entity, text query, or layer. Returns matching memories sorted by relevance.',
    module: 'memory',
    method: 'GET',
    endpoint: '/api/agent/memory',
    auth: 'session_cookie',
    params: [
      { name: 'tags', type: 'string[]', required: false, description: 'Filter by tag names' },
      { name: 'clientId', type: 'string', required: false, description: 'Filter by client' },
      { name: 'orderId', type: 'string', required: false, description: 'Filter by order' },
      { name: 'query', type: 'string', required: false, description: 'Text search in summary and detail' },
      { name: 'layer', type: 'string', required: false, description: 'Filter by layer', allowedValues: ['TEMPORARY', 'DEEP'] },
      { name: 'limit', type: 'number', required: false, description: 'Max results (default: 50)' },
    ],
    example: {
      tags: ['preference'],
      clientId: 'clxyz123',
    },
    responseShape: '{ memories: [{ id, summary, detail, layer, tags, createdAt }], total }',
    whenToUse: 'When you need to check what you know about a client, vendor, or topic. At least one filter (tags, clientId, orderId, query, or layer) is required.',
    pitfalls: [
      'Expired TEMPORARY memories are excluded by default',
      'Provide at least one search criterion — empty queries are rejected',
    ],
    dataSensitivity: 'internal',
  },

  // -------------------------------------------
  // FORGET — Delete a memory
  // -------------------------------------------
  {
    name: 'forget',
    description: 'Delete a specific memory by ID. Use when information is outdated or incorrect.',
    module: 'memory',
    method: 'DELETE',
    endpoint: '/api/agent/memory/{memoryId}',
    auth: 'session_cookie',
    params: [
      { name: 'memoryId', type: 'string', required: true, description: 'ID of the memory to delete' },
    ],
    example: { memoryId: 'clxyz456' },
    responseShape: '{ deleted: true }',
    whenToUse: 'When a memory is no longer accurate or relevant. Prefer forgetting over letting incorrect information persist.',
    pitfalls: [
      'Deletion is permanent — there is no undo',
      'TEMPORARY memories auto-expire — you usually don\'t need to manually forget them',
    ],
    dataSensitivity: 'internal',
  },
];
