// ===========================================
// AGENT COGNITION — Intent Resolution
// ===========================================
// Every conversation turn resolves to a
// DualIntent. The agent reasons about outcomes,
// not just tool opportunities.
//
// Uses the shared execution primitives from
// @ordinatio/jobs — one intent model across
// the entire platform.
// ===========================================

/**
 * Re-export the shared DualIntent from the execution engine.
 * Agent uses the same intent model as jobs and automations.
 */
export type { DualIntent, ExecutionIntent } from '@ordinatio/jobs';

/**
 * Agent-specific intent context.
 * Wraps DualIntent with conversation-level metadata.
 */
export interface AgentTurnIntent {
  /** Mechanical purpose (from shared ExecutionIntent). */
  executionIntent: string;
  /** Business purpose (agent/user-defined). */
  businessIntent: string;
  /** The user's original message that triggered this intent. */
  userMessage: string;
  /** Role executing this intent. */
  roleId: string;
  /** Entity context (if the conversation is about a specific entity). */
  entityContext?: {
    entityType: string;
    entityId: string;
  };
  /** Machine-readable definition of done for this turn. */
  definitionOfDone: string[];
  /** Allowed strategies (guardrails on what the agent can try). */
  allowedStrategySpace: string[];
  /** When to stop trying. */
  failureBoundary: {
    maxToolCalls: number;
    maxRetries: number;
    timeoutMs: number;
  };
}

/**
 * Resolve the intent of an agent turn from the user message and role.
 * For now, this creates a structured intent from available context.
 * In the future, the LLM itself can declare intent before acting.
 */
export function resolveAgentIntent(input: {
  userMessage: string;
  roleId: string;
  roleName: string;
  entityType?: string;
  entityId?: string;
  maxToolCalls?: number;
  timeoutMs?: number;
}): AgentTurnIntent {
  return {
    executionIntent: 'external_api_call',
    businessIntent: inferBusinessIntent(input.userMessage, input.roleId),
    userMessage: input.userMessage,
    roleId: input.roleId,
    entityContext: input.entityType && input.entityId
      ? { entityType: input.entityType, entityId: input.entityId }
      : undefined,
    definitionOfDone: [
      'User question answered or action completed',
      'All relevant context surfaced',
      'Next steps suggested if applicable',
    ],
    allowedStrategySpace: [
      'Use read tools to gather context before acting',
      'Propose actions before executing them',
      'Create drafts before sending',
    ],
    failureBoundary: {
      maxToolCalls: input.maxToolCalls ?? 10,
      maxRetries: 2,
      timeoutMs: input.timeoutMs ?? 60_000,
    },
  };
}

/**
 * Infer a business intent from the user's message.
 * Simple heuristic — LLM-based intent detection can override this.
 */
function inferBusinessIntent(message: string, roleId: string): string {
  const lower = message.toLowerCase();

  if (lower.includes('order') && (lower.includes('pending') || lower.includes('status'))) {
    return 'triage_order_status';
  }
  if ((lower.includes('email') || lower.includes('inbox')) && (lower.includes('triage') || lower.includes('check') || lower.includes('inbox'))) {
    return 'triage_email_inbox';
  }
  if (lower.includes('client') && (lower.includes('find') || lower.includes('search') || lower.includes('look'))) {
    return 'client_lookup';
  }
  if (lower.includes('fabric') && (lower.includes('stock') || lower.includes('available'))) {
    return 'check_fabric_availability';
  }
  if (lower.includes('task') && (lower.includes('overdue') || lower.includes('pending'))) {
    return 'triage_tasks';
  }
  if (lower.includes('report') || lower.includes('summary') || lower.includes('overview')) {
    return 'generate_summary';
  }

  return `${roleId}_general_assistance`;
}
