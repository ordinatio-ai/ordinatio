// ===========================================
// ORDINATIO ACTIVITIES — Error Registry
// ===========================================
// Error codes for activity logging, retrieval,
// sticky item resolution, and filtering.
// Rule 8 compliance: code + ref + runtime context.
// ===========================================

/**
 * Enhanced error builder v2 — full diagnostic object.
 * Machines read this and know: what broke, when, where in the code,
 * how bad it is, whether to retry, how to fix it, and the runtime
 * data from the moment it happened.
 */
export function activityError(code: string, context?: Record<string, unknown>): {
  code: string;
  ref: string;
  timestamp: string;
  module: string;
  description: string;
  severity: string;
  recoverable: boolean;
  diagnosis: Array<string | { step: string; check: string }>;
  context: Record<string, unknown>;
} {
  const def = ACTIVITY_ERRORS[code];
  const ts = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, '');

  if (!def) {
    return {
      code,
      ref: `${code}-${ts}`,
      timestamp: new Date().toISOString(),
      module: 'ACTIVITY',
      description: `Unknown error code: ${code}`,
      severity: 'error',
      recoverable: false,
      diagnosis: [],
      context: context || {},
    };
  }

  return {
    code: def.code,
    ref: `${def.code}-${ts}`,
    timestamp: new Date().toISOString(),
    module: 'ACTIVITY',
    description: def.description,
    severity: def.severity,
    recoverable: def.recoverable,
    diagnosis: [...def.diagnosis],
    context: context || {},
  };
}

