// ===========================================
// ORDER ACTIONS
// ===========================================
// Handlers for order-related automation actions.
// Uses dependency injection for SaaS extraction readiness.
// ===========================================
// DEPENDS ON: registry, default-deps
// USED BY: action-executor, automation tests
// ===========================================

import { ORDER_STATUS_VALUES, type OrderStatus } from '../db-types';
import {
  registerAction,
  completedResult,
  failedResult,
  type ActionResult,
  type ExecutionContext,
} from './registry';
import type { ActionDependencies } from './types';
import { getDependencies } from './default-deps';

// Valid order status values from schema
const VALID_ORDER_STATUSES = ORDER_STATUS_VALUES;

// ===========================================
// UPDATE_ORDER_STATUS
// ===========================================
// Config options:
//   - orderId (optional): Order ID, falls back to context.data.orderId
//   - status (required): New order status (must be a valid OrderStatus)
// ===========================================

export async function executeUpdateOrderStatus(
  actionId: string,
  config: Record<string, unknown>,
  context: ExecutionContext,
  customDeps?: ActionDependencies
): Promise<ActionResult> {
  const deps = getDependencies(customDeps);

  const orderId = (config.orderId ?? context.data.orderId) as string;
  const status = config.status as string;

  if (!orderId) {
    return failedResult(actionId, 'UPDATE_ORDER_STATUS', 'No orderId provided');
  }

  if (!status) {
    return failedResult(actionId, 'UPDATE_ORDER_STATUS', 'No status provided');
  }

  if (!VALID_ORDER_STATUSES.includes(status as OrderStatus)) {
    return failedResult(
      actionId,
      'UPDATE_ORDER_STATUS',
      `Invalid status: ${status}. Valid statuses: ${VALID_ORDER_STATUSES.join(', ')}`
    );
  }

  const order = await deps.orderService.findOrderById(orderId);

  if (!order) {
    return failedResult(actionId, 'UPDATE_ORDER_STATUS', `Order not found: ${orderId}`);
  }

  const previousStatus = order.status;

  await deps.orderService.updateOrderStatus(orderId, status);

  return completedResult(actionId, 'UPDATE_ORDER_STATUS', {
    orderId,
    orderNumber: order.orderNumber,
    previousStatus,
    newStatus: status,
  });
}

// ===========================================
// REGISTER ALL ORDER ACTIONS
// ===========================================

export function registerOrderActions(): void {
  // Wrap the exported function to match the registry signature
  registerAction('UPDATE_ORDER_STATUS', (actionId, config, context) =>
    executeUpdateOrderStatus(actionId, config, context)
  );
}
