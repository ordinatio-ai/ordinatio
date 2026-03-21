// IHS
/**
 * Context Engine — Cross-Module Situation Assembly (Innovation 3)
 *
 * The killer feature. Given a situation (agent + entity + history), assembles
 * the optimal context window from Layer C summaries across all modules.
 *
 * Five slices:
 *   1. Focus entity (30%) — Current entity's Layer C + key structured fields
 *   2. Related entities (25%) — Client's orders, email's thread, etc.
 *   3. Memories (20%) — Agent observations, user instructions, preferences
 *   4. Timeline (15%) — Recent activities, status changes, deadlines
 *   5. System (10%) — Module health, pending approvals, active automations
 */

// ---------------------------------------------------------------------------
// Context Request
// ---------------------------------------------------------------------------

export interface ContextRequest {
  /** Agent role requesting context */
  readonly agentRole: string;
  /** Focus entity type (e.g., 'Client', 'Order', 'EmailMessage') */
  readonly focusEntityType?: string;
  /** Focus entity ID */
  readonly focusEntityId?: string;
  /** Page/view context (e.g., 'dashboard', 'client-detail', 'order-wizard') */
  readonly pageContext?: string;
  /** Total token budget for the assembled context */
  readonly tokenBudget: number;
  /** Organization ID for tenant scoping */
  readonly organizationId: string;
  /** Optional: specific modules to include */
  readonly includeModules?: readonly string[];
  /** Optional: specific modules to exclude */
  readonly excludeModules?: readonly string[];
}

// ---------------------------------------------------------------------------
// Context Window (the assembled result)
// ---------------------------------------------------------------------------

export interface ContextSlice {
  /** Slice category */
  readonly category: ContextCategory;
  /** Module this data came from */
  readonly moduleId: string;
  /** Entity type (if entity-related) */
  readonly entityType?: string;
  /** Entity ID (if entity-related) */
  readonly entityId?: string;
  /** The context text (from Layer C summaries) */
  readonly content: string;
  /** Token count of this slice */
  readonly tokens: number;
  /** Relevance score (0-1) — higher = more relevant to the current situation */
  readonly relevance: number;
  /** When this data was last updated */
  readonly freshness: Date;
}

export type ContextCategory =
  | 'focus'     // 30% — Current entity's Layer C + key structured fields
  | 'related'   // 25% — Connected entities across modules
  | 'memory'    // 20% — Agent observations, user instructions
  | 'timeline'  // 15% — Recent activities, status changes, deadlines
  | 'system';   // 10% — Module health, pending approvals

/** Default budget allocation percentages */
export const CONTEXT_BUDGET_ALLOCATION: Record<ContextCategory, number> = {
  focus: 0.30,
  related: 0.25,
  memory: 0.20,
  timeline: 0.15,
  system: 0.10,
} as const;

export interface ContextWindow {
  /** All assembled slices, ordered by relevance within category */
  readonly slices: readonly ContextSlice[];
  /** Total tokens used */
  readonly totalTokens: number;
  /** Token budget that was requested */
  readonly tokenBudget: number;
  /** Percentage of budget used */
  readonly budgetUtilization: number;
  /** When this context was assembled */
  readonly assembledAt: Date;
  /** Modules that contributed data */
  readonly contributingModules: readonly string[];
  /** Assembly time in ms */
  readonly assemblyTimeMs: number;
  /** Number of slices that were truncated to fit budget */
  readonly truncatedSlices: number;
  /** Number of slices that were skipped entirely (wouldn't fit) */
  readonly skippedSlices: number;
  /** Budget pressure level based on utilization */
  readonly budgetPressure: 'normal' | 'tight' | 'critical';
}

// ---------------------------------------------------------------------------
// Context Provider (per-module contribution)
// ---------------------------------------------------------------------------

/**
 * Each module implements a ContextProvider to contribute its data
 * to the Context Engine's cross-module assembly.
 */
export interface ContextProvider {
  /** Module ID this provider belongs to */
  readonly moduleId: string;

  /**
   * Get the focus entity's context (Layer C summary).
   * Called when the focus entity belongs to this module.
   */
  getFocusContext(
    entityType: string,
    entityId: string,
    organizationId: string,
  ): Promise<ContextSlice | null>;

  /**
   * Get related entity context for a given focus entity.
   * E.g., email module returns recent emails for a client focus entity.
   */
  getRelatedContext(
    focusEntityType: string,
    focusEntityId: string,
    organizationId: string,
    tokenBudget: number,
  ): Promise<readonly ContextSlice[]>;

  /**
   * Get timeline entries relevant to the current situation.
   */
  getTimelineContext(
    focusEntityType: string | undefined,
    focusEntityId: string | undefined,
    organizationId: string,
    tokenBudget: number,
  ): Promise<readonly ContextSlice[]>;

  /**
   * Get system status information from this module.
   */
  getSystemContext(
    organizationId: string,
    tokenBudget: number,
  ): Promise<readonly ContextSlice[]>;
}

// ---------------------------------------------------------------------------
// Context Engine Interface
// ---------------------------------------------------------------------------

export interface ContextEngine {
  /**
   * Register a module's context provider.
   */
  registerProvider(provider: ContextProvider): void;

  /**
   * Assemble a complete context window for an agent.
   * Queries all registered providers, scores by relevance,
   * and fits within the token budget.
   */
  assemble(request: ContextRequest): Promise<ContextWindow>;

  /**
   * Get a single entity's context (Layer C) without full assembly.
   * Fast path for simple lookups.
   */
  getEntityContext(
    entityType: string,
    entityId: string,
    organizationId: string,
  ): Promise<ContextSlice | null>;
}
