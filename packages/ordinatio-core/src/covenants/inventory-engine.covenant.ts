// IHS
/**
 * Inventory Engine Module Covenant (E-10)
 *
 * Ecclesial Extension
 *
 * Stock management, supplier catalogs, validation, and demand tracking.
 * Every product-based business tracks inventory. Supplier-agnostic:
 * GoCreate/Munro is one supplier adapter.
 *
 * In System 1701: Fabric catalog (422 items, 4 suppliers), on-demand portal
 * HTTP stock checks, auto-prefix validation (230+ rules), bulk CSV import,
 * 24h DB cache.
 */

import type { ModuleCovenant } from '../covenant/types';

export const INVENTORY_ENGINE_COVENANT: ModuleCovenant = {
  // ---------------------------------------------------------------------------
  // Identity
  // ---------------------------------------------------------------------------
  identity: {
    id: 'inventory-engine',
    canonicalId: 'E-10',
    version: '0.1.0',
    description:
      'Inventory management — product catalogs, stock tracking, supplier integration, validation rules. On-demand stock checks with caching. Bulk import with preview. Auto-validation against supplier rules.',
    status: 'ecclesial',
    tier: 'act',
    dedication: 'IHS',
  },

  // ---------------------------------------------------------------------------
  // Domain Model
  // ---------------------------------------------------------------------------
  domain: {
    entities: [
      {
        name: 'InventoryItem',
        description: 'A product in the catalog with code, supplier, stock status, pricing, and images',
        hasContextLayer: true,
      },
      {
        name: 'Supplier',
        description: 'Product supplier with catalog, pricing tiers, and stock check integration',
        hasContextLayer: false,
      },
      {
        name: 'ValidationRule',
        description: 'Auto-validation rule for product codes (prefix mapping, format checking)',
        hasContextLayer: false,
      },
    ],

    events: [
      {
        id: 'inventory.stock_checked',
        description: 'Stock status checked for an item (live or cached)',
        payloadShape: '{ itemId, status: "IN_STOCK" | "OUT_OF_STOCK" | "UNKNOWN", source: "live" | "cache" }',
      },
      {
        id: 'inventory.items_imported',
        description: 'Batch of items imported into catalog',
        payloadShape: '{ count, supplier, duplicatesSkipped }',
      },
      {
        id: 'inventory.stock_changed',
        description: 'Item stock status changed (was in-stock, now out)',
        payloadShape: '{ itemId, previousStatus, newStatus }',
      },
      {
        id: 'inventory.validation_failed',
        description: 'Item failed validation rules',
        payloadShape: '{ itemCode, rule, reason }',
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
      id: 'inventory.search',
      description: 'Search inventory items by code, supplier, stock status, or free text',
      type: 'query',
      risk: 'observe',
      dataSensitivity: 'internal',
      inputs: [
        { name: 'query', type: 'string', required: false, description: 'Search text (code, name, supplier)' },
        { name: 'supplier', type: 'string', required: false, description: 'Filter by supplier' },
        { name: 'stockStatus', type: 'string', required: false, description: 'Filter: IN_STOCK, OUT_OF_STOCK, UNKNOWN' },
        { name: 'page', type: 'number', required: false, description: 'Page number' },
      ],
      output: '{ items: InventoryItem[], total: number, hasMore: boolean }',
      whenToUse: 'When looking for products in the catalog.',
    },
    {
      id: 'inventory.check_stock',
      description: 'Check live stock availability for an item (uses cache when fresh, live check when stale)',
      type: 'query',
      risk: 'observe',
      dataSensitivity: 'internal',
      inputs: [
        { name: 'itemId', type: 'string', required: false, description: 'Item ID to check' },
        { name: 'itemCode', type: 'string', required: false, description: 'Item code to check (alternative to ID)' },
        { name: 'forceLive', type: 'boolean', required: false, description: 'Skip cache and check live' },
      ],
      output: '{ status: string, lastChecked: string, source: string, priceCategory?: string }',
      whenToUse: 'When you need to know if a specific item is currently available.',
    },
    {
      id: 'inventory.get_alternatives',
      description: 'Find alternative items when an item is out of stock',
      type: 'query',
      risk: 'observe',
      dataSensitivity: 'internal',
      inputs: [
        { name: 'itemId', type: 'string', required: true, description: 'Out-of-stock item' },
        { name: 'limit', type: 'number', required: false, description: 'Max alternatives (default 5)' },
      ],
      output: '{ alternatives: InventoryItem[] }',
      whenToUse: 'When an item is out of stock and the customer needs similar options.',
    },
    {
      id: 'inventory.validate',
      description: 'Validate an item code against supplier rules',
      type: 'query',
      risk: 'observe',
      dataSensitivity: 'none',
      inputs: [
        { name: 'code', type: 'string', required: true, description: 'Item code to validate' },
      ],
      output: '{ valid: boolean, supplier?: string, errors?: string[] }',
      whenToUse: 'When checking if a product code is valid before using it in an order.',
    },

    // --- Act ---
    {
      id: 'inventory.import',
      description: 'Bulk import items from CSV with preview and duplicate detection',
      type: 'action',
      risk: 'act',
      dataSensitivity: 'internal',
      inputs: [
        { name: 'data', type: 'string', required: true, description: 'CSV content' },
        { name: 'supplier', type: 'string', required: true, description: 'Supplier name' },
        { name: 'preview', type: 'boolean', required: false, description: 'Preview only (no import)' },
      ],
      output: '{ imported: number, duplicatesSkipped: number, errors: string[], preview?: object[] }',
      whenToUse: 'When new product data needs to be loaded into the catalog.',
    },
    {
      id: 'inventory.update_item',
      description: 'Update an inventory item\'s details',
      type: 'mutation',
      risk: 'act',
      dataSensitivity: 'internal',
      inputs: [
        { name: 'itemId', type: 'string', required: true, description: 'Item to update' },
        { name: 'fields', type: 'object', required: true, description: 'Fields to update' },
      ],
      output: '{ updated: boolean }',
      whenToUse: 'When item details need correction or enrichment.',
    },
    {
      id: 'inventory.sync_stock',
      description: 'Trigger a stock sync from supplier systems',
      type: 'action',
      risk: 'act',
      dataSensitivity: 'none',
      inputs: [
        { name: 'supplier', type: 'string', required: false, description: 'Specific supplier (omit for all)' },
      ],
      output: '{ synced: number, changed: number }',
      whenToUse: 'When stock data needs to be refreshed from supplier systems.',
    },

    // --- Govern ---
    {
      id: 'inventory.manage_validation_rules',
      description: 'Create or modify validation rules for product codes. Affects what codes are accepted.',
      type: 'mutation',
      risk: 'govern',
      dataSensitivity: 'none',
      inputs: [
        { name: 'action', type: 'string', required: true, description: 'create, update, or delete', allowedValues: ['create', 'update', 'delete'] },
        { name: 'ruleId', type: 'string', required: false, description: 'Rule ID (for update/delete)' },
        { name: 'config', type: 'object', required: false, description: 'Rule configuration' },
      ],
      output: '{ ruleId: string, action: string }',
      whenToUse: 'CAREFULLY. Validation rules determine what product codes are accepted across the system.',
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
      moduleId: 'search-engine',
      required: false,
      capabilities: ['search.reindex'],
    },
  ],

  // ---------------------------------------------------------------------------
  // Invariants
  // ---------------------------------------------------------------------------
  invariants: {
    alwaysTrue: [
      'Stock checks use cached data when fresh (configurable TTL), live data when stale',
      'Imports are deduplicated — same item code from same supplier is not duplicated',
      'Validation rules are applied on import and on order creation',
      'Inventory data is tenant-scoped',
      'Every stock check is logged with source (live vs cache)',
    ],
    neverHappens: [
      'An invalid product code passes validation',
      'Duplicate items are created for the same code + supplier combination',
      'Inventory data crosses tenant boundaries',
      'Stock cache is used beyond its TTL without refresh',
    ],
  },

  // ---------------------------------------------------------------------------
  // Health Check
  // ---------------------------------------------------------------------------
  healthCheck: async () => ({
    healthy: true,
    message: 'Inventory Engine health check — stub implementation',
    checkedAt: new Date(),
  }),
};
