// ===========================================
// ORDINATIO JOBS v1.1 — Types
// ===========================================
// Agentic-first execution infrastructure.
// Every type answers: what is this doing,
// is it safe, what changes, what if it fails,
// and what should happen next.
// ===========================================

// ---- Job Intent (Semantic Purpose) ----

/**
 * Standardized job purposes for cross-industry interoperability.
 * Agents use this to understand what a job does without reading docs.
 */
export type JobIntent =
  | 'sync_data'
  | 'send_message'
  | 'place_order'
  | 'generate_report'
  | 'update_state'
  | 'external_api_call'
  | 'provision_resource'
  | 'cleanup'
  | 'compute'
  | 'notify';

// ---- Definition of Done ----

/**
 * Machine-readable completion criteria.
 * Every job declares how to verify it actually succeeded.
 */
export interface DefinitionOfDone {
  /** Machine-readable conditions (e.g., "record exists in DB", "status = completed"). */
  checks: string[];
}

// ---- Side Effects Declaration ----

/**
 * Explicitly declares what the job can change.
 * Enables safety evaluation, audit, and policy enforcement.
 */
export interface SideEffectSpec {
  /** Systems or tables the job writes to. */
  writes: string[];
  /** External services the job calls. */
  externalCalls: string[];
  /** Whether the job's effects cannot be undone. */
  irreversible: boolean;
}

// ---- Job Definition (Expanded Contract) ----

/** Retry policy for a job type. */
export interface RetryPolicy {
  /** Maximum number of attempts (including the first). */
  maxAttempts: number;
  /** Backoff strategy. */
  backoff: {
    type: 'exponential' | 'fixed';
    /** Initial delay in milliseconds. */
    delay: number;
  };
}

/** Replay policy for idempotent jobs. */
export type ReplayPolicy = 'allow' | 'deny' | 'merge';

/**
 * Full contract for a registered job type.
 * Agents read this to understand, plan, and execute jobs.
 */
export interface JobTypeDefinition<TData = unknown> {
  /** Unique identifier (e.g., 'PLACE_ORDER'). */
  type: string;
  /** Human-readable description. */
  description: string;
  /** Spec version for backward compatibility. */
  spec: 'job-v1';

  // --- Execution ---
  /** Default retry policy. */
  retry: RetryPolicy;
  /** Default priority (lower = higher priority, 0 = highest). */
  defaultPriority: number;
  /** Default concurrency limit. */
  concurrency?: number;
  /** Payload validator. */
  validate?: (data: unknown) => TData;

  // --- Agentic (semantic understanding) ---
  /** What this job does (cross-industry standard). */
  intent: JobIntent;
  /** How to verify the job actually completed. */
  definitionOfDone: DefinitionOfDone;
  /** What the job can change (writes, external calls, reversibility). */
  sideEffects: SideEffectSpec;

  // --- Safety ---
  /** Whether the job is safe to retry after failure. */
  safeToRetry: boolean;
  /** Whether running the same job twice produces the same outcome. */
  idempotent: boolean;
  /** Whether a human must approve before execution. */
  requiresHumanApproval: boolean;
  /** Risk classification for policy enforcement. */
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  /** How replays are handled. */
  replayPolicy: ReplayPolicy;

  // --- Dependencies ---
  /** Job types that must complete before this one can run. */
  dependsOn?: string[];
}

// ---- Job State (Canonical) ----

/**
 * Canonical job status. Agents never infer state from logs.
 */
export type JobStatus =
  | 'pending'
  | 'running'
  | 'completed'
  | 'failed'
  | 'delayed'
  | 'paused'
  | 'dead_letter'
  | 'quarantined';

/**
 * Full state object for a job instance.
 * Agents read this to understand exactly what's happening.
 */
export interface JobState {
  jobId: string;
  type: string;
  intent: JobIntent;
  status: JobStatus;

  /** Human-readable goal (e.g., "Place order ORD-123 on GoCreate portal"). */
  goal: string;
  /** Current state description (e.g., "Waiting for fit profile sync"). */
  currentState: string;
  /** What should happen next (null if terminal). */
  nextExpectedTransition: string | null;

  /** Why the job is blocked (if status is paused/dead_letter/quarantined). */
  blockedReason?: string;
  /** Last error reference code (e.g., JOBS_100-20260319T...). */
  lastErrorCode?: string;

  /** Machine-readable recovery plan (always present on failure). */
  suggestedRecovery?: RecoveryPlan;

  // --- Dependency tracking ---
  parentJobId?: string;
  dependsOn?: string[];
  blocks?: string[];

  // --- Trust context ---
  principalId?: string;
  organizationId?: string;
  trustTier?: number;

  // --- Idempotency ---
  idempotencyKey?: string;

  // --- Timing ---
  createdAt?: Date;
  startedAt?: Date;
  completedAt?: Date;
  attemptsMade: number;
  progress: number | Record<string, unknown>;

  // --- Hypermedia ---
  _actions?: Record<string, HypermediaAction>;
  _constraints?: string[];
  _recovery?: RecoveryPlan;
}

