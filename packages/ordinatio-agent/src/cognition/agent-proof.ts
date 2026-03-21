// ===========================================
// AGENT COGNITION — Proof Artifacts
// ===========================================
// After acting, the agent produces a formal
// receipt of reasoning and action. Not just
// a log — an auditable proof.
//
// Uses ProofArtifact structure from
// @ordinatio/jobs — one proof format across
// the entire platform.
// ===========================================

import type { AgentTurnIntent } from './agent-intent';
import type { AgentTurnPlan } from './agent-plan';
import type { ToolCallDisplay } from '../types';

/**
 * Re-export shared types.
 */
export type { ProofArtifact, ProofEvidence, DecisionJournal, DecisionEntry, DecisionType } from '@ordinatio/jobs';

/**
 * Agent-specific proof artifact.
 * Formal receipt of what the agent intended, planned, did, and proved.
 */
export interface AgentProofArtifact {
  artifactType: 'agent_turn_proof';
  /** When this proof was generated. */
  timestamp: Date;

  // ---- What was intended ----
  intent: {
    executionIntent: string;
    businessIntent: string;
    definitionOfDone: string[];
  };

  // ---- What was planned ----
  plan: {
    roleId: string;
    providerId: string;
    toolsAvailable: number;
    toolsBlocked: number;
    approvalRequired: boolean;
    estimatedTokens: number;
  };

  // ---- What actually happened ----
  execution: {
    toolsCalled: ToolCallRecord[];
    approvalsRequested: string[];
    approvalsGranted: string[];
    approvalsDenied: string[];
    totalToolCalls: number;
    totalIterations: number;
    durationMs: number;
    finalResponse: string;
    stopReason: string;
  };

  // ---- What was decided (and why) ----
  decisions: AgentDecision[];

  // ---- Whether definition-of-done was satisfied ----
  dodSatisfied: boolean;
  dodResults: Array<{ check: string; passed: boolean; reason?: string }>;

  // ---- What went wrong (if anything) ----
  failures: Array<{ phase: string; error: string; recovery?: string }>;

  // ---- Risks encountered ----
  risksEncountered: string[];

  // ---- Summary for agents and humans ----
  summary: string;
}

/** Record of a tool call during execution. */
export interface ToolCallRecord {
  toolName: string;
  arguments: Record<string, unknown>;
  result: string;
  success: boolean;
  durationMs?: number;
  safetyClass: string;
  approvalRequired: boolean;
}

/** A decision made during the agent turn. */
export interface AgentDecision {
  timestamp: Date;
  phase: 'tool_selection' | 'tool_execution' | 'approval_check' | 'trust_check' | 'guardrail_check' | 'response_parse' | 'intent_evaluation';
  chosen: string;
  reasoning: string;
  rejected?: Array<{ option: string; reason: string }>;
}

/**
 * Build an agent proof artifact from execution results.
 */