export const ACTIVITY_ERRORS = {
  // ===========================
  // 100-104: Create / List
  // ===========================
  ACTIVITY_100: {
    code: 'ACTIVITY_100',
    file: 'api/activities/route.ts',
    function: 'GET',
    httpStatus: 401,
    severity: 'warn' as const,
    recoverable: true,
    description: 'Unauthenticated request to activities endpoint.',
    diagnosis: [
      'User session expired or missing',
      'Check that better-auth session cookie is present',
      'Verify getSession() returns a valid user',
    ],
  },
  ACTIVITY_101: {
    code: 'ACTIVITY_101',
    file: 'api/activities/route.ts',
    function: 'GET',
    httpStatus: 400,
    severity: 'warn' as const,
    recoverable: true,
    description: 'Activity query parameter validation failed.',
    diagnosis: [
      'Check limit, offset, orderId, or clientId query params',
      'Limit must be 1-100, offset must be >= 0',
      'Verify ListActivitiesQuerySchema constraints in validation/',
    ],
  },
  ACTIVITY_102: {
    code: 'ACTIVITY_102',
    file: 'activities.ts',
    function: 'createActivity',
    httpStatus: 500,
    severity: 'error' as const,
    recoverable: true,
    description: 'Failed to create activity log entry.',
    diagnosis: [
      'Database error during activity creation or sticky resolution transaction',
      'Check DATABASE_URL connectivity',
      'Verify the action string matches a key in ACTIVITY_CONFIG',
      'Check Prisma logs for constraint violations (e.g., missing userId FK)',
    ],
  },
  ACTIVITY_103: {
    code: 'ACTIVITY_103',
    file: 'activities.ts',
    function: 'createActivity',
    httpStatus: 400,
    severity: 'warn' as const,
    recoverable: false,
    description: 'Unknown activity action type provided.',
    diagnosis: [
      'The action string does not exist in ACTIVITY_CONFIG',
      'Check activity-display-config.ts for valid action keys',
      'New actions must be added to ACTIVITY_CONFIG before use',
    ],
  },
  ACTIVITY_104: {
    code: 'ACTIVITY_104',
    file: 'api/activities/route.ts',
    function: 'GET',
    httpStatus: 500,
    severity: 'error' as const,
    recoverable: true,
    description: 'Failed to fetch activities from database.',
    diagnosis: [
      'Database query error in getActivitiesWithSticky()',
      'Check DATABASE_URL connectivity',
      'Check if admin_feed_enabled setting is readable',
      'Verify ActivityLog table exists and has correct schema',
    ],
  },

  // ===========================
  // 200-204: Resolve / Sticky
  // ===========================
  ACTIVITY_200: {
    code: 'ACTIVITY_200',
    file: 'activities.ts',
    function: 'resolveActivity',
    httpStatus: 404,
    severity: 'warn' as const,
    recoverable: false,
    description: 'Activity not found for resolution.',
    diagnosis: [
      'The activity ID does not exist in the ActivityLog table',
      'Activity may have already been deleted',
      'Verify the activityId parameter in the request',
    ],
  },
  ACTIVITY_201: {
    code: 'ACTIVITY_201',
    file: 'activities.ts',
    function: 'resolveActivity',
    httpStatus: 500,
    severity: 'error' as const,
    recoverable: true,
    description: 'Failed to resolve sticky activity.',
    diagnosis: [
      'Database error during update of resolvedAt/resolvedBy fields',
      'Check DATABASE_URL connectivity',
      'Verify the activity is actually a sticky item (requiresResolution: true)',
    ],
  },
  ACTIVITY_202: {
    code: 'ACTIVITY_202',
    file: 'activities.ts',
    function: 'createActivity',
    httpStatus: 500,
    severity: 'error' as const,
    recoverable: true,
    description: 'Failed to auto-resolve related sticky activities in transaction.',
    diagnosis: [
      'Database error during updateMany for resolving related sticky items',
      'Check the actionsToResolve mapping in activity-resolution.ts',
      'Transaction may have rolled back — neither activity created nor items resolved',
    ],
  },
  ACTIVITY_203: {
    code: 'ACTIVITY_203',
    file: 'activities.ts',
    function: 'getActivitiesWithSticky',
    httpStatus: 500,
    severity: 'error' as const,
    recoverable: true,
    description: 'Failed to query sticky (unresolved) activities.',
    diagnosis: [
      'Database error fetching activities where requiresResolution=true and resolvedAt=null',
      'Check DATABASE_URL connectivity',
      'Verify ActivityLog table indexes are present',
    ],
  },
  ACTIVITY_204: {
    code: 'ACTIVITY_204',
    file: 'activities.ts',
    function: 'getActivitiesWithSticky',
    httpStatus: 500,
    severity: 'warn' as const,
    recoverable: true,
    description: 'Sticky count mismatch — count query returned different total than items.',
    diagnosis: [
      'Race condition between findMany and count queries',
      'Not critical — UI may show a slightly stale count',
      'Refresh will resolve; no action needed unless persistent',
    ],
  },

  // ===========================
  // 300-302: Filter / Pagination
  // ===========================
  ACTIVITY_300: {
    code: 'ACTIVITY_300',
    file: 'api/activities/route.ts',
    function: 'GET',
    httpStatus: 400,
    severity: 'warn' as const,
    recoverable: true,
    description: 'Invalid filter parameters for activity query.',
    diagnosis: [
      'orderId or clientId provided but not a valid UUID',
      'Check query parameter format',
      'Verify the referenced order or client actually exists',
    ],
  },
  ACTIVITY_301: {
    code: 'ACTIVITY_301',
    file: 'activities.ts',
    function: 'getOrderActivities',
    httpStatus: 500,
    severity: 'error' as const,
    recoverable: true,
    description: 'Failed to fetch activities for a specific order.',
    diagnosis: [
      'Database error querying activities filtered by orderId',
      'Check DATABASE_URL connectivity',
      'Verify the orderId exists in the Order table',
    ],
  },
  ACTIVITY_302: {
    code: 'ACTIVITY_302',
    file: 'activities.ts',
    function: 'getClientActivities',
    httpStatus: 500,
    severity: 'error' as const,
    recoverable: true,
    description: 'Failed to fetch activities for a specific client.',
    diagnosis: [
      'Database error querying activities filtered by clientId',
      'Check DATABASE_URL connectivity',
      'Verify the clientId exists in the Client table',
    ],
  },
} as const;