// ---- Recovery Plan (Non-Negotiable) ----

/**
 * Every failure MUST return a recovery plan.
 * Agents always know what to do next.
 */
export interface RecoveryPlan {
  /** Whether recovery is possible at all. */
  recoverable: boolean;
  /** Whether a retry is recommended. */
  retryRecommended: boolean;
  /** Delay before retry (if recommended). */
  retryDelayMs?: number;

  /** The single next action to take. */
  nextAction: 'retry' | 'modify_payload' | 'request_human' | 'abort' | 'wait';

  /** Whether a human must intervene. */
  humanInterventionRequired: boolean;
  /** Machine-readable reason code. */
  reasonCode: string;

  /** Safe alternatives to the failed action. */
  safeAlternatives?: string[];
}

// ---- Job Result (Structured) ----

/**
 * Every completed/failed job returns this.
 * Workers must produce structured results — no exceptions.
 */
export interface JobResult<T = unknown> {
  jobId: string;
  type: string;
  intent: JobIntent;
  status: 'completed' | 'failed' | 'dead_letter' | 'quarantined';

  /** Structured result data (on success). */
  result?: T;
  /** Error message (on failure). */
  error?: string;
  /** Error reference code. */
  errorCode?: string;

  attemptsMade: number;
  durationMs?: number;

  /** Recovery plan (required on failure). */
  recovery?: RecoveryPlan;

  /** Side effects that actually occurred. */
  actualSideEffects?: string[];

  /** Auditable execution artifact. */
  executionLog?: ExecutionLogEntry[];
}

// ---- Execution Log (Auditability) ----

/** A single entry in the execution log. */
export interface ExecutionLogEntry {
  timestamp: Date;
  phase: 'start' | 'progress' | 'decision' | 'side_effect' | 'error' | 'complete';
  message: string;
  data?: Record<string, unknown>;
}

// ---- Job Snapshot (Lightweight) ----

/**
 * Lightweight view of a job for queue listing.
 * Use JobState for full details.
 */
export interface JobSnapshot {
  id: string;
  type: string;
  status: JobStatus;
  progress: number | Record<string, unknown>;
  attemptsMade: number;
  failedReason?: string;
  data: Record<string, unknown>;
  createdAt?: Date;
  processedAt?: Date;
  finishedAt?: Date;
}

// ---- Queue Posture (Agent Interface) ----

/**
 * Full queue state for agents.
 * Includes load assessment, failure trends, and recommended actions.
 */
export interface QueuePosture {
  queueName: string;
  connected: boolean;

  /** Qualitative load assessment. */
  loadLevel: 'low' | 'medium' | 'high';

  counts: {
    waiting: number;
    active: number;
    completed: number;
    failed: number;
    delayed: number;
    paused: number;
    deadLetter: number;
    quarantined: number;
  };

  stuckJobs: number;
  oldestWaitingMs: number;
  consecutiveFailures: number;

  needsAttention: boolean;
  recommendedAction?: string;

  /** Hypermedia actions. */
  _actions?: Record<string, HypermediaAction>;
}

// ---- Cron Posture ----

/**
 * Health state for a cron job.
 * Agents use this to detect degradation.
 */
export interface CronPosture {
  jobName: string;
  schedule: string;

  lastRun?: number;
  nextRun?: number;
  lastSuccessAt?: number;

  consecutiveFailures: number;
  missedRuns: number;

  health: 'healthy' | 'degraded' | 'failing';
  recommendedAction?: string;

  _actions?: Record<string, HypermediaAction>;
}

// ---- Cron Job (Internal State) ----

/** A registered cron job's runtime state. */
export interface CronJob {
  name: string;
  schedule: string;
  description?: string;
  enabled: boolean;
  lastRun?: Date;
  nextRun?: Date;
  isRunning: boolean;
  lastSuccessAt?: Date;
  consecutiveFailures: number;
  missedRuns: number;
}

/** Options for registering a cron job. */
export interface CronRegistration {
  name: string;
  schedule: string;
  description?: string;
  handler: () => Promise<void>;
  enabled?: boolean;
}

// ---- Hypermedia ----

/** A discoverable action in API responses. */
export interface HypermediaAction {
  /** What the action does. */
  intent: string;
  /** HTTP method or function name. */
  method?: string;
  /** Endpoint or function path. */
  href?: string;
  /** What must be true to use this action. */
  requiredInputs?: string[];
  /** What changes if this action is taken. */
  sideEffects?: string[];
  /** Estimated time/cost. */
  estimatedCost?: string;
}

// ---- Job Plan (Preflight) ----

/**
 * Returned by planJob() — a preflight analysis before execution.
 * Agents call this to understand what will happen without doing it.
 */
export interface JobPlan {
  /** Whether the payload is valid. */
  valid: boolean;
  /** Validation errors (if invalid). */
  validationErrors?: string[];

  /** Resolved job type. */
  type: string;
  intent: JobIntent;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';

