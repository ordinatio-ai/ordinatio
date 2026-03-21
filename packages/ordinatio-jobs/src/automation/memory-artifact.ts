// ===========================================
// ORDINATIO JOBS v2.0 — Memory Artifacts
// ===========================================
// Compact execution summaries. Agents consume
// these instead of reading logs. Each execution
// produces one artifact describing what happened,
// why, what changed, and what to do next.
// ===========================================

import type { DagExecutionResult, DagNodeState } from './dag-types';
import type { AutomationIntent, DoDResult } from './intent-layer';

/**
 * Compact artifact summarizing an automation execution.
 * Future agents reason from these without reading logs.
 */
export interface AutomationArtifact {
  artifactType: 'automation_execution';
  automationId: string;
  automationName: string;
  executionId: string;

  /** What happened (one sentence). */
  summary: string;
  /** Why it was triggered. */
  triggerReason: string;
  /** What changed (list of side effects). */
  changes: string[];
  /** Whether the intent was satisfied. */
  intentSatisfied: boolean;
  /** Which DoD checks passed/failed. */
  dodResults?: { passed: string[]; failed: string[] };
  /** What failed (if anything). */
  failures: string[];
  /** What should happen next. */
  nextSteps: string[];

  /** Compact metadata for agent context windows. */
  metadata: {
    status: string;
    durationMs: number;
    nodesExecuted: number;
    actionsCompleted: number;
    actionsFailed: number;
    riskLevel: string;
  };

  /** Timestamp. */
  createdAt: Date;
}

/**
 * Build an execution artifact from a DAG result.
 */
export function buildExecutionArtifact(input: {
  automationId: string;
  automationName: string;
  executionId: string;
  triggerReason: string;
  dagResult: DagExecutionResult;
  intent?: AutomationIntent;
  dodResult?: DoDResult;
  riskLevel?: string;
}): AutomationArtifact {
  const { dagResult, intent, dodResult } = input;

  // Build changes list from completed action nodes
  const changes: string[] = [];
  for (const node of dagResult.nodeResults) {
    if (node.status === 'completed' && node.result) {
      changes.push(`${node.nodeId}: ${summarizeResult(node.result)}`);
    }
  }

  // Build failures list
  const failures: string[] = [];
  for (const node of dagResult.nodeResults) {
    if (node.status === 'failed') {
      failures.push(`${node.nodeId}: ${node.error ?? 'unknown error'}`);
    }
  }

  // Determine intent satisfaction
  const intentSatisfied = dodResult?.satisfied ?? (dagResult.status === 'completed' && failures.length === 0);

  // Build DoD results
  let dodResults: AutomationArtifact['dodResults'];
  if (dodResult) {
    dodResults = {
      passed: dodResult.checks.filter(c => c.passed).map(c => c.description),
      failed: dodResult.checks.filter(c => !c.passed).map(c => c.description),
    };
  }

  // Build next steps
  const nextSteps = computeNextSteps(dagResult, intentSatisfied, failures);

  // Build summary
  const summary = buildSummary(input.automationName, dagResult, intentSatisfied, failures);

  return {
    artifactType: 'automation_execution',
    automationId: input.automationId,
    automationName: input.automationName,
    executionId: input.executionId,
    summary,
    triggerReason: input.triggerReason,
    changes,
    intentSatisfied,
    dodResults,
    failures,
    nextSteps,
    metadata: {
      status: dagResult.status,
      durationMs: dagResult.durationMs,
      nodesExecuted: dagResult.nodesExecuted,
      actionsCompleted: dagResult.actionsCompleted,
      actionsFailed: dagResult.actionsFailed,
      riskLevel: input.riskLevel ?? 'low',
    },
    createdAt: new Date(),
  };
}

/**
 * Summarize an artifact for LLM context windows.
 * Returns a single compact string.
 */
export function summarizeArtifact(artifact: AutomationArtifact): string {
  const parts = [artifact.summary];
  if (artifact.changes.length > 0) {
    parts.push(`Changes: ${artifact.changes.join('; ')}.`);
  }
  if (artifact.failures.length > 0) {
    parts.push(`Failures: ${artifact.failures.join('; ')}.`);
  }
  if (artifact.nextSteps.length > 0) {
    parts.push(`Next: ${artifact.nextSteps.join('; ')}.`);
  }
  return parts.join(' ');
}

// ---- Internal ----

function summarizeResult(result: unknown): string {
  if (!result || typeof result !== 'object') return String(result ?? 'completed');
  const obj = result as Record<string, unknown>;
  const keys = Object.keys(obj).slice(0, 3);
  if (keys.length === 0) return 'completed';
  return keys.map(k => `${k}=${String(obj[k])}`).join(', ');
}

function computeNextSteps(result: DagExecutionResult, intentSatisfied: boolean, failures: string[]): string[] {
  const steps: string[] = [];

  if (result.status === 'waiting') {
    steps.push('Execution is paused — awaiting external event or approval');
  }

  if (result.status === 'failed') {
    if (result.recovery) {
      steps.push(`Recovery: ${result.recovery.nextAction}`);
      if (result.recovery.humanInterventionRequired) {
        steps.push('Human intervention required');
      }
    } else {
      steps.push('Investigate failure — no automatic recovery available');
    }
  }

  if (result.status === 'completed' && !intentSatisfied) {
    steps.push('Execution completed but intent was not satisfied — review definition of done');
  }

  if (failures.length > 0 && result.status === 'completed') {
    steps.push('Some actions failed but execution continued — review failed actions');
  }

  if (result.status === 'completed' && intentSatisfied && failures.length === 0) {
    steps.push('No action needed — automation completed successfully');
  }

  return steps;
}

function buildSummary(name: string, result: DagExecutionResult, intentSatisfied: boolean, failures: string[]): string {
  if (result.status === 'completed' && intentSatisfied) {
    return `${name} completed successfully. ${result.actionsCompleted} actions executed in ${result.durationMs}ms.`;
  }
  if (result.status === 'completed' && !intentSatisfied) {
    return `${name} completed but intent was not satisfied. ${result.actionsCompleted} actions, ${failures.length} issues.`;
  }
  if (result.status === 'failed') {
    return `${name} failed. ${failures.length} action(s) failed after ${result.durationMs}ms.`;
  }
  if (result.status === 'waiting') {
    return `${name} is paused, awaiting external input. ${result.actionsCompleted} actions completed so far.`;
  }
  return `${name} ended with status: ${result.status}.`;
}
