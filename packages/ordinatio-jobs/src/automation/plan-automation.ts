// ===========================================
// ORDINATIO JOBS v2.0 — planAutomation()
// ===========================================
// Preflight analysis before execution.
// Agents ask "what are you about to do?"
// and get a complete, explainable answer.
// ===========================================

import type { AutomationDag, DagNode } from './dag-types';
import type { AutomationIntent } from './intent-layer';
import { validateDag, type DagValidation } from './dag-validator';
import { validateIntent, type IntentValidation } from './intent-layer';
import type { RecoveryPlan, PolicyResult, PolicyEvaluator, HypermediaAction } from '../types';

// ---- Plan Result ----

/**
 * Complete preflight analysis of an automation.
 * Returned by planAutomation() — the agent reads this to understand
 * what will happen without doing it.
 */
export interface AutomationPlan {
  /** Whether the automation is valid and ready to execute. */
  valid: boolean;
  /** Validation errors (if invalid). */
  validationErrors?: string[];

  /** The automation's intent. */
  intent?: string;

  /** DAG analysis. */
  dag: {
    nodeCount: number;
    actionCount: number;
    hasParallel: boolean;
    hasWaitStates: boolean;
    hasApprovals: boolean;
    maxDepth: number;
  };

  /** Condition dry-run results (if trigger data provided). */
  conditionResults?: {
    wouldPass: boolean;
    trace?: string[];
  };

  /** What systems will be touched. */
  sideEffects: {
    writes: string[];
    externalCalls: string[];
    irreversible: boolean;
  };

  /** Highest risk level across all DAG nodes. */
  riskLevel: 'low' | 'medium' | 'high' | 'critical';

  /** Whether human approval is needed. */
  requiresApproval: boolean;

  /** Approval nodes in the DAG. */
  approvalPoints: string[];

  /** Definition of Done checks that will be verified. */
  completionChecks: string[];

  /** Estimated duration based on action count. */
  estimatedDurationMs?: number;

  /** Dependencies that must complete first. */
  dependsOn?: string[];

  /** Policy evaluation result (if evaluator is set). */
  policyResult?: PolicyResult;

  /** Recovery strategy if the automation fails. */
  recoveryStrategy?: {
    hasFailureEdges: boolean;
    hasFallbackEdges: boolean;
    hasRetryEdges: boolean;
    maxRetries: number;
  };

  /** Hypermedia actions. */
  _actions?: Record<string, HypermediaAction>;
}

// ---- Plan Input ----

export interface PlanAutomationInput {
  /** The automation's DAG. */
  dag: AutomationDag;
  /** The automation's intent (optional but recommended). */
  intent?: AutomationIntent;
  /** Trigger data for condition dry-run (optional). */
  triggerData?: Record<string, unknown>;
  /** Conditions to dry-run (optional). */
  conditions?: Array<{ field: string; comparator: string; value: string }>;
  /** Policy context for trust evaluation. */
  policyContext?: { principalId?: string; organizationId?: string; trustTier?: number };
  /** Policy evaluator function. */
  policyEvaluator?: PolicyEvaluator;
}

/**
 * Plan an automation without executing it.
 * Returns a complete preflight analysis.
 */
export function planAutomation(input: PlanAutomationInput): AutomationPlan {
  const errors: string[] = [];

  // Validate DAG
  const dagValidation = validateDag(input.dag);
  if (!dagValidation.valid) {
    errors.push(...dagValidation.errors.map(e => `DAG: ${e.message}`));
  }

  // Validate intent (if provided)
  if (input.intent) {
    const intentValidation = validateIntent(input.intent);
    if (!intentValidation.valid) {
      errors.push(...intentValidation.errors.map(e => `Intent: ${e}`));
    }
  }

  // Analyze side effects from action nodes
  const sideEffects = analyzeSideEffects(input.dag);

  // Determine risk level
  const riskLevel = computeRiskLevel(input.dag);

  // Check for approval requirements
  const approvalPoints = input.dag.nodes
    .filter(n => n.type === 'approval')
    .map(n => n.label);
  const requiresApproval = approvalPoints.length > 0;

  // DoD checks
  const completionChecks = input.intent?.definitionOfDone?.map(d => d.description) ?? [];

  // Condition dry-run
  let conditionResults: AutomationPlan['conditionResults'];
  if (input.conditions && input.triggerData) {
    conditionResults = dryRunConditions(input.conditions, input.triggerData);
  }

  // Policy evaluation
  let policyResult: PolicyResult | undefined;
  if (input.policyEvaluator && input.policyContext) {
    // Create a minimal job def for the policy evaluator
    const jobDef = {
      type: 'AUTOMATION',
      description: input.intent?.intent ?? 'Automation execution',
      spec: 'job-v1' as const,
      retry: { maxAttempts: 3, backoff: { type: 'exponential' as const, delay: 5000 } },
      defaultPriority: 5,
      intent: 'update_state' as const,
      definitionOfDone: { checks: completionChecks },
      sideEffects,
      safeToRetry: true,
      idempotent: false,
      requiresHumanApproval: requiresApproval,
      riskLevel,
      replayPolicy: 'deny' as const,
    };
    policyResult = input.policyEvaluator(jobDef, input.policyContext);
  }

  // Recovery strategy
  const recoveryStrategy = analyzeRecovery(input.dag);

  // Estimated duration (rough: 500ms per action node)
  const estimatedDurationMs = dagValidation.stats.actionNodeCount * 500;

  // Build hypermedia
  const actions: Record<string, HypermediaAction> = {};
  if (errors.length === 0) {
    actions.execute = { intent: 'Execute this automation' };
    actions.simulate = { intent: 'Simulate this automation against historical data' };
  }
  if (errors.length > 0) {
    actions.fix = { intent: 'Fix validation errors', requiredInputs: errors };
  }
  if (requiresApproval) {
    actions.request_approval = { intent: 'Request approval before execution' };
  }

  return {
    valid: errors.length === 0,
    validationErrors: errors.length > 0 ? errors : undefined,
    intent: input.intent?.intent,
    dag: dagValidation.stats,
    conditionResults,
    sideEffects,
    riskLevel,
    requiresApproval,
    approvalPoints,
    completionChecks,
    estimatedDurationMs,
    policyResult,
    recoveryStrategy,
    _actions: Object.keys(actions).length > 0 ? actions : undefined,
  };
}

