// IHS
/**
 * Commerce Engine Module Covenant (E-02)
 *
 * Ecclesial Extension
 *
 * Orders, fulfillment, pricing. The transaction lifecycle from creation
 * through approval, vendor submission, and delivery. Vendor-agnostic:
 * GoCreate is one fulfillment adapter.
 *
 * In System 1701: Order management with creation wizard, search, auto-save
 * drafts, approval queue, GoCreate placement pipeline, status tracking.
 */

import type { ModuleCovenant } from '../covenant/types';

export const COMMERCE_ENGINE_COVENANT: ModuleCovenant = {
  // ---------------------------------------------------------------------------
  // Identity
  // ---------------------------------------------------------------------------
  identity: {
    id: 'commerce-engine',
    canonicalId: 'E-02',
    version: '0.1.0',
    description:
      'Order lifecycle management — creation, configuration, approval, vendor submission, fulfillment tracking. Multi-step wizard with auto-save drafts. Vendor-agnostic fulfillment adapters. Full-text search, infinite scroll, date range filtering.',
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
        name: 'Order',
        description: 'A customer order with status, line items, approval state, and fulfillment tracking',
        hasContextLayer: true,
      },
      {
        name: 'OrderItem',
        description: 'Line item within an order — product/service configuration, pricing, vendor-specific data',
        hasContextLayer: false,
      },
      {
        name: 'PlacementAttempt',
        description: 'Record of an attempt to submit an order to a vendor — success, failure, diagnostics',
        hasContextLayer: false,
      },
    ],

    events: [
      {
        id: 'commerce.order_created',
        description: 'New order created (as draft or submitted)',
        payloadShape: '{ orderId, clientId, itemCount, status }',
      },
      {
        id: 'commerce.order_status_changed',
        description: 'Order status transitioned',
        payloadShape: '{ orderId, fromStatus, toStatus, changedBy }',
      },
      {
        id: 'commerce.order_approved',
        description: 'Order approved for vendor submission',
        payloadShape: '{ orderId, approvedBy }',
      },
      {
        id: 'commerce.order_placed',
        description: 'Order successfully submitted to vendor',
        payloadShape: '{ orderId, vendorOrderId, vendor }',
      },
      {
        id: 'commerce.order_placement_failed',
        description: 'Vendor submission failed',
        payloadShape: '{ orderId, error, attemptNumber, willRetry: boolean }',
      },
      {
        id: 'commerce.order_duplicated',
        description: 'Existing order duplicated as new draft',
        payloadShape: '{ sourceOrderId, newOrderId }',
      },
    ],

    subscriptions: [
      'entity-registry.entity_updated', // Client changes may affect pending orders
    ],
  },

  // ---------------------------------------------------------------------------
  // Capabilities
  // ---------------------------------------------------------------------------
  capabilities: [
    // --- Observe ---
    {
      id: 'commerce.search_orders',
      description: 'Search orders by client, status, date range, product type, and full text',
      type: 'query',
      risk: 'observe',
      dataSensitivity: 'internal',
      inputs: [
        { name: 'query', type: 'string', required: false, description: 'Full-text search' },
        { name: 'status', type: 'string', required: false, description: 'Filter by status' },
        { name: 'clientId', type: 'string', required: false, description: 'Filter by client' },
        { name: 'dateFrom', type: 'string', required: false, description: 'Start date' },
        { name: 'dateTo', type: 'string', required: false, description: 'End date' },
        { name: 'page', type: 'number', required: false, description: 'Page number' },
      ],
      output: '{ orders: Order[], total: number, hasMore: boolean }',
      whenToUse: 'When looking for orders — by client, status, date, or free text search.',
    },
    {
      id: 'commerce.get_order',
      description: 'Get full order details including line items, placement history, and status timeline',
      type: 'query',
      risk: 'observe',
      dataSensitivity: 'internal',
      inputs: [
        { name: 'orderId', type: 'string', required: true, description: 'The order ID' },
      ],
      output: '{ order: Order, items: OrderItem[], placements: PlacementAttempt[], timeline: object[] }',
      whenToUse: 'When you need complete order details including configuration, vendor status, and history.',
    },
    {
      id: 'commerce.get_pending_approvals',
      description: 'List orders waiting for approval',
      type: 'query',
      risk: 'observe',
      dataSensitivity: 'internal',
      inputs: [],
      output: '{ orders: Order[], count: number }',
      whenToUse: 'When checking what orders need review before vendor submission.',
    },
    {
      id: 'commerce.get_placement_status',
      description: 'Get the current vendor placement status for an order',
      type: 'query',
      risk: 'observe',
      dataSensitivity: 'internal',
      inputs: [
        { name: 'orderId', type: 'string', required: true, description: 'The order ID' },
      ],
      output: '{ status: string, vendorOrderId?: string, lastAttempt?: PlacementAttempt }',
      whenToUse: 'When checking whether an order was successfully placed with the vendor.',
    },

    // --- Act ---
    {
      id: 'commerce.create_order',
      description: 'Create a new order as a draft',
      type: 'mutation',
      risk: 'act',
      dataSensitivity: 'internal',
      inputs: [
        { name: 'clientId', type: 'string', required: true, description: 'Client the order is for' },
        { name: 'items', type: 'object[]', required: true, description: 'Line item configurations' },
      ],
      output: '{ orderId: string, status: string }',
      whenToUse: 'When creating a new order for a client.',
    },
    {
      id: 'commerce.update_order',
      description: 'Update order details (draft or needs-review orders only)',
      type: 'mutation',
      risk: 'act',
      dataSensitivity: 'internal',
      inputs: [
        { name: 'orderId', type: 'string', required: true, description: 'The order to update' },
        { name: 'updates', type: 'object', required: true, description: 'Fields to update' },
      ],
      output: '{ updated: boolean }',
      whenToUse: 'When modifying an order that is still in draft or review state.',
      pitfalls: ['Only DRAFT and needs-review orders can be edited'],
    },
    {
      id: 'commerce.update_status',
      description: 'Change an order\'s status',
      type: 'action',
      risk: 'act',
      dataSensitivity: 'internal',
      inputs: [
        { name: 'orderId', type: 'string', required: true, description: 'The order' },
        { name: 'status', type: 'string', required: true, description: 'New status' },
        { name: 'reason', type: 'string', required: false, description: 'Reason for status change' },
      ],
      output: '{ updated: boolean, previousStatus: string }',
      whenToUse: 'When an order needs to move to a different status in the workflow.',
    },
    {
      id: 'commerce.duplicate_order',
      description: 'Duplicate an existing order as a new draft',
      type: 'mutation',
      risk: 'act',
      dataSensitivity: 'internal',
      inputs: [
        { name: 'orderId', type: 'string', required: true, description: 'Order to duplicate' },
      ],
      output: '{ newOrderId: string }',
      whenToUse: 'When a similar order needs to be created based on an existing one.',
    },
    {
      id: 'commerce.retry_placement',
      description: 'Retry vendor placement for a failed order',
      type: 'action',
      risk: 'act',
      dataSensitivity: 'internal',
      inputs: [
        { name: 'orderId', type: 'string', required: true, description: 'Order to retry placement for' },
      ],
      output: '{ retried: boolean, attemptId: string }',
      whenToUse: 'When a previous placement attempt failed and should be re-tried.',
    },

    // --- Govern ---
    {
      id: 'commerce.approve_order',
      description: 'Approve an order for vendor submission. Triggers automatic placement.',
      type: 'action',
      risk: 'govern',
      dataSensitivity: 'internal',
      inputs: [
        { name: 'orderId', type: 'string', required: true, description: 'Order to approve' },
      ],
      output: '{ approved: boolean, placementJobId: string }',
      whenToUse: 'When an order has been reviewed and should be submitted to the vendor. This triggers real-world vendor interaction.',
      pitfalls: [
        'Approval triggers vendor submission — ensure all details are correct',
        'Once placed, changes require vendor coordination',
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
      capabilities: ['entity.get'],
    },
    {
      moduleId: 'auth-engine',
      required: true,
      capabilities: ['auth.get_session'],
    },
    {
      moduleId: 'workflow-engine',
      required: false,
      capabilities: ['workflow.transition', 'workflow.approve'],
    },
    {
      moduleId: 'audit-ledger',
      required: true,
      capabilities: ['audit.record'],
    },
    {
      moduleId: 'job-engine',
      required: true,
      capabilities: ['job.dispatch'],
    },
  ],

  // ---------------------------------------------------------------------------
  // Invariants
  // ---------------------------------------------------------------------------
  invariants: {
    alwaysTrue: [
      'Every order status change is recorded with actor, timestamp, and reason',
      'Vendor submission requires prior approval (manual review gate)',
      'Failed placement attempts are recorded with full diagnostics',
      'Order data is tenant-scoped — never leaks across organizations',
      'Draft orders auto-save periodically',
    ],
    neverHappens: [
      'An order is placed with a vendor without prior approval',
      'A placement attempt is silently lost — all attempts are recorded',
      'Order data crosses tenant boundaries',
      'A completed/delivered order is modified without creating a new version',
    ],
  },

  // ---------------------------------------------------------------------------
  // Health Check
  // ---------------------------------------------------------------------------
  healthCheck: async () => ({
    healthy: true,
    message: 'Commerce Engine health check — stub implementation',
    checkedAt: new Date(),
  }),
};
