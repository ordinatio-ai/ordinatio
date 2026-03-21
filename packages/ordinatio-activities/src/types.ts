// ===========================================
// ORDINATIO ACTIVITIES — Types
// ===========================================
// Shared types for the activities module.
// Uses a minimal DB interface to avoid
// coupling to a specific Prisma client.
// ===========================================

// ---- Severity ----

/**
 * Activity severity levels.
 * SECURITY is a special severity used exclusively for security events.
 */
export type Severity = 'INFO' | 'WARNING' | 'ERROR' | 'CRITICAL' | 'SECURITY';

/** Severity sort order (most severe first). */
export const SEVERITY_ORDER: Record<Severity, number> = {
  CRITICAL: 0,
  SECURITY: 1,
  ERROR: 2,
  WARNING: 3,
  INFO: 4,
};

// ---- Display Config ----

/** Display configuration for a single activity action. */
export interface ActivityDisplayConfig {
  label: string;
  severity: Severity;
  icon: string;      // Lucide icon name
  colorClass: string; // Tailwind color class
  requiresResolution: boolean;
}

// ---- Input / Output ----

/** Input for creating an activity. */
export interface CreateActivityInput {
  action: string;
  description: string;
  userId?: string | null;
  orderId?: string | null;
  clientId?: string | null;
  placementAttemptId?: string | null;
  metadata?: unknown;
  system?: boolean;
}

/** Activity record with relations (returned from queries). */
export interface ActivityWithRelations {
  id: string;
  action: string;
  description: string;
  severity: string;
  requiresResolution: boolean;
  resolvedAt: Date | null;
  resolvedBy: string | null;
  system: boolean;
  metadata: unknown;
  createdAt: Date;
  orderId: string | null;
  clientId: string | null;
  placementAttemptId: string | null;
  user: { id: string; name: string } | null;
  order: { id: string; orderNumber: string } | null;
  client: { id: string; name: string } | null;
}

/** Query options for listing activities. */
export interface GetActivitiesOptions {
  limit?: number;
  offset?: number;
  orderId?: string | null;
  clientId?: string | null;
  excludeAdminActivities?: boolean;
}

/** Result of getActivitiesWithSticky. */
export interface GetActivitiesResult {
  stickyItems: ActivityWithRelations[];
  recentActivities: ActivityWithRelations[];
  totalRecent: number;
  stickyCount: number;
}

// ---- DB Interface ----

/** Include spec for activity queries (relations to load). */
export const ACTIVITY_INCLUDE = {
  user: { select: { id: true, name: true } },
  order: { select: { id: true, orderNumber: true } },
  client: { select: { id: true, name: true } },
} as const;

/**
 * Minimal database interface for activity operations.
 * Accepts any Prisma client that has an `activityLog` model.
 */
export interface ActivityDb {
  activityLog: {
    create(args: {
      data: {
        action: string;
        description: string;
        severity: string;
        requiresResolution: boolean;
        system: boolean;
        userId?: string | null;
        orderId?: string | null;
        clientId?: string | null;
        placementAttemptId?: string | null;
        metadata?: unknown;
      };
      include: typeof ACTIVITY_INCLUDE;
    }): Promise<ActivityWithRelations>;

    update(args: {
      where: { id: string };
      data: { resolvedAt: Date; resolvedBy: string };
      include: typeof ACTIVITY_INCLUDE;
    }): Promise<ActivityWithRelations>;

    updateMany(args: {
      where: Record<string, unknown>;
      data: { resolvedAt: Date; resolvedBy: string };
    }): Promise<unknown>;

    findMany(args: {
      where?: Record<string, unknown>;
      include?: typeof ACTIVITY_INCLUDE;
      orderBy?: Record<string, string> | Array<Record<string, string>>;
      take?: number;
      skip?: number;
    }): Promise<ActivityWithRelations[]>;

    count(args: { where?: Record<string, unknown> }): Promise<number>;
  };

  $transaction<T>(fn: (tx: ActivityDb) => Promise<T>): Promise<T>;
}

// ---- Callbacks ----

/** Optional callbacks for activity mutations. */
export interface ActivityCallbacks {
  onActivityCreated?: (activity: ActivityWithRelations) => Promise<void>;
  onActivityResolved?: (activity: ActivityWithRelations) => Promise<void>;
}
