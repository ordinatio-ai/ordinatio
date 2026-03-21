// ===========================================
// AGENT COGNITION — Turn Planning
// ===========================================
// Before acting, the agent produces a structured
// plan. Users and other agents can inspect it.
//
// Uses ExecutionPlan from @ordinatio/jobs as
// the base contract — one plan format across
// the entire platform.
// ===========================================

import type { AgentTurnIntent } from './agent-intent';
import type { AgentTool, AgentRole, OrchestratorConfig, DataTrustLevel } from '../types';

/**
 * Re-export shared types from the execution engine.
 */
export type { ExecutionPlan, SafetyClass, RecoveryPlan } from '@ordinatio/jobs';

/**
 * Agent-specific execution plan.
 * Extends the shared ExecutionPlan with cognition-layer details.
 */
export interface AgentTurnPlan {
  /** Plan version. */
  schemaVersion: 'agent-turn-plan-v1';
  /** When this plan was generated. */
  generatedAt: Date;

  // ---- Intent ----
  intent: {
    executionIntent: string;
    businessIntent: string;
    definitionOfDone: string[];
  };

  // ---- Role ----
  role: {
    id: string;
    name: string;
    modules: string[];
    approvalGateCount: number;
  };

  // ---- Provider ----
  provider: {
    id: string;
    name: string;
    trustLevel: DataTrustLevel;
  };

  // ---- Tools ----
  tools: {
    available: number;
    byModule: Record<string, number>;
    blockedByGuardrails: string[];
    blockedByTrust: string[];
    safetyClasses: string[];
  };

  // ---- Memory ----
  memory: {
    relevantMemories: number;
    tokenBudget: number;
    estimatedTokens: number;
  };

  // ---- Context ----
  context: {
    entityType?: string;
    entityId?: string;
    hasEntityContext: boolean;
    tokenBudget: number;
  };

  // ---- Trust ----
  trust: {
    providerTrustLevel: DataTrustLevel;
    blockedSensitivities: string[];
    approvalRequired: boolean;
    approvalGates: string[];
  };

  // ---- Budget ----
  budget: {
    maxToolCalls: number;
    maxRetries: number;
    timeoutMs: number;
    estimatedTokenUsage: number;
  };

  // ---- Risks ----
  risks: string[];

  // ---- Hypermedia ----
  _actions?: Record<string, { intent: string }>;
}

/**
 * Plan an agent turn before execution.
 * Returns a structured plan that can be inspected by humans or other agents.
 */
export function planAgentTurn(input: {
  intent: AgentTurnIntent;
  role: AgentRole;
  providerId: string;
  providerName: string;
  providerTrustLevel: DataTrustLevel;
  availableTools: AgentTool[];
  blockedByGuardrails: string[];
  blockedByTrust: string[];
  relevantMemoryCount: number;
  memoryTokenEstimate: number;
  hasEntityContext: boolean;
  config: OrchestratorConfig;
}): AgentTurnPlan {
  const {
    intent, role, providerId, providerName, providerTrustLevel,
    availableTools, blockedByGuardrails, blockedByTrust,
    relevantMemoryCount, memoryTokenEstimate, hasEntityContext, config,
  } = input;

  // Group tools by module
  const byModule: Record<string, number> = {};
  for (const tool of availableTools) {
    byModule[tool.module] = (byModule[tool.module] ?? 0) + 1;
  }

  // Collect unique safety classes
  const safetyClasses = new Set<string>();
  for (const tool of availableTools) {
    safetyClasses.add(inferSafetyClass(tool));
  }

  // Identify risks
  const risks: string[] = [];
  if (blockedByTrust.length > 0) {
    risks.push(`${blockedByTrust.length} tools blocked by provider trust policy`);
  }
  if (blockedByGuardrails.length > 0) {
    risks.push(`${blockedByGuardrails.length} tools blocked by module guardrails`);
  }
  if (availableTools.some(t => t.dataSensitivity === 'critical')) {
    risks.push('Critical-sensitivity tools available — data exposure risk');
  }
  if (providerTrustLevel === 'none' || providerTrustLevel === 'internal') {
    risks.push(`Provider "${providerName}" has restricted trust level: ${providerTrustLevel}`);
  }

  // Approval gates
  const approvalRequired = role.approvalGates.length > 0;
  const approvalGates = role.approvalGates.map(g => g.action);

  // Estimated token usage
  const rolePromptTokens = 500;
  const toolSchemaTokens = availableTools.length * 100;
  const contextTokens = hasEntityContext ? (config.memoryTokenBudget ?? 2000) : 0;
  const estimatedTokenUsage = rolePromptTokens + memoryTokenEstimate + toolSchemaTokens + contextTokens;

  return {
    schemaVersion: 'agent-turn-plan-v1',
    generatedAt: new Date(),
    intent: {
      executionIntent: intent.executionIntent,
      businessIntent: intent.businessIntent,
      definitionOfDone: intent.definitionOfDone,
    },
    role: {
      id: role.id,
      name: role.name,
      modules: role.modules,
      approvalGateCount: role.approvalGates.length,
    },
    provider: {
      id: providerId,
      name: providerName,
      trustLevel: providerTrustLevel,
    },
    tools: {
      available: availableTools.length,
      byModule,
      blockedByGuardrails,
      blockedByTrust,
      safetyClasses: [...safetyClasses],
    },
    memory: {
      relevantMemories: relevantMemoryCount,
      tokenBudget: config.memoryTokenBudget ?? 2000,
      estimatedTokens: memoryTokenEstimate,
    },
    context: {
      entityType: intent.entityContext?.entityType,
      entityId: intent.entityContext?.entityId,
      hasEntityContext,
      tokenBudget: config.memoryTokenBudget ?? 2000,
    },
    trust: {
      providerTrustLevel,
      blockedSensitivities: blockedByTrust,
      approvalRequired,
      approvalGates,
    },
    budget: {
      maxToolCalls: intent.failureBoundary.maxToolCalls,
      maxRetries: intent.failureBoundary.maxRetries,
      timeoutMs: intent.failureBoundary.timeoutMs,
      estimatedTokenUsage,
    },
    risks,
    _actions: {
      execute: { intent: 'Execute this agent turn' },
      simulate: { intent: 'Dry-run without executing tools' },
      ...(approvalRequired ? { request_approval: { intent: 'Pre-approve pending gates' } } : {}),
    },
  };
}

function inferSafetyClass(tool: AgentTool): string {
  const type = tool.name.toUpperCase();
  if (type.startsWith('GET_') || type.startsWith('LIST_') || type.startsWith('SEARCH_')) return 'read_only';
  if (type.includes('DELETE') || type.includes('REMOVE')) return 'irreversible_write';
  if (type.includes('SEND_EMAIL') || type.includes('REPLY') || type === 'CALL_WEBHOOK') return 'external_side_effect';
  if (type.includes('CREATE_') || type.includes('UPDATE_')) return 'reversible_write';
  return 'reversible_write';
}