  /** What will change. */
  sideEffects: SideEffectSpec;
  /** How completion will be verified. */
  definitionOfDone: DefinitionOfDone;

  /** Retry policy that will apply. */
  retryPolicy: RetryPolicy;
  /** Whether the job is idempotent. */
  idempotent: boolean;
  /** Replay policy. */
  replayPolicy: ReplayPolicy;

  /** Whether human approval is required. */
  requiresApproval: boolean;
  /** Whether this is safe to retry on failure. */
  safeToRetry: boolean;

  /** Estimated execution cost/time (if determinable). */
  estimatedCost?: string;

  /** Dependencies that must complete first. */
  dependsOn?: string[];
  /** Whether dependencies are satisfied. */
  dependenciesSatisfied?: boolean;

  /** Policy evaluation result (if policy gate is configured). */
  policyResult?: PolicyResult;

  /** Hypermedia actions. */
  _actions?: Record<string, HypermediaAction>;
}

// ---- Policy Integration ----

/** Result of pre-execution policy evaluation. */
export interface PolicyResult {
  decision: 'allow' | 'deny' | 'escalate';
  trustTier?: number;
  constraints?: string[];
  reason?: string;
}

/** Policy evaluator function signature. */
export type PolicyEvaluator = (
  job: JobTypeDefinition,
  context: { principalId?: string; organizationId?: string; trustTier?: number },
) => PolicyResult;

// ---- Worker Contract ----

/**
 * Standard contract that all workers must follow.
 * No variation across apps.
 */
export interface WorkerContract<TInput = unknown, TOutput = unknown> {
  /** Process a job. Must return structured result. */
  execute: (input: TInput, context: WorkerContext) => Promise<WorkerResult<TOutput>>;
}

/** Context passed to every worker execution. */
export interface WorkerContext {
  jobId: string;
  type: string;
  attempt: number;
  idempotencyKey?: string;
  organizationId?: string;
  principalId?: string;
  /** Emit progress updates. */
  reportProgress: (progress: number | Record<string, unknown>) => void;
  /** Append to execution log. */
  log: (phase: ExecutionLogEntry['phase'], message: string, data?: Record<string, unknown>) => void;
}

/** Structured result from a worker. */
export interface WorkerResult<T = unknown> {
  success: boolean;
  result?: T;
  error?: string;
  errorCode?: string;
  /** Worker classifies own errors. */
  errorClassification?: 'retryable' | 'fatal' | 'quarantine';
  /** Recovery plan (required on failure). */
  recovery?: RecoveryPlan;
  /** Side effects that actually occurred. */
  actualSideEffects?: string[];
  /** Execution log entries. */
  executionLog?: ExecutionLogEntry[];
}

// ---- Queue Configuration ----

/** Redis connection configuration. */
export interface RedisConfig {
  host: string;
  port: number;
  password?: string;
  maxRetriesPerRequest?: number | null;
  db?: number;
  tls?: boolean;
}

/** Configuration for a queue. */
export interface QueueConfig {
  name: string;
  redis: RedisConfig;
  defaults?: {
    attempts?: number;
    backoff?: { type: 'exponential' | 'fixed'; delay: number };
    removeOnComplete?: { age: number; count: number };
    removeOnFail?: { age: number };
  };
}

// ---- Callbacks ----

/** Callbacks for job lifecycle events. */
export interface JobCallbacks {
  onJobCompleted?: (result: JobResult) => Promise<void>;
  onJobFailed?: (result: JobResult) => Promise<void>;
  onJobRetried?: (jobId: string, type: string, attempt: number) => Promise<void>;
  onJobStuck?: (jobId: string, type: string) => Promise<void>;
  onJobDeadLettered?: (jobId: string, type: string, reason: string) => Promise<void>;
  onJobQuarantined?: (jobId: string, type: string, reason: string) => Promise<void>;
  onCronFired?: (cronName: string) => Promise<void>;
  onCronFailed?: (cronName: string, error: Error) => Promise<void>;
}

// ---- Queue Client Interface ----

/**
 * Abstract queue client interface.
 * Implement for BullMQ, SQS, RabbitMQ, etc.
 */
export interface QueueClient {
  addJob(type: string, data: Record<string, unknown>, options?: AddJobOptions): Promise<string>;
  getJob(jobId: string): Promise<JobSnapshot | null>;
  getHealth(): Promise<QueuePosture>;
  getWaiting(limit?: number): Promise<JobSnapshot[]>;
  getActive(limit?: number): Promise<JobSnapshot[]>;
  getFailed(limit?: number): Promise<JobSnapshot[]>;
  removeJob(jobId: string): Promise<boolean>;
  drain(): Promise<void>;
  close(): Promise<void>;
}

/** Options for adding a job. */
export interface AddJobOptions {
  priority?: number;
  jobId?: string;
  delay?: number;
  attempts?: number;
  idempotencyKey?: string;
  organizationId?: string;
  principalId?: string;
  parentJobId?: string;
  repeat?: { every?: number; pattern?: string };
}
