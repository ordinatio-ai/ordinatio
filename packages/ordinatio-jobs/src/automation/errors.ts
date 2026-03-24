// ===========================================
// ORDINATIO AUTOMATION — Error Registry
// ===========================================
// Enhanced v2 error builder + merged error codes.
// AUTO_100-316 (core) + AUTO_400-507 (actions).
// Rule 8: code + ref + timestamp + module +
// description + severity + recoverable +
// diagnosis[] + context{}.
// ===========================================

/**
 * Enhanced error builder v2 — full diagnostic object.
 * Machines read this and know: what broke, when, where in the code,
 * how bad it is, whether to retry, how to fix it, and the runtime
 * data from the moment it happened.
 */
export function autoError(code: string, context?: Record<string, unknown>): {
  code: string;
  ref: string;
  timestamp: string;
  module: string;
  description: string;
  severity: string;
  recoverable: boolean;
  diagnosis: string[];
  context: Record<string, unknown>;
} {
  const def = AUTO_ERRORS[code as keyof typeof AUTO_ERRORS];
  const ts = generateTimestamp();

  if (!def) {
    return createUnknownError(code, ts, context);
  }

  return createError(def, ts, context);
}

// Helper to generate a timestamp
function generateTimestamp(): string {
  return new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, '');
}

// Helper to create an unknown error
function createUnknownError(code: string, ts: string, context?: Record<string, unknown>): {
  code: string;
  ref: string;
  timestamp: string;
  module: string;
  description: string;
  severity: string;
  recoverable: boolean;
  diagnosis: string[];
  context: Record<string, unknown>;
} {
  return {
    code,
    ref: `${code}-${ts}`,
    timestamp: new Date().toISOString(),
    module: 'AUTOMATION',
    description: `Unknown error code: ${code}`,
    severity: 'error',
    recoverable: false,
    diagnosis: [],
    context: context || {},
  };
}

// Helper to create a known error
function createError(def: any, ts: string, context?: Record<string, unknown>): {
  code: string;
  ref: string;
  timestamp: string;
  module: string;
  description: string;
  severity: string;
  recoverable: boolean;
  diagnosis: string[];
  context: Record<string, unknown>;
} {
  return {
    code: def.code,
    ref: `${def.code}-${ts}`,
    timestamp: new Date().toISOString(),
    module: 'AUTOMATION',
    description: def.description,
    severity: def.severity,
    recoverable: def.recoverable,
    diagnosis: [...def.diagnosis],
    context: context || {},
  };
}

// ===========================================
// NOT FOUND ERRORS
// ===========================================

export class NotFoundError extends Error {
  constructor(entity: string, id: string) {
    super(`${entity} not found: ${id}`);
    this.name = 'NotFoundError';
  }
}

export class AutomationNotFoundError extends NotFoundError {
  constructor(id: string) {
    super('Automation', id);
    this.name = 'AutomationNotFoundError';
  }
}

export class ExecutionNotFoundError extends NotFoundError {
  constructor(id: string) {
    super('Execution', id);
    this.name = 'ExecutionNotFoundError';
  }
}

// ===========================================
// ERROR REGISTRY — Core (AUTO_100-316)
// ===========================================

// Automation Error Registry — Core (CRUD, Triggers, Testing & Health)
// DEPENDS ON: nothing (standalone data)
// USED BY: errors.ts (barrel)

