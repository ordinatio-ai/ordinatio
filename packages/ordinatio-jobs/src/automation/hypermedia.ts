// ===========================================
// ORDINATIO JOBS v2.0 — Hypermedia Helpers
// ===========================================
// Shared builders for _state, _actions,
// _constraints, _recovery on automation
// responses. Agents discover what they can
// do without documentation.
// ===========================================

import type { DagExecutionResult, DagExecutionState } from './dag-types';
import type { RecoveryPlan, HypermediaAction } from '../types';

/**
 * Standard hypermedia envelope for any automation response.
 */
export interface HypermediaEnvelope {
  _state: string;
  _actions: Record<string, HypermediaAction>;
  _constraints: string[];
  _recovery?: RecoveryPlan;
}

/**
 * Build hypermedia for a DAG execution result.
 */
export function buildExecutionHypermedia(
  result: DagExecutionResult,
  automationId: string,
): HypermediaEnvelope {
  const actions: Record<string, HypermediaAction> = {};
  const constraints: string[] = [];

  switch (result.status) {
    case 'completed':
      actions.view_artifact = { intent: 'View execution artifact' };
      actions.view_log = { intent: 'View detailed execution log' };
      actions.rerun = { intent: 'Re-run this automation with the same trigger data' };
      break;

    case 'failed':
      actions.view_log = { intent: 'View detailed execution log' };
      actions.view_failures = { intent: 'Inspect failed nodes' };
      if (result.recovery?.retryRecommended) {
        actions.retry = { intent: 'Retry the failed execution' };
      }
      if (result.recovery?.humanInterventionRequired) {
        actions.escalate = { intent: 'Escalate to human operator' };
        constraints.push('Human intervention required before retry');
      }
      break;

    case 'waiting':
      if (result.continuationToken) {
        actions.resume = { intent: 'Resume execution with event data or approval' };
        actions.cancel = { intent: 'Cancel the waiting execution' };
        constraints.push(`Paused at node: ${result.continuationToken.pausedAtNodeId}`);
      }
      break;

    case 'paused':
      actions.resume = { intent: 'Resume paused execution' };
      actions.cancel = { intent: 'Cancel paused execution' };
      constraints.push('Execution is paused');
      break;
  }

  return {
    _state: result.status,
    _actions: actions,
    _constraints: constraints,
    _recovery: result.recovery,
  };
}

/**
 * Build hypermedia for an automation definition (not an execution).
 */
export function buildAutomationHypermedia(
  automationId: string,
  isActive: boolean,
): HypermediaEnvelope {
  const actions: Record<string, HypermediaAction> = {};
  const constraints: string[] = [];

  if (isActive) {
    actions.pause = { intent: 'Pause this automation' };
    actions.test = { intent: 'Run a dry test with sample data' };
    actions.simulate = { intent: 'Simulate against historical data' };
    actions.plan = { intent: 'Generate a preflight execution plan' };
    actions.view_history = { intent: 'View execution history' };
    actions.view_posture = { intent: 'View automation health posture' };
    actions.edit = { intent: 'Edit automation configuration' };
  } else {
    actions.reactivate = { intent: 'Reactivate this automation' };
    actions.delete = { intent: 'Delete this automation permanently' };
    constraints.push('Automation is paused — will not trigger');
  }

  return {
    _state: isActive ? 'active' : 'paused',
    _actions: actions,
    _constraints: constraints,
  };
}

/**
 * Build hypermedia for a dead-lettered execution.
 */
export function buildDeadLetterHypermedia(
  executionId: string,
  error: string,
): HypermediaEnvelope {
  return {
    _state: 'dead_letter',
    _actions: {
      retry: { intent: 'Retry this dead-lettered execution' },
      discard: { intent: 'Permanently discard this execution' },
      inspect: { intent: 'View full error details and execution log' },
    },
    _constraints: ['Execution exhausted all retry attempts'],
    _recovery: {
      recoverable: true,
      retryRecommended: false,
      nextAction: 'request_human',
      humanInterventionRequired: true,
      reasonCode: 'DEAD_LETTER',
    },
  };
}