// ---- Internal ----

function analyzeSideEffects(dag: AutomationDag): AutomationPlan['sideEffects'] {
  const writes = new Set<string>();
  const externalCalls = new Set<string>();
  let irreversible = false;

  for (const node of dag.nodes) {
    if (node.type !== 'action' || !node.action) continue;

    const type = node.action.actionType;

    // Categorize by action type
    if (type.startsWith('CREATE_') || type.startsWith('UPDATE_') || type.startsWith('DELETE_')) {
      writes.add(type.replace(/^(CREATE_|UPDATE_|DELETE_)/, '').toLowerCase());
    }
    if (type.includes('EMAIL') || type === 'SEND_EMAIL' || type === 'REPLY_TO_EMAIL') {
      externalCalls.add('email_provider');
      irreversible = true; // Sent emails can't be unsent
    }
    if (type === 'CALL_WEBHOOK') {
      externalCalls.add('webhook');
      irreversible = true;
    }
    if (type.includes('TAG')) {
      writes.add('tags');
    }
    if (type.includes('TASK')) {
      writes.add('tasks');
    }
    if (type.includes('ORDER')) {
      writes.add('orders');
    }

    // Node-level risk override
    if (node.riskLevel === 'critical' || node.riskLevel === 'high') {
      irreversible = true;
    }
  }

  return {
    writes: [...writes],
    externalCalls: [...externalCalls],
    irreversible,
  };
}

function computeRiskLevel(dag: AutomationDag): 'low' | 'medium' | 'high' | 'critical' {
  let highest: 'low' | 'medium' | 'high' | 'critical' = 'low';
  const order = { low: 0, medium: 1, high: 2, critical: 3 };

  for (const node of dag.nodes) {
    if (node.riskLevel && order[node.riskLevel] > order[highest]) {
      highest = node.riskLevel;
    }
    // Auto-escalate for certain action types
    if (node.type === 'action' && node.action) {
      const type = node.action.actionType;
      if (type === 'SEND_EMAIL' || type === 'CALL_WEBHOOK') {
        if (order.medium > order[highest]) highest = 'medium';
      }
      if (type.includes('DELETE')) {
        if (order.high > order[highest]) highest = 'high';
      }
    }
  }
  return highest;
}

function analyzeRecovery(dag: AutomationDag): AutomationPlan['recoveryStrategy'] {
  let maxRetries = 0;
  for (const node of dag.nodes) {
    if ((node.maxRetries ?? 0) > maxRetries) maxRetries = node.maxRetries!;
  }

  return {
    hasFailureEdges: dag.edges.some(e => e.type === 'on_failure'),
    hasFallbackEdges: dag.edges.some(e => e.type === 'fallback'),
    hasRetryEdges: dag.edges.some(e => e.type === 'retry'),
    maxRetries,
  };
}

function dryRunConditions(
  conditions: Array<{ field: string; comparator: string; value: string }>,
  data: Record<string, unknown>,
): { wouldPass: boolean; trace: string[] } {
  const trace: string[] = [];
  let allPass = true;

  for (const cond of conditions) {
    const actual = getNestedValue(data, cond.field);
    const strActual = String(actual ?? '');
    let passed = false;

    switch (cond.comparator) {
      case 'EQUALS': passed = strActual === cond.value; break;
      case 'NOT_EQUALS': passed = strActual !== cond.value; break;
      case 'CONTAINS': passed = strActual.includes(cond.value); break;
      case 'IS_NOT_EMPTY': passed = !!actual && strActual !== ''; break;
      case 'IS_EMPTY': passed = !actual || strActual === ''; break;
      default: passed = strActual === cond.value;
    }

    trace.push(`${cond.field} ${cond.comparator} "${cond.value}" → ${passed ? 'PASS' : 'FAIL'} (actual: "${strActual}")`);
    if (!passed) allPass = false;
  }

  return { wouldPass: allPass, trace };
}

function getNestedValue(obj: Record<string, unknown>, path: string): unknown {
  const parts = path.split('.');
  let current: unknown = obj;
  for (const part of parts) {
    if (current === null || current === undefined) return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}
