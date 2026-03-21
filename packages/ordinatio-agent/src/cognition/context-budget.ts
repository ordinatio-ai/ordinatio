// ===========================================
// AGENT COGNITION — Context Budget Planner
// ===========================================
// Before every turn, compute a structured
// context budget. Allocate tokens across
// role prompt, memory, entity context, tool
// schemas, and response reservation.
// ===========================================

/**
 * Context budget breakdown.
 */
export interface ContextBudget {
  /** Total tokens available. */
  totalBudget: number;

  /** Allocated amounts. */
  allocated: {
    rolePrompt: number;
    memory: number;
    entityContext: number;
    toolSchemas: number;
    conversationHistory: number;
    responseReserve: number;
  };

  /** Remaining unallocated. */
  remaining: number;

  /** Compression strategy selected. */
  strategy: 'normal' | 'compact' | 'deep_reasoning';

  /** Whether the budget is tight (might need compression). */
  pressure: 'low' | 'medium' | 'high';
}

/**
 * Plan the context budget for an agent turn.
 */
export function planContextBudget(input: {
  /** Max context window for the provider. */
  maxContextTokens?: number;
  /** Number of tools available. */
  toolCount: number;
  /** Number of relevant memories. */
  memoryCount: number;
  /** Whether entity context is available. */
  hasEntityContext: boolean;
  /** Conversation history length (messages). */
  conversationLength: number;
  /** User preference for reasoning depth. */
  reasoningDepth?: 'normal' | 'compact' | 'deep_reasoning';
}): ContextBudget {
  const maxTokens = input.maxContextTokens ?? 128_000;

  // Fixed allocations
  const rolePrompt = 600;
  const responseReserve = input.reasoningDepth === 'deep_reasoning' ? 8_000 : 4_000;

  // Variable allocations
  const toolSchemas = Math.min(input.toolCount * 100, 10_000);
  const conversationHistory = Math.min(input.conversationLength * 300, 20_000);

  // Remaining budget after fixed costs
  const fixedCost = rolePrompt + responseReserve + toolSchemas + conversationHistory;
  const flexibleBudget = Math.max(maxTokens - fixedCost, 0);

  // Split flexible budget between memory and entity context
  let memory: number;
  let entityContext: number;

  if (input.hasEntityContext) {
    memory = Math.min(Math.floor(flexibleBudget * 0.4), input.memoryCount * 200);
    entityContext = Math.min(Math.floor(flexibleBudget * 0.4), 8_000);
  } else {
    memory = Math.min(Math.floor(flexibleBudget * 0.6), input.memoryCount * 200);
    entityContext = 0;
  }

  const totalAllocated = rolePrompt + memory + entityContext + toolSchemas + conversationHistory + responseReserve;
  const remaining = Math.max(maxTokens - totalAllocated, 0);

  // Assess pressure
  const usagePercent = (totalAllocated / maxTokens) * 100;
  const pressure = usagePercent > 80 ? 'high' : usagePercent > 50 ? 'medium' : 'low';

  // Select strategy
  let strategy: ContextBudget['strategy'] = input.reasoningDepth ?? 'normal';
  if (pressure === 'high' && strategy === 'normal') {
    strategy = 'compact';
  }

  return {
    totalBudget: maxTokens,
    allocated: {
      rolePrompt,
      memory,
      entityContext,
      toolSchemas,
      conversationHistory,
      responseReserve,
    },
    remaining,
    strategy,
    pressure,
  };
}

/**
 * Get the token budget for a specific context section.
 */
export function getBudgetForSection(budget: ContextBudget, section: keyof ContextBudget['allocated']): number {
  return budget.allocated[section];
}

/**
 * Check if the budget allows a section to be included.
 */
export function canIncludeSection(budget: ContextBudget, section: keyof ContextBudget['allocated']): boolean {
  return budget.allocated[section] > 0;
}