export const AUTO_ERRORS_CORE = {
  // =====================
  // AUTO_100-106: CRUD
  // =====================
  AUTO_100: {
    code: 'AUTO_100',
    file: 'api/automations/route.ts',
    function: 'GET|POST',
    httpStatus: 401,
    severity: 'warn' as const,
    recoverable: false,
    description: 'Unauthenticated request to automations endpoint.',
    diagnosis: [
      'User session expired or missing',
      'Check that better-auth session cookie is present',
      'Verify getSession() returns a valid user',
    ],
  },
  AUTO_101: {
    code: 'AUTO_101',
    file: 'api/automations/route.ts',
    function: 'POST',
    httpStatus: 400,
    severity: 'warn' as const,
    recoverable: true,
    description: 'Automation validation failed -- Zod schema rejected the request body.',
    diagnosis: [
      'Check CreateAutomationSchema or UpdateAutomationSchema for required fields',
      'Review Zod validation details in response body',
      'Common: missing name, invalid trigger eventType, malformed conditions array',
    ],
  },
  AUTO_102: {
    code: 'AUTO_102',
    file: 'api/automations/route.ts',
    function: 'POST',
    httpStatus: 500,
    severity: 'error' as const,
    recoverable: true,
    description: 'Failed to create automation.',
    diagnosis: [
      'Check database connectivity (DATABASE_URL)',
      'Check for unique constraint violation (duplicate automation name)',
      'Verify Prisma schema matches expected Automation model',
    ],
  },
  AUTO_103: {
    code: 'AUTO_103',
    file: 'api/automations/[id]/route.ts',
    function: 'GET|PATCH|DELETE',
    httpStatus: 404,
    severity: 'warn' as const,
    recoverable: false,
    description: 'Automation not found.',
    diagnosis: [
      'Verify the automation ID exists in the database',
      'May have been deleted by another user or process',
      'Check for stale references in the UI (refresh the page)',
    ],
  },
  AUTO_104: {
    code: 'AUTO_104',
    file: 'api/automations/[id]/route.ts',
    function: 'PATCH',
    httpStatus: 500,
    severity: 'error' as const,
    recoverable: true,
    description: 'Failed to update automation.',
    diagnosis: [
      'Check database connectivity',
      'Transaction may have failed (trigger/condition/action replacement is atomic)',
      'Verify the update payload matches UpdateAutomationSchema',
    ],
  },
  AUTO_105: {
    code: 'AUTO_105',
    file: 'api/automations/[id]/route.ts',
    function: 'DELETE',
    httpStatus: 500,
    severity: 'error' as const,
    recoverable: true,
    description: 'Failed to delete automation.',
    diagnosis: [
      'Check database connectivity',
      'Cascade delete may have failed on related records (triggers, conditions, actions, executions)',
      'Check for foreign key constraints',
    ],
  },
  AUTO_106: {
    code: 'AUTO_106',
    file: 'api/automations/[id]/toggle/route.ts',
    function: 'POST',
    httpStatus: 500,
    severity: 'error' as const,
    recoverable: true,
    description: 'Failed to toggle automation enabled/disabled.',
    diagnosis: [
      'Check database connectivity',
      'Verify automation ID exists',
      'Check server logs for Prisma update error details',
    ],
  },

  // =====================
  // AUTO_200-204: Triggers & execution
  // =====================
  AUTO_200: {
    code: 'AUTO_200',
    file: 'services/automation/trigger-registry.ts',
    function: 'emit',
    httpStatus: 400,
    severity: 'error' as const,
    recoverable: false,
    description: 'Unknown trigger type in automation definition.',
    diagnosis: [
      'Check TriggerEventType enum in Prisma schema for valid values',
      'Automation may reference a trigger type that was removed or renamed',
      'Verify automation.trigger.eventType matches a registered handler',
    ],
  },
  AUTO_201: {
    code: 'AUTO_201',
    file: 'services/automation/trigger-registry.ts',
    function: 'emit',
    httpStatus: 500,
    severity: 'error' as const,
    recoverable: true,
    description: 'Trigger registration failed.',
    diagnosis: [
      'Database query for automations by trigger event may have failed',
      'Check getAutomationsByTriggerEvent() for Prisma errors',
      'Verify DATABASE_URL is accessible',
    ],
  },
  AUTO_202: {
    code: 'AUTO_202',
    file: 'services/automation/trigger-registry.ts',
    function: 'emit',
    httpStatus: 500,
    severity: 'error' as const,
    recoverable: true,
    description: 'Failed to evaluate automation conditions.',
    diagnosis: [
      'Condition field may reference a missing property in trigger data',
      'Check comparator is valid (equals, contains, greater_than, etc.)',
      'Review condition valueType vs actual data type',
    ],
  },
  AUTO_203: {
    code: 'AUTO_203',
    file: 'services/automation/trigger-registry.ts',
    function: 'emit',
    httpStatus: null,
    severity: 'info' as const,
    recoverable: true,
    description: 'No active automations matched the trigger.',
    diagnosis: [
      'This is informational, not an error',
      'No automations are configured for this trigger event type',
      'Or all matching automations are disabled (isActive=false)',
    ],
  },
  AUTO_204: {
    code: 'AUTO_204',
    file: 'services/automation/trigger-registry.ts',
    function: 'emit',
    httpStatus: null,
    severity: 'info' as const,
    recoverable: true,
    description: 'Trigger fired but all conditions evaluated to false.',
    diagnosis: [
      'This is informational, not an error',
      'Automations matched the trigger type but condition checks did not pass',
      'Review automation conditions for expected field values',
    ],
  },

  // =====================
  // AUTO_300-304: Testing & health
  // =====================
  AUTO_300: {
    code: 'AUTO_300',
    file: 'api/automations/[id]/test/route.ts',
    function: 'POST',
    httpStatus: 401,
    severity: 'warn' as const,
    recoverable: false,
    description: 'Unauthenticated request to test endpoint.',
    diagnosis: [
      'User session expired or missing',
      'Check that better-auth session cookie is present',
      'Verify getSession() returns a valid user',
    ],
  },
  AUTO_301: {
    code: 'AUTO_301',
    file: 'api/automations/[id]/test/route.ts',
    function: 'POST',
    httpStatus: 500,
    severity: 'error' as const,
    recoverable: true,
    description: 'Test execution failed.',
    diagnosis: [
      'Check if the automation exists (may be AUTO_103)',
      'Condition evaluation or action execution may have thrown',
      'Review triggerData format matches expected schema',
      'If dry run, only conditions are evaluated; if live, actions also execute',
    ],
  },
  AUTO_302: {
    code: 'AUTO_302',
    file: 'api/automations/[id]/executions/route.ts',
    function: 'GET',
    httpStatus: 500,
    severity: 'error' as const,
    recoverable: true,
    description: 'Failed to fetch execution history.',
    diagnosis: [
      'Check database connectivity',
      'Verify the automation ID exists',
      'Check Prisma query for AutomationExecution table',
    ],
  },
  AUTO_303: {
    code: 'AUTO_303',
    file: 'api/automations/health/route.ts',
    function: 'GET',
    httpStatus: 500,
    severity: 'error' as const,
    recoverable: true,
    description: 'Health check failed.',
    diagnosis: [
      'One or more health check subsystems threw an unhandled error',
      'Check database connectivity, state store, queue health',
      'Review server logs for the specific subsystem that failed',
    ],
  },
  AUTO_304: {
    code: 'AUTO_304',
    file: 'api/automations/health/route.ts',
    function: 'GET',
    httpStatus: 200,
    severity: 'warn' as const,
    recoverable: true,
    description: 'Health check -- one or more subsystems degraded.',
    diagnosis: [
      'State store may be unhealthy (memory or Redis)',
      'System may be in shutdown state',
      'Dead letter queue count exceeds threshold (>10)',
      'Queue subsystem may be unreachable (if in queue mode)',
    ],
  },

  // =====================
  // AUTO_305-315: Route-level catch blocks (enterprise hardening)
  // =====================
  AUTO_305: {
    code: 'AUTO_305',
    file: 'api/automations/route.ts',
    function: 'GET',
    httpStatus: 500,
    severity: 'error' as const,
    recoverable: true,
    description: 'Failed to list automations.',
    diagnosis: ['Check database connectivity', 'Verify query parameters are valid'],
  },
  AUTO_306: {
    code: 'AUTO_306',
    file: 'api/automations/route.ts',
    function: 'POST',
    httpStatus: 500,
    severity: 'error' as const,
    recoverable: false,
    description: 'Failed to create automation.',
    diagnosis: ['Check database connectivity', 'Verify request body matches CreateAutomationSchema'],
  },
  AUTO_307: {
    code: 'AUTO_307',
    file: 'api/automations/[id]/route.ts',
    function: 'GET',
    httpStatus: 500,
    severity: 'error' as const,
    recoverable: true,
    description: 'Failed to fetch automation.',
    diagnosis: ['Check database connectivity', 'Verify automation ID exists'],
  },
  AUTO_308: {
    code: 'AUTO_308',
    file: 'api/automations/[id]/route.ts',
    function: 'PATCH',
    httpStatus: 500,
    severity: 'error' as const,
    recoverable: false,
    description: 'Failed to update automation.',
    diagnosis: ['Check database connectivity', 'Verify automation ID exists and request body is valid'],
  },
  AUTO_309: {
    code: 'AUTO_309',
    file: 'api/automations/[id]/route.ts',
    function: 'DELETE',
    httpStatus: 500,
    severity: 'error' as const,
    recoverable: false,
    description: 'Failed to delete automation.',
    diagnosis: ['Check database connectivity', 'Verify automation ID exists'],
  },
  AUTO_310: {
    code: 'AUTO_310',
    file: 'api/automations/[id]/toggle/route.ts',
    function: 'POST',
    httpStatus: 500,
    severity: 'error' as const,
    recoverable: true,
    description: 'Failed to toggle automation active state.',
    diagnosis: ['Check database connectivity', 'Verify automation ID exists'],
  },
  AUTO_311: {
    code: 'AUTO_311',
    file: 'api/automations/[id]/executions/route.ts',
    function: 'GET',
    httpStatus: 500,
    severity: 'error' as const,
    recoverable: true,
    description: 'Failed to list automation executions.',
    diagnosis: ['Check database connectivity', 'Verify automation ID exists'],
  },
  AUTO_312: {
    code: 'AUTO_312',
    file: 'api/triggers/[id]/route.ts',
    function: 'GET',
    httpStatus: 500,
    severity: 'error' as const,
    recoverable: true,
    description: 'Failed to fetch trigger.',
    diagnosis: ['Check database connectivity', 'Verify trigger ID exists'],
  },
  AUTO_313: {
    code: 'AUTO_313',
    file: 'api/triggers/[id]/route.ts',
    function: 'PATCH',
    httpStatus: 500,
    severity: 'error' as const,
    recoverable: false,
    description: 'Failed to update trigger.',
    diagnosis: ['Check database connectivity', 'Verify trigger ID exists'],
  },
  AUTO_314: {
    code: 'AUTO_314',
    file: 'api/triggers/[id]/route.ts',
    function: 'DELETE',
    httpStatus: 500,
    severity: 'error' as const,
    recoverable: false,
    description: 'Failed to delete trigger.',
    diagnosis: ['Check database connectivity', 'Verify trigger ID exists'],
  },
  AUTO_315: {
    code: 'AUTO_315',
    file: 'api/triggers/route.ts',
    function: 'GET',
    httpStatus: 500,
    severity: 'error' as const,
    recoverable: true,
    description: 'Failed to list triggers.',
    diagnosis: ['Check database connectivity', 'Verify ColumnTrigger table exists'],
  },
  AUTO_316: {
    code: 'AUTO_316',
    file: 'api/triggers/route.ts',
    function: 'POST',
    httpStatus: 500,
    severity: 'error' as const,
    recoverable: false,
    description: 'Failed to create trigger.',
    diagnosis: ['Check database connectivity', 'Verify request body matches CreateTriggerSchema'],
  },
} as const;

