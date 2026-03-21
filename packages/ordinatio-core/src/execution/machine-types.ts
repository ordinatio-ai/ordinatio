// IHS
/**
 * Intermittent Machine — Types (Book IV)
 *
 * Types specific to the Intermittent Machine engine. Separated from types.ts
 * (167 lines) to stay within Rule 1's 300-line limit.
 *
 * The machine handles WHEN and HOW an agent executes:
 * - Awakening classification (4 categories from Book IV §IV)
 * - Budget tracking (time, LLM calls, tokens, actions)
 * - Governance evaluation before each action
 * - Pause/resume via ContinuationToken
 * - Immutable state transitions
 *
 * DEPENDS ON: execution/types (ExecutionBounds, ExecutionTrigger, ExecutionArtifact, etc.)
 *             governance/types (GovernancePolicy, GovernanceDecision, RiskLevel)
 */

import type {
  ExecutionBounds,
  ExecutionTrigger,
  ExecutionArtifact,
  ExecutionStatus,
  ContinuationToken,
} from './types';
import type {
  GovernancePolicy,
  GovernancePolicyOverride,
  GovernanceDecision,
  RiskLevel,
} from '../governance/types';

// ---------------------------------------------------------------------------
// Awakening Classification (Book IV §IV)
// ---------------------------------------------------------------------------

/** The 4 categories of awakening events from Book IV §IV */
export type AwakeningCategory =
  | 'structural'      // Schema change, module added/removed, covenant update
  | 'environmental'   // External event — email, webhook, system signal
  | 'intellectual'    // Human input, chat, knowledge update
  | 'temporal';       // Scheduled — cron, timer

/** Pattern definition for classifying trigger sources */
export interface AwakeningPattern {
  readonly category: AwakeningCategory;
  readonly patterns: readonly string[];
  readonly description: string;
}

/** Book IV §IV's 4 categories with source pattern examples */
export const AWAKENING_PATTERNS: readonly AwakeningPattern[] = [
  {
    category: 'structural',
    patterns: ['schema', 'migration', 'module', 'covenant', 'deploy', 'config'],
    description: 'Infrastructure changes requiring structural response',
  },
  {
    category: 'environmental',
    patterns: ['email', 'webhook', 'order', 'payment', 'stock', 'api', 'sync'],
    description: 'External events from the operating environment',
  },
  {
    category: 'intellectual',
    patterns: ['user', 'chat', 'knowledge', 'learning', 'feedback', 'review'],
    description: 'Human input or knowledge-driven stimulus',
  },
  {
    category: 'temporal',
    patterns: ['cron', 'schedule', 'timer', 'nightly', 'daily', 'weekly'],
    description: 'Time-based scheduled execution',
  },
] as const;

// ---------------------------------------------------------------------------
// Agent Interface (Pluggable LLM — Rule 12)
// ---------------------------------------------------------------------------

/** Everything the agent needs to reason and plan actions */
export interface AgentBrief {
  readonly executionId: string;
  readonly trigger: ExecutionTrigger;
  readonly contextSnapshot: string;
  readonly capabilities: readonly string[];
  readonly bounds: ExecutionBounds;
  readonly governancePolicy: GovernancePolicy;
  readonly priorArtifacts?: readonly ExecutionArtifact[];
  readonly continuationToken?: ContinuationToken;
}

/** A single action the agent plans to take */
export interface PlannedAction {
  readonly capability: string;
  readonly riskLevel: RiskLevel;
  readonly parameters: Record<string, unknown>;
  readonly reasoning: string;
}

/** What the agent returns after reasoning */
export interface AgentResult {
  readonly actions: readonly PlannedAction[];
  readonly reasoning: string;
  readonly llmCallsUsed: number;
  readonly tokensUsed: number;
  readonly requestsApproval?: boolean;
}

/**
 * Pluggable executor interface — the consuming app implements this with LLM calls.
 * Mirrors Phase 4's OfficeExecutor pattern. Rule 12: "LLM provider is swappable."
 */
export interface AgentExecutor {
  execute(brief: AgentBrief): Promise<AgentResult>;
}

// ---------------------------------------------------------------------------
// Capability Resolution (Pluggable)
// ---------------------------------------------------------------------------

/** Resolves available capabilities for a given trigger */
export interface CapabilityResolver {
  resolveCapabilities(trigger: ExecutionTrigger): string[];
}

// ---------------------------------------------------------------------------
// Machine Configuration
// ---------------------------------------------------------------------------

/** Configuration to start a machine execution */
export interface MachineConfig {
  readonly trigger: ExecutionTrigger;
  readonly contextSnapshot: string;
  readonly capabilities: readonly string[];
  readonly bounds?: Partial<ExecutionBounds>;
  readonly governancePolicy: GovernancePolicy;
  readonly governancePolicyOverrides?: readonly GovernancePolicyOverride[];
  readonly agentId?: string;
  readonly organizationId?: string;
  readonly priorArtifacts?: readonly ExecutionArtifact[];
}

// ---------------------------------------------------------------------------
// Machine State (Immutable)
// ---------------------------------------------------------------------------

/** Phases of the machine lifecycle */
export type MachinePhase =
  | 'dormant'           // Default state — sleeping
  | 'awakening'         // Classifying trigger
  | 'reasoning'         // Agent is reasoning (LLM call)
  | 'acting'            // Executing a planned action
  | 'governance_check'  // Evaluating governance before an action
  | 'paused'            // Awaiting human approval
  | 'resting';          // Execution complete — returning to dormancy

/** Snapshot of budget consumption at a point in time */
export interface BudgetSnapshot {
  readonly llmCallsUsed: number;
  readonly tokensUsed: number;
  readonly actionsExecuted: number;
  readonly elapsedMs: number;
}

/** Remaining budget in each dimension */
export interface BudgetRemaining {
  readonly llmCalls: number;
  readonly tokens: number;
  readonly actions: number;
  readonly timeMs: number;
}

/** A single exceeded bound */
export interface ExceededBound {
  readonly bound: keyof ExecutionBounds;
  readonly limit: number;
  readonly actual: number;
}

/** Complete machine state — new object per transition (immutable) */
export interface MachineState {
  readonly executionId: string;
  readonly config: MachineConfig;
  readonly phase: MachinePhase;
  readonly budget: BudgetSnapshot;
  readonly actions: readonly PlannedAction[];
  readonly governanceDecisions: readonly GovernanceDecision[];
  readonly continuationToken?: ContinuationToken;
  readonly pauseReason?: string;
  readonly error?: string;
  readonly startedAt: Date;
}

/** Final result of a machine execution */
export interface MachineResult {
  readonly executionId: string;
  readonly status: ExecutionStatus;
  readonly artifact: ExecutionArtifact;
  readonly budgetUsed: BudgetSnapshot;
  readonly exceededBounds: readonly ExceededBound[];
}
