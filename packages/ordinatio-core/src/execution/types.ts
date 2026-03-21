// IHS
/**
 * Intermittent Execution (Innovation 6 — Book IV)
 *
 * Agents are processes, not services. They wake on events, execute bounded work,
 * produce artifacts, and sleep. Per Book IV: "The Corpus remembers; agents do not."
 *
 * Execution cycle:
 *   1. Event arrives (email received, order status changed, cron schedule)
 *   2. Context Engine assembles situation from Layer C summaries
 *   3. Agent executes within bounds (max LLM calls, timeout, token limit)
 *   4. Produces ExecutionArtifact (actions taken, mutations, context snapshot)
 *   5. System sleeps
 *
 * Continuation pattern: When execution hits an approval gate → produce a
 * continuation token + sleep. Approval event resumes a new bounded run.
 */

// ---------------------------------------------------------------------------
// Execution Bounds
// ---------------------------------------------------------------------------

export interface ExecutionBounds {
  /** Maximum number of LLM calls per execution */
  readonly maxLlmCalls: number;
  /** Maximum execution time in milliseconds */
  readonly timeoutMs: number;
  /** Maximum tokens consumed (input + output) */
  readonly maxTokens: number;
  /** Maximum number of capability invocations */
  readonly maxActions: number;
}

/** Default bounds for agent execution */
export const DEFAULT_EXECUTION_BOUNDS: ExecutionBounds = {
  maxLlmCalls: 10,
  timeoutMs: 30_000,
  maxTokens: 50_000,
  maxActions: 20,
} as const;

// ---------------------------------------------------------------------------
// Execution Artifact (the output of every bounded execution)
// ---------------------------------------------------------------------------

export type ExecutionStatus =
  | 'completed'         // All work done within bounds
  | 'paused'            // Hit approval gate — awaiting human
  | 'exceeded_bounds'   // Hit a limit (time, tokens, actions)
  | 'failed';           // Unrecoverable error

export interface ExecutionAction {
  /** Capability that was invoked */
  readonly capabilityId: string;
  /** Module the capability belongs to */
  readonly moduleId: string;
  /** Input parameters */
  readonly inputs: Record<string, unknown>;
  /** Output result */
  readonly output: Record<string, unknown>;
  /** Risk level */
  readonly risk: string;
  /** Governance decision */
  readonly verdict: string;
  /** When this action occurred */
  readonly timestamp: Date;
}

export interface ExecutionArtifact {
  /** Unique artifact ID */
  readonly id: string;
  /** Agent role that produced this */
  readonly agentRole: string;
  /** What triggered this execution */
  readonly trigger: ExecutionTrigger;
  /** Final status */
  readonly status: ExecutionStatus;
  /** Actions taken during execution */
  readonly actions: readonly ExecutionAction[];
  /** Context snapshot at start of execution (for audit/replay) */
  readonly contextSnapshot: string;
  /** Resource consumption */
  readonly consumption: ExecutionConsumption;
  /** Continuation token (if paused for approval) */
  readonly continuation?: ContinuationToken;
  /** Error details (if failed) */
  readonly error?: ExecutionError;
  /** Parent artifact ID — links continuation chains (child → parent) */
  readonly parentArtifactId?: string;
  /** When execution started */
  readonly startedAt: Date;
  /** When execution ended */
  readonly endedAt: Date;
  /** Organization context */
  readonly organizationId: string;
}

// ---------------------------------------------------------------------------
// Execution Trigger
// ---------------------------------------------------------------------------

export type TriggerType =
  | 'event'       // Domain event (email received, order placed)
  | 'cron'        // Scheduled execution
  | 'user'        // User-initiated (chat, button click)
  | 'continuation' // Resumed after approval
  | 'system';     // System-initiated (health check, maintenance)

export interface ExecutionTrigger {
  readonly type: TriggerType;
  /** Event ID or cron expression or user ID */
  readonly source: string;
  /** Additional context about the trigger */
  readonly metadata: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Resource Consumption
// ---------------------------------------------------------------------------

export interface ExecutionConsumption {
  /** Number of LLM calls made */
  readonly llmCalls: number;
  /** Total tokens consumed (input + output) */
  readonly tokensUsed: number;
  /** Wall-clock time in milliseconds */
  readonly durationMs: number;
  /** Number of capability invocations */
  readonly actionsPerformed: number;
  /** Number of audit entries created */
  readonly auditEntriesCreated: number;
}

// ---------------------------------------------------------------------------
// Continuation Token (for paused executions)
// ---------------------------------------------------------------------------

export interface ContinuationToken {
  /** Unique token ID */
  readonly id: string;
  /** What approval is needed to resume */
  readonly awaitingApproval: string;
  /** Capability that triggered the pause */
  readonly pausedAtCapability: string;
  /** Serialized state to restore on resume */
  readonly state: Record<string, unknown>;
  /** When this token expires (after which the execution is abandoned) */
  readonly expiresAt: Date;
  /** Parent artifact ID — the artifact that produced this continuation */
  readonly parentArtifactId: string;
}

// ---------------------------------------------------------------------------
// Execution Error
// ---------------------------------------------------------------------------

export interface ExecutionError {
  /** Error code (from module error registry) */
  readonly code: string;
  /** Human-readable message */
  readonly message: string;
  /** Whether the execution can be retried */
  readonly retryable: boolean;
  /** Stack trace (in development only) */
  readonly stack?: string;
}