export function buildAgentProof(input: {
  intent: AgentTurnIntent;
  plan: AgentTurnPlan;
  toolsCalled: ToolCallDisplay[];
  approvalsRequested: string[];
  approvalsGranted: string[];
  approvalsDenied: string[];
  totalIterations: number;
  durationMs: number;
  finalResponse: string;
  stopReason: string;
  decisions: AgentDecision[];
  failures: Array<{ phase: string; error: string; recovery?: string }>;
}): AgentProofArtifact {
  const { intent, plan, toolsCalled, decisions, failures } = input;

  // Evaluate DoD
  const dodResults = intent.definitionOfDone.map(check => {
    const passed = evaluateDoDCheck(check, input);
    return { check, passed, reason: passed ? undefined : 'Could not be verified automatically' };
  });
  const dodSatisfied = dodResults.every(r => r.passed);

  // Build tool call records
  const toolRecords: ToolCallRecord[] = toolsCalled.map(tc => ({
    toolName: tc.tool,
    arguments: tc.data ?? {},
    result: tc.summary,
    success: tc.success,
    safetyClass: inferSafetyClassFromName(tc.tool),
    approvalRequired: input.approvalsRequested.includes(tc.tool),
  }));

  // Collect risks
  const risks: string[] = [];
  if (input.approvalsDenied.length > 0) {
    risks.push(`${input.approvalsDenied.length} approval(s) denied`);
  }
  if (failures.length > 0) {
    risks.push(`${failures.length} failure(s) during execution`);
  }
  if (plan.tools.blockedByTrust.length > 0) {
    risks.push(`${plan.tools.blockedByTrust.length} tools blocked by trust policy`);
  }

  // Build summary
  const summary = buildSummary(intent, input, dodSatisfied, failures);

  return {
    artifactType: 'agent_turn_proof',
    timestamp: new Date(),
    intent: {
      executionIntent: intent.executionIntent,
      businessIntent: intent.businessIntent,
      definitionOfDone: intent.definitionOfDone,
    },
    plan: {
      roleId: plan.role.id,
      providerId: plan.provider.id,
      toolsAvailable: plan.tools.available,
      toolsBlocked: plan.tools.blockedByGuardrails.length + plan.tools.blockedByTrust.length,
      approvalRequired: plan.trust.approvalRequired,
      estimatedTokens: plan.budget.estimatedTokenUsage,
    },
    execution: {
      toolsCalled: toolRecords,
      approvalsRequested: input.approvalsRequested,
      approvalsGranted: input.approvalsGranted,
      approvalsDenied: input.approvalsDenied,
      totalToolCalls: toolsCalled.length,
      totalIterations: input.totalIterations,
      durationMs: input.durationMs,
      finalResponse: input.finalResponse,
      stopReason: input.stopReason,
    },
    decisions,
    dodSatisfied,
    dodResults,
    failures,
    risksEncountered: risks,
    summary,
  };
}

/**
 * Summarize a proof artifact for LLM context.
 */
export function summarizeAgentProof(proof: AgentProofArtifact): string {
  return proof.summary;
}

// ---- Internal ----

function evaluateDoDCheck(check: string, input: { finalResponse: string; toolsCalled: ToolCallDisplay[]; failures: Array<{ phase: string }> }): boolean {
  const lower = check.toLowerCase();
  if (lower.includes('answered') || lower.includes('completed')) {
    return input.finalResponse.length > 0 && input.failures.length === 0;
  }
  if (lower.includes('context') || lower.includes('surfaced')) {
    return input.toolsCalled.length > 0;
  }
  if (lower.includes('suggested') || lower.includes('next step')) {
    return input.finalResponse.length > 50;
  }
  // Default: assume satisfied if no failures
  return input.failures.length === 0;
}

function inferSafetyClassFromName(name: string): string {
  const upper = name.toUpperCase();
  if (upper.startsWith('GET_') || upper.startsWith('LIST_') || upper.startsWith('SEARCH_')) return 'read_only';
  if (upper.includes('DELETE') || upper.includes('REMOVE')) return 'irreversible_write';
  if (upper.includes('SEND') || upper.includes('REPLY') || upper.includes('WEBHOOK')) return 'external_side_effect';
  return 'reversible_write';
}

function buildSummary(
  intent: AgentTurnIntent,
  input: { toolsCalled: ToolCallDisplay[]; totalIterations: number; durationMs: number; failures: Array<{ phase: string }> },
  dodSatisfied: boolean,
  failures: Array<{ phase: string }>,
): string {
  const parts: string[] = [];

  parts.push(`Intent: ${intent.businessIntent}.`);
  parts.push(`${input.toolsCalled.length} tool(s) called in ${input.totalIterations} iteration(s), ${input.durationMs}ms.`);

  if (dodSatisfied) {
    parts.push('Definition of done: satisfied.');
  } else {
    parts.push('Definition of done: NOT satisfied.');
  }

  if (failures.length > 0) {
    parts.push(`${failures.length} failure(s): ${failures.map(f => f.phase).join(', ')}.`);
  }

  return parts.join(' ');
}
