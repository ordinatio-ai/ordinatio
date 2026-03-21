// ===========================================
// AGENT COGNITION — Posture
// ===========================================
// Agent health state — not just provider
// health, but the full operational picture.
// Extends the shared posture model with
// agent-specific fields.
// ===========================================

import type { DataTrustLevel } from '../types';

/**
 * Full agent posture.
 * Both humans and other agents consume this to reason
 * about the agent as a system.
 */
export interface AgentPosture {
  roleId: string;
  health: 'healthy' | 'degraded' | 'constrained' | 'failing' | 'offline';

  /** LLM provider status. */
  provider: {
    id: string;
    healthy: boolean;
    consecutiveFailures: number;
    trustLevel: DataTrustLevel;
  };

  /** Memory system status. */
  memory: {
    healthy: boolean;
    totalMemories: number;
    staleCount: number;
    lastRetrievalMs?: number;
  };

  /** Tool availability. */
  tools: {
    totalRegistered: number;
    availableForRole: number;
    blockedByGuardrails: number;
    blockedByTrust: number;
  };

  /** Approval backlog. */
  approvals: {
    pending: number;
    oldestPendingMs?: number;
  };

  /** Trust posture. */
  trust: {
    providerTrustLevel: DataTrustLevel;
    restrictedModules: string[];
    policyViolations24h: number;
  };

  /** Context pressure (how much of the token budget is consumed). */
  contextPressure: {
    level: 'low' | 'medium' | 'high';
    estimatedUsagePercent: number;
  };

  /** Recommended action for operators. */
  recommendedAction?: string;

  /** Plain-language summary. */
  summary: string;

  /** Hypermedia. */
  _actions?: Record<string, { intent: string }>;
}

/**
 * Compute agent posture from component statuses.
 */
export function computeAgentPosture(input: {
  roleId: string;
  providerId: string;
  providerHealthy: boolean;
  providerConsecutiveFailures: number;
  providerTrustLevel: DataTrustLevel;
  memoryHealthy: boolean;
  totalMemories: number;
  staleMemoryCount: number;
  lastRetrievalMs?: number;
  totalTools: number;
  availableTools: number;
  blockedByGuardrails: number;
  blockedByTrust: number;
  pendingApprovals: number;
  oldestPendingApprovalMs?: number;
  restrictedModules: string[];
  policyViolations24h: number;
  contextUsagePercent: number;
}): AgentPosture {
  const health = assessHealth(input);
  const contextPressure = assessContextPressure(input.contextUsagePercent);
  const recommendation = computeRecommendation(input, health);
  const summary = buildSummary(input, health, recommendation);

  const actions: Record<string, { intent: string }> = {};
  if (health === 'failing' || health === 'offline') {
    actions.diagnose = { intent: 'Investigate agent health issues' };
  }
  if (input.pendingApprovals > 0) {
    actions.review_approvals = { intent: `Review ${input.pendingApprovals} pending approval(s)` };
  }
  if (input.staleMemoryCount > 0) {
    actions.cleanup_memory = { intent: `Clean up ${input.staleMemoryCount} stale memories` };
  }
  actions.view_posture = { intent: 'View detailed posture breakdown' };

  return {
    roleId: input.roleId,
    health,
    provider: {
      id: input.providerId,
      healthy: input.providerHealthy,
      consecutiveFailures: input.providerConsecutiveFailures,
      trustLevel: input.providerTrustLevel,
    },
    memory: {
      healthy: input.memoryHealthy,
      totalMemories: input.totalMemories,
      staleCount: input.staleMemoryCount,
      lastRetrievalMs: input.lastRetrievalMs,
    },
    tools: {
      totalRegistered: input.totalTools,
      availableForRole: input.availableTools,
      blockedByGuardrails: input.blockedByGuardrails,
      blockedByTrust: input.blockedByTrust,
    },
    approvals: {
      pending: input.pendingApprovals,
      oldestPendingMs: input.oldestPendingApprovalMs,
    },
    trust: {
      providerTrustLevel: input.providerTrustLevel,
      restrictedModules: input.restrictedModules,
      policyViolations24h: input.policyViolations24h,
    },
    contextPressure,
    recommendedAction: recommendation,
    summary,
    _actions: actions,
  };
}

/**
 * Quick check: does this agent need attention?
 */
export function agentNeedsAttention(posture: AgentPosture): boolean {
  return posture.health !== 'healthy';
}

/**
 * Summarize posture for LLM context.
 */
export function summarizeAgentPosture(posture: AgentPosture): string {
  return posture.summary;
}

// ---- Internal ----

function assessHealth(input: {
  providerHealthy: boolean;
  memoryHealthy: boolean;
  blockedByTrust: number;
  totalTools: number;
  pendingApprovals: number;
  providerConsecutiveFailures: number;
}): AgentPosture['health'] {
  if (!input.providerHealthy && input.providerConsecutiveFailures >= 5) return 'offline';
  if (!input.providerHealthy) return 'failing';
  if (!input.memoryHealthy) return 'degraded';
  if (input.blockedByTrust > input.totalTools * 0.5) return 'constrained';
  if (input.pendingApprovals > 5) return 'degraded';
  return 'healthy';
}

function assessContextPressure(usagePercent: number): AgentPosture['contextPressure'] {
  if (usagePercent > 80) return { level: 'high', estimatedUsagePercent: usagePercent };
  if (usagePercent > 50) return { level: 'medium', estimatedUsagePercent: usagePercent };
  return { level: 'low', estimatedUsagePercent: usagePercent };
}

function computeRecommendation(input: { providerHealthy: boolean; memoryHealthy: boolean; staleMemoryCount: number; pendingApprovals: number; blockedByTrust: number }, health: string): string | undefined {
  if (health === 'offline') return 'Provider is offline. Check API key and service status.';
  if (health === 'failing') return 'Provider is failing. Consider switching to a backup provider.';
  if (!input.memoryHealthy) return 'Memory retrieval is slow or failing. Check database connectivity.';
  if (input.staleMemoryCount > 10) return `${input.staleMemoryCount} stale memories. Run cleanup to improve retrieval quality.`;
  if (input.pendingApprovals > 3) return `${input.pendingApprovals} approvals pending. Review and process to unblock agent.`;
  if (input.blockedByTrust > 0) return `${input.blockedByTrust} tools blocked by trust policy. Review provider trust settings.`;
  return undefined;
}

function buildSummary(input: { roleId: string; providerHealthy: boolean; availableTools: number; pendingApprovals: number; staleMemoryCount: number }, health: string, recommendation?: string): string {
  const parts: string[] = [];
  parts.push(`Agent ${input.roleId} is ${health}.`);
  parts.push(`${input.availableTools} tools available.`);
  if (!input.providerHealthy) parts.push('Provider unhealthy.');
  if (input.pendingApprovals > 0) parts.push(`${input.pendingApprovals} approval(s) pending.`);
  if (input.staleMemoryCount > 0) parts.push(`${input.staleMemoryCount} stale memories.`);
  if (recommendation) parts.push(recommendation);
  return parts.join(' ');
}
