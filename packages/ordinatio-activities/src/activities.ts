// ===========================================
// ORDINATIO ACTIVITIES — Core Service
// ===========================================
// Business logic for activity logging and
// retrieval. Handles sticky item resolution
// automatically.
// ===========================================

import { ACTIVITY_CONFIG } from './activity-display-config';
import { getActionsToResolve } from './activity-resolution';
import type { ActivityAction } from './activity-actions';
import type {
  ActivityDb,
  ActivityCallbacks,
  ActivityWithRelations,
  CreateActivityInput,
  GetActivitiesOptions,
  GetActivitiesResult,
  ACTIVITY_INCLUDE,
} from './types';

/** Admin-only activity actions (filtered when admin feed is disabled). */
const ADMIN_ACTIVITY_ACTIONS = [
  'email.account_connected',
  'email.account_disconnected',
  'email.sync_completed',
  'email.sync_failed',
  'email.archived',
  'email.replied',
  'email.task_created',
  'email.linked_to_client',
];

/** The include spec for activity queries. */
const activityInclude = {
  user: { select: { id: true, name: true } },
  order: { select: { id: true, orderNumber: true } },
  client: { select: { id: true, name: true } },
} satisfies typeof ACTIVITY_INCLUDE;

/** Options for activity creation. */
export interface CreateActivityOptions {
  /** Skip action validation against ACTIVITY_CONFIG (for custom actions). */
  allowUnknownActions?: boolean;
}

/** Default display config for unknown/custom actions. */
const DEFAULT_ACTION_CONFIG = {
  severity: 'INFO' as const,
  requiresResolution: false,
};

/**
 * Create an activity and auto-resolve related sticky items.
 */
export async function createActivity(
  db: ActivityDb,
  input: CreateActivityInput,
  callbacks?: ActivityCallbacks,
  options?: CreateActivityOptions,
): Promise<ActivityWithRelations> {
  const config = ACTIVITY_CONFIG[input.action as ActivityAction];
  if (!config && !options?.allowUnknownActions) {
    throw new Error(`Unknown activity action: ${input.action}`);
  }
  const effectiveConfig = config ?? DEFAULT_ACTION_CONFIG;

  const actionsToResolve = getActionsToResolve(input.action);

  const activity = await db.$transaction(async (tx) => {
    // 1. Resolve related sticky activities (if any)
    if (actionsToResolve.length > 0) {
      const resolveWhere: Record<string, unknown> = {
        action: { in: actionsToResolve },
        requiresResolution: true,
        resolvedAt: null,
      };

      if (input.orderId) resolveWhere.orderId = input.orderId;
      if (input.placementAttemptId) resolveWhere.placementAttemptId = input.placementAttemptId;

      await tx.activityLog.updateMany({
        where: resolveWhere,
        data: {
          resolvedAt: new Date(),
          resolvedBy: input.userId ?? 'system',
        },
      });
    }

    // 2. Create the new activity
    return tx.activityLog.create({
      data: {
        action: input.action,
        description: input.description,
        severity: effectiveConfig.severity,
        requiresResolution: effectiveConfig.requiresResolution,
        system: input.system ?? false,
        userId: input.userId,
        orderId: input.orderId,
        clientId: input.clientId,
        placementAttemptId: input.placementAttemptId,
        metadata: input.metadata ?? undefined,
      },
      include: activityInclude,
    });
  });

  await callbacks?.onActivityCreated?.(activity);
  return activity;
}

/**
 * Get activities with sticky items separated from recent activities.
 */
export async function getActivitiesWithSticky(
  db: ActivityDb,
  options: GetActivitiesOptions = {},
): Promise<GetActivitiesResult> {
  const { limit = 20, offset = 0, orderId, clientId, excludeAdminActivities } = options;

  const baseWhere: Record<string, unknown> = {};
  if (orderId) baseWhere.orderId = orderId;
  if (clientId) baseWhere.clientId = clientId;
  if (excludeAdminActivities) {
    baseWhere.action = { notIn: ADMIN_ACTIVITY_ACTIONS };
  }

  const [stickyItems, stickyCount] = await Promise.all([
    db.activityLog.findMany({
      where: {
        ...baseWhere,
        requiresResolution: true,
        resolvedAt: null,
      },
      include: activityInclude,
      orderBy: [
        { severity: 'asc' },
        { createdAt: 'desc' },
      ],
    }),
    db.activityLog.count({
      where: {
        ...baseWhere,
        requiresResolution: true,
        resolvedAt: null,
      },
    }),
  ]);

  const [recentActivities, totalRecent] = await Promise.all([
    db.activityLog.findMany({
      where: {
        ...baseWhere,
        OR: [
          { requiresResolution: false },
          { resolvedAt: { not: null } },
        ],
      },
      include: activityInclude,
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: offset,
    }),
    db.activityLog.count({
      where: {
        ...baseWhere,
        OR: [
          { requiresResolution: false },
          { resolvedAt: { not: null } },
        ],
      },
    }),
  ]);

  return {
    stickyItems: stickyItems as ActivityWithRelations[],
    recentActivities: recentActivities as ActivityWithRelations[],
    totalRecent,
    stickyCount,
  };
}

/**
 * Manually resolve a sticky activity.
 */
export async function resolveActivity(
  db: ActivityDb,
  activityId: string,
  resolvedBy: string,
  callbacks?: ActivityCallbacks,
): Promise<ActivityWithRelations> {
  const activity = await db.activityLog.update({
    where: { id: activityId },
    data: {
      resolvedAt: new Date(),
      resolvedBy,
    },
    include: activityInclude,
  });

  await callbacks?.onActivityResolved?.(activity);
  return activity;
}

/**
 * Get recent activities for a specific order.
 */
export async function getOrderActivities(
  db: ActivityDb,
  orderId: string,
  limit = 10,
): Promise<ActivityWithRelations[]> {
  return db.activityLog.findMany({
    where: { orderId },
    include: activityInclude,
    orderBy: { createdAt: 'desc' },
    take: limit,
  });
}

/**
 * Get recent activities for a specific client.
 */
export async function getClientActivities(
  db: ActivityDb,
  clientId: string,
  limit = 10,
): Promise<ActivityWithRelations[]> {
  return db.activityLog.findMany({
    where: { clientId },
    include: activityInclude,
    orderBy: { createdAt: 'desc' },
    take: limit,
  });
}
