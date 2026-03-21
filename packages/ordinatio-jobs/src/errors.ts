// ===========================================
// ORDINATIO JOBS — Error Registry
// ===========================================
// Error codes for job queue operations,
// cron scheduling, health monitoring, and
// worker lifecycle management.
// Rule 8 compliance: code + ref + runtime context.
// ===========================================

/**
 * Enhanced error builder v2 — full diagnostic object.
 * Machines read this and know: what broke, when, where in the code,
 * how bad it is, whether to retry, how to fix it, and the runtime
 * data from the moment it happened.
 */
export function jobsError(code: string, context?: Record<string, unknown>): {
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
  const def = JOBS_ERRORS[code as keyof typeof JOBS_ERRORS];
  const ts = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, '');

  if (!def) {
    return {
      code,
      ref: `${code}-${ts}`,
      timestamp: new Date().toISOString(),
      module: 'JOBS',
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
    module: 'JOBS',
    description: def.description,
    severity: def.severity,
    recoverable: def.recoverable,
    diagnosis: [...def.diagnosis],
    context: context || {},
  };
}

export const JOBS_ERRORS = {
  // ===========================
  // 100-109: Queue Operations
  // ===========================
  JOBS_100: {
    code: 'JOBS_100',
    file: 'queue-client.ts',
    function: 'addJob',
    severity: 'error' as const,
    recoverable: true,
    description: 'Failed to add job to queue.',
    diagnosis: [
      'Redis connection may be down or unreachable',
      'Queue may not be initialized (call createQueue first)',
      'Job data may be too large for Redis (check payload size)',
      'Check REDIS_HOST, REDIS_PORT, REDIS_PASSWORD env vars',
    ],
  },
  JOBS_101: {
    code: 'JOBS_101',
    file: 'queue-client.ts',
    function: 'getJob',
    severity: 'warn' as const,
    recoverable: true,
    description: 'Failed to retrieve job by ID.',
    diagnosis: [
      'Job may have been removed (completed jobs are cleaned after 24h)',
      'Redis connection issue',
      'Job ID format may be incorrect',
    ],
  },
  JOBS_102: {
    code: 'JOBS_102',
    file: 'queue-client.ts',
    function: 'removeJob',
    severity: 'warn' as const,
    recoverable: true,
    description: 'Failed to remove job from queue.',
    diagnosis: [
      'Job may already be completed or actively running',
      'Job ID may not exist',
      'Redis connection issue',
    ],
  },
  JOBS_103: {
    code: 'JOBS_103',
    file: 'queue-client.ts',
    function: 'drain',
    severity: 'warn' as const,
    recoverable: true,
    description: 'Failed to drain waiting jobs from queue.',
    diagnosis: [
      'Redis connection issue',
      'Queue may have active jobs that cannot be drained',
    ],
  },

  // ===========================
  // 110-119: Connection & Health
  // ===========================
  JOBS_110: {
    code: 'JOBS_110',
    file: 'connection.ts',
    function: 'testRedisConnection',
    severity: 'critical' as const,
    recoverable: true,
    description: 'Redis connection test failed.',
    diagnosis: [
      'Redis server may not be running',
      'Check REDIS_HOST and REDIS_PORT configuration',
      'Check REDIS_PASSWORD if authentication is required',
      'Network firewall may block the connection',
      'Redis may be at max connections (check maxclients setting)',
    ],
  },
  JOBS_111: {
    code: 'JOBS_111',
    file: 'health.ts',
    function: 'getQueueHealth',
    severity: 'warn' as const,
    recoverable: true,
    description: 'Failed to retrieve queue health metrics.',
    diagnosis: [
      'Redis connection may be interrupted',
      'Queue may not be initialized',
      'BullMQ getJobCounts() may have timed out',
    ],
  },
  JOBS_112: {
    code: 'JOBS_112',
    file: 'health.ts',
    function: 'detectStuckJobs',
    severity: 'warn' as const,
    recoverable: true,
    description: 'Stuck jobs detected in queue.',
    diagnosis: [
      'Jobs may be stuck in ACTIVE state with no progress',
      'Worker may have crashed without completing the job',
      'Check stuckThresholdMs (default 10 minutes)',
      'Consider running sweepStuckJobs() to reset them',
    ],
  },

  // ===========================
  // 120-129: Cron Scheduling
  // ===========================
  JOBS_120: {
    code: 'JOBS_120',
    file: 'cron-scheduler.ts',
    function: 'registerCron',
    severity: 'warn' as const,
    recoverable: true,
    description: 'Failed to register cron job.',
    diagnosis: [
      'Cron name may already be registered (duplicates not allowed)',
      'Cron expression may be invalid',
      'Handler function may be undefined',
    ],
  },
  JOBS_121: {
    code: 'JOBS_121',
    file: 'cron-scheduler.ts',
    function: 'executeCron',
    severity: 'error' as const,
    recoverable: true,
    description: 'Cron job execution failed.',
    diagnosis: [
      'The cron handler threw an error',
      'Check the specific cron name for its handler logic',
      'The error will be logged but the scheduler continues',
      'Next run will be scheduled normally',
    ],
  },
  JOBS_122: {
    code: 'JOBS_122',
    file: 'cron-scheduler.ts',
    function: 'triggerCron',
    severity: 'warn' as const,
    recoverable: true,
    description: 'Manual cron trigger failed — job not found or already running.',
    diagnosis: [
      'The cron name does not match any registered cron',
      'The cron may already be running (isRunning = true)',
      'Check getSchedulerStatus() for registered cron names',
    ],
  },

  // ===========================
  // 130-139: Job Type Registry
  // ===========================
  JOBS_130: {
    code: 'JOBS_130',
    file: 'job-registry.ts',
    function: 'registerJobType',
    severity: 'warn' as const,
    recoverable: true,
    description: 'Job type registration failed — duplicate type.',
    diagnosis: [
      'A job type with this name is already registered',
      'Each job type must have a unique string identifier',
      'Check getRegisteredTypes() for existing types',
    ],
  },
  JOBS_131: {
    code: 'JOBS_131',
    file: 'job-registry.ts',
    function: 'validateJobData',
    severity: 'warn' as const,
    recoverable: true,
    description: 'Job data validation failed for registered type.',
    diagnosis: [
      'Job data does not pass the validate() function for its type',
      'Check the JobTypeDefinition.validate for this type',
      'Ensure required fields are present in the job payload',
    ],
  },
  JOBS_132: {
    code: 'JOBS_132',
    file: 'job-registry.ts',
    function: 'registerJobType',
    severity: 'error' as const,
    recoverable: true,
    description: 'Job type has incomplete agentic contract.',
    diagnosis: [
      'All v1.1 jobs require: intent, definitionOfDone, sideEffects, safeToRetry, idempotent, requiresHumanApproval, riskLevel, spec',
      'Check the missing fields listed in the error message',
      'Use spec: "job-v1" for all job definitions',
    ],
  },
  JOBS_133: {
    code: 'JOBS_133',
    file: 'job-registry.ts',
    function: 'planJob',
    severity: 'warn' as const,
    recoverable: true,
    description: 'Job plan requested for unregistered type.',
    diagnosis: [
      'The job type is not in the registry',
      'Plan will return valid: false with high risk',
      'Register the job type before planning',
    ],
  },
  JOBS_134: {
    code: 'JOBS_134',
    file: 'job-registry.ts',
    function: 'planJob',
    severity: 'warn' as const,
    recoverable: true,
    description: 'Policy evaluation denied job execution.',
    diagnosis: [
      'The pre-execution policy gate returned "deny"',
      'Check the policy evaluator for the specific denial reason',
      'Escalate to a higher trust tier or modify the job parameters',
    ],
  },

  // ===========================
  // 140-149: Worker Lifecycle
  // ===========================
  JOBS_140: {
    code: 'JOBS_140',
    file: 'worker-lifecycle.ts',
    function: 'createWorker',
    severity: 'critical' as const,
    recoverable: false,
    description: 'Failed to create BullMQ worker.',
    diagnosis: [
      'Redis connection failed during worker initialization',
      'Check Redis credentials and connectivity',
      'Worker may already be running (singleton pattern)',
    ],
  },
  JOBS_141: {
    code: 'JOBS_141',
    file: 'worker-lifecycle.ts',
    function: 'stopWorker',
    severity: 'warn' as const,
    recoverable: true,
    description: 'Worker shutdown did not complete cleanly.',
    diagnosis: [
      'Active jobs may not have completed before shutdown timeout',
      'Redis connection may have been lost during shutdown',
      'Check for zombie processes after unclean shutdown',
    ],
  },

  // ===========================
  // 150-159: Recovery & Safety
  // ===========================
  JOBS_150: {
    code: 'JOBS_150',
    file: 'recovery.ts',
    function: 'classifyFailure',
    severity: 'error' as const,
    recoverable: true,
    description: 'Job failed without a recovery plan.',
    diagnosis: [
      'Worker must return a RecoveryPlan on every failure',
      'Check the WorkerContract implementation for this job type',
      'A default recovery plan will be generated but may not be accurate',
    ],
  },
  JOBS_151: {
    code: 'JOBS_151',
    file: 'idempotency.ts',
    function: 'checkIdempotency',
    severity: 'warn' as const,
    recoverable: true,
    description: 'Duplicate job detected within deduplication window.',
    diagnosis: [
      'A job with this idempotencyKey was already processed',
      'Check the dedupeWindowMs setting for this job type',
      'If replay is intended, set replayPolicy to "allow"',
    ],
  },
  JOBS_152: {
    code: 'JOBS_152',
    file: 'quarantine.ts',
    function: 'quarantineJob',
    severity: 'critical' as const,
    recoverable: false,
    description: 'Job quarantined — unsafe, inconsistent, or suspicious.',
    diagnosis: [
      'Quarantined jobs are never auto-retried',
      'Manual investigation is required',
      'Check the quarantine reason for specifics',
      'After investigation, manually re-queue or discard',
    ],
  },
} as const;