// ============================================
// ERROR REGISTRY — Actions (AUTO_400-507)
// ============================================

// Automation Error Registry — Actions & Resilience
// DEPENDS ON: nothing (standalone data)
// USED BY: errors.ts (barrel)

export const AUTO_ERRORS_ACTIONS = {
  // =====================
  // AUTO_400-412: Action execution
  // =====================
  AUTO_400: {
    code: 'AUTO_400',
    file: 'services/automation/action-executor.ts',
    function: 'executeActions',
    httpStatus: 500,
    severity: 'error' as const,
    recoverable: true,
    description: 'Action execution failed (generic).',
    diagnosis: [
      'Check the specific action type and its configuration',
      'Review action executor logs for the root cause',
      'If continueOnError=false, subsequent actions were skipped',
    ],
  },
  AUTO_401: {
    code: 'AUTO_401',
    file: 'services/automation/actions/email.ts',
    function: 'executeEmailAction',
    httpStatus: 500,
    severity: 'error' as const,
    recoverable: true,
    description: 'Email send action failed.',
    diagnosis: [
      'Check Gmail OAuth credentials are valid',
      'Verify recipient email address is valid',
      'Check for Gmail API rate limiting',
      'Review email template for missing variables',
    ],
  },
  AUTO_402: {
    code: 'AUTO_402',
    file: 'services/automation/actions/client.ts',
    function: 'executeClientAction',
    httpStatus: 500,
    severity: 'error' as const,
    recoverable: true,
    description: 'Client action failed.',
    diagnosis: [
      'Client ID may not exist in database',
      'Check action config for required fields (clientId, tag, etc.)',
      'Verify the action type is valid for client domain',
    ],
  },
  AUTO_403: {
    code: 'AUTO_403',
    file: 'services/automation/actions/contact.ts',
    function: 'executeContactAction',
    httpStatus: 500,
    severity: 'error' as const,
    recoverable: true,
    description: 'Contact action failed.',
    diagnosis: [
      'Contact ID may not exist in database',
      'Check action config for required fields',
      'Verify the action type is valid for contact domain',
    ],
  },
  AUTO_404: {
    code: 'AUTO_404',
    file: 'services/automation/actions/system.ts',
    function: 'executeSystemAction',
    httpStatus: 500,
    severity: 'error' as const,
    recoverable: true,
    description: 'System action failed.',
    diagnosis: [
      'Check system action type (log, webhook, notification)',
      'If webhook, verify target URL is reachable',
      'Review action config for required parameters',
    ],
  },
  AUTO_405: {
    code: 'AUTO_405',
    file: 'services/automation/action-executor.ts',
    function: 'executeActions',
    httpStatus: 400,
    severity: 'error' as const,
    recoverable: false,
    description: 'Unknown action type.',
    diagnosis: [
      'Check AutomationActionType enum in Prisma schema',
      'Action type may have been removed or renamed',
      'Verify action.actionType matches a registered handler in action-executor.ts',
    ],
  },
  AUTO_406: {
    code: 'AUTO_406',
    file: 'services/automation/action-executor.ts',
    function: 'executeActions',
    httpStatus: 400,
    severity: 'warn' as const,
    recoverable: false,
    description: 'Action missing required parameters.',
    diagnosis: [
      'Check action.config for required fields based on action type',
      'Email actions need: to, subject, body',
      'Tag actions need: tagId or tagName',
      'Task actions need: title, categoryId',
    ],
  },
  AUTO_407: {
    code: 'AUTO_407',
    file: 'services/automation/action-executor.ts',
    function: 'executeActions',
    httpStatus: 404,
    severity: 'warn' as const,
    recoverable: false,
    description: 'Action target not found.',
    diagnosis: [
      'The entity referenced by the action does not exist',
      'Client, contact, or order ID in action config may be stale',
      'Target may have been deleted since automation was created',
    ],
  },
  AUTO_408: {
    code: 'AUTO_408',
    file: 'services/automation/actions/task.ts',
    function: 'executeTaskAction',
    httpStatus: 500,
    severity: 'error' as const,
    recoverable: true,
    description: 'Task creation action failed.',
    diagnosis: [
      'Check action config for required fields (title, categoryId)',
      'Verify task category exists in database',
      'Check database connectivity',
    ],
  },
  AUTO_409: {
    code: 'AUTO_409',
    file: 'services/automation/actions/tag.ts',
    function: 'executeTagAction',
    httpStatus: 500,
    severity: 'error' as const,
    recoverable: true,
    description: 'Tag action failed.',
    diagnosis: [
      'Tag ID may not exist in database',
      'Entity to tag may not exist',
      'Check for unique constraint (tag already applied)',
    ],
  },
  AUTO_410: {
    code: 'AUTO_410',
    file: 'services/automation/actions/order.ts',
    function: 'executeOrderAction',
    httpStatus: 500,
    severity: 'error' as const,
    recoverable: true,
    description: 'Order action failed.',
    diagnosis: [
      'Order ID may not exist in database',
      'Status transition may be invalid',
      'Check action config for required fields',
    ],
  },
  AUTO_411: {
    code: 'AUTO_411',
    file: 'services/automation/action-executor.ts',
    function: 'executeActions',
    httpStatus: 400,
    severity: 'warn' as const,
    recoverable: false,
    description: 'Action payload validation failed.',
    diagnosis: [
      'Action config did not pass Zod validation for the specific action type',
      'Review the action type schema for required and optional fields',
      'Check for type mismatches (string vs number, etc.)',
    ],
  },
  AUTO_412: {
    code: 'AUTO_412',
    file: 'services/automation/action-executor.ts',
    function: 'executeActions',
    httpStatus: 408,
    severity: 'error' as const,
    recoverable: true,
    description: 'Action execution timeout exceeded.',
    diagnosis: [
      'Individual action took longer than the allowed timeout',
      'Check if external service (email, webhook) is responding slowly',
      'Consider increasing timeout or breaking action into smaller steps',
    ],
  },

  // =====================
  // AUTO_500-507: Resilience
  // =====================
  AUTO_500: {
    code: 'AUTO_500',
    file: 'services/automation/resilience.ts',
    function: 'executeWithRetry',
    httpStatus: 503,
    severity: 'error' as const,
    recoverable: true,
    description: 'Circuit breaker open -- too many failures.',
    diagnosis: [
      'Automation has failed too many times in succession',
      'Circuit breaker is preventing further executions to protect the system',
      'Wait for the cooldown period, then retry',
      'Investigate root cause of repeated failures',
    ],
  },
  AUTO_501: {
    code: 'AUTO_501',
    file: 'services/automation/resilience.ts',
    function: 'executeWithRetry',
    httpStatus: 500,
    severity: 'error' as const,
    recoverable: false,
    description: 'Retry exhausted -- all attempts failed.',
    diagnosis: [
      'Automation was retried MAX_RETRY_ATTEMPTS times and all failed',
      'Execution moved to dead letter queue',
      'Check dead letter entries for error details',
      'Root cause is likely a persistent issue (DB down, external service unavailable)',
    ],
  },
  AUTO_502: {
    code: 'AUTO_502',
    file: 'services/automation/condition-evaluator.ts',
    function: 'evaluateConditions',
    httpStatus: 400,
    severity: 'error' as const,
    recoverable: false,
    description: 'Condition evaluation error -- invalid operator.',
    diagnosis: [
      'Comparator in condition is not a recognized operator',
      'Valid operators: equals, not_equals, contains, not_contains, starts_with, ends_with, greater_than, less_than, etc.',
      'Check automation condition configuration',
    ],
  },
  AUTO_503: {
    code: 'AUTO_503',
    file: 'services/automation/rate-limiter.ts',
    function: 'checkRateLimits',
    httpStatus: 429,
    severity: 'warn' as const,
    recoverable: true,
    description: 'Rate limit exceeded for automation.',
    diagnosis: [
      'Automation exceeded maxExecutionsPerHour or cooldownSeconds',
      'Check automation settings for rate limit configuration',
      'High-frequency triggers may need larger limits or deduplication',
    ],
  },
  AUTO_504: {
    code: 'AUTO_504',
    file: 'services/automation/resilience.ts',
    function: 'isDuplicateExecution',
    httpStatus: 200,
    severity: 'warn' as const,
    recoverable: true,
    description: 'Idempotency key duplicate -- skipping execution.',
    diagnosis: [
      'This trigger event was already processed (same automation + entity + time window)',
      'This is a safety mechanism to prevent double execution',
      'If unexpected, check if the source event is being emitted multiple times',
    ],
  },
  AUTO_505: {
    code: 'AUTO_505',
    file: 'services/automation/trigger-registry.ts',
    function: 'emit',
    httpStatus: 403,
    severity: 'error' as const,
    recoverable: false,
    description: 'Security check failed -- unauthorized automation source.',
    diagnosis: [
      'Automation was triggered from an untrusted source module',
      'Check automation.sourceModule matches the calling service',
      'May indicate an attempt to trigger automations from unauthorized code',
    ],
  },
  AUTO_506: {
    code: 'AUTO_506',
    file: 'services/automation/resilience.ts',
    function: 'emitMonitoringEvent',
    httpStatus: null,
    severity: 'warn' as const,
    recoverable: true,
    description: 'Monitoring event emission failed (non-fatal).',
    diagnosis: [
      'Monitoring subsystem failed but automation execution continues',
      'Check monitoring event handler for errors',
      'This does not affect automation execution outcome',
    ],
  },
  AUTO_507: {
    code: 'AUTO_507',
    file: 'services/automation/resilience.ts',
    function: 'executeWithTimeout',
    httpStatus: 408,
    severity: 'error' as const,
    recoverable: true,
    description: 'Timeout exceeded for automation execution.',
    diagnosis: [
      'Entire automation execution exceeded EXECUTION_TIMEOUT_MS (5 minutes)',
      'Check if external services are slow or unresponsive',
      'Consider splitting into smaller automations',
      'Review action chain for bottlenecks',
    ],
  },
} as const;

// ===========================================
// MERGED REGISTRY
// ===========================================

export const AUTO_ERRORS = {
  ...AUTO_ERRORS_CORE,
  ...AUTO_ERRORS_ACTIONS,
} as const;
