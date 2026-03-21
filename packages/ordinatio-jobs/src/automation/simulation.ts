// ===========================================
// ORDINATIO JOBS v2.0 — Simulation Mode
// ===========================================
// "What would this have done over the last N days?"
// Replays historical events against an automation
// without executing actions. Returns fire count,
// affected entities, projected outcomes, and risk.
//
// NOTE: Built Mar 2026. Refine by Oct 19, 2026.
// ===========================================

import type { AutomationDag, DagNode } from './dag-types';

// ---- Simulation Types ----

export interface SimulationRequest {
  /** The automation's trigger event type. */
  triggerEventType: string;
  /** The automation's conditions. */
  conditions?: Array<{ field: string; comparator: string; value: string; groupIndex: number }>;
  /** The automation's DAG. */
  dag: AutomationDag;
  /** How far back to look (days). */
  lookbackDays: number;
  /** Maximum events to analyze. */
  maxEvents?: number;
}

export interface SimulationResult {
  /** How many times the trigger would have fired. */
  fireCount: number;
  /** How many times conditions would have passed. */
  conditionPassCount: number;
  /** How many were deduplicated. */
  deduplicatedCount: number;

  /** Breakdown by day. */
  dailyBreakdown: Array<{ date: string; fires: number; passes: number }>;

  /** Which entities would have been affected. */
  affectedEntities: Array<{ entityType: string; entityId: string; times: number }>;

  /** Estimated action outcomes. */
  projectedOutcomes: ProjectedOutcome[];

  /** Risk summary. */
  risk: {
    level: 'low' | 'medium' | 'high';
    reasons: string[];
  };

  /** Confidence in the simulation (0-1). */
  confidence: number;

  /** Lookback period. */
  lookbackDays: number;
  /** Total events analyzed. */
  eventsAnalyzed: number;
}

export interface ProjectedOutcome {
  actionType: string;
  nodeId: string;
  wouldExecute: number;
  estimatedSuccess: number;
  estimatedFailure: number;
  failureReasons: string[];
}

// ---- Historical Event Interface ----

/**
 * A historical event for simulation replay.
 * The app layer queries these from the DB.
 */
export interface HistoricalEvent {
  eventType: string;
  entityType: string;
  entityId: string;
  data: Record<string, unknown>;
  occurredAt: Date;
}

/**
 * Callback for estimating action outcomes.
 * The app layer provides this. Default: all succeed.
 */
export type ActionSimulator = (
  actionType: string,
  config: Record<string, unknown>,
  entityData: Record<string, unknown>,
) => { wouldSucceed: boolean; failureReason?: string };

// ---- Simulation Engine ----

/**
 * Simulate an automation against historical events.
 * Read-only — never executes actions.
 *
 * @param request - Simulation parameters
 * @param events - Historical events from the DB
 * @param actionSimulator - Optional callback to estimate action outcomes (default: all succeed)
 */
export function simulateAutomation(
  request: SimulationRequest,
  events: HistoricalEvent[],
  actionSimulator?: ActionSimulator,
): SimulationResult {
  const simulator = actionSimulator ?? defaultSimulator;

  const filtered = events
    .filter(e => e.eventType === request.triggerEventType)
    .slice(0, request.maxEvents ?? 10000);

  // Track deduplication (same entity + same hour)
  const seenKeys = new Set<string>();
  const dailyMap = new Map<string, { fires: number; passes: number }>();
  const entityMap = new Map<string, { entityType: string; entityId: string; times: number }>();
  const outcomeMap = new Map<string, ProjectedOutcome>();

  let fireCount = 0;
  let conditionPassCount = 0;
  let deduplicatedCount = 0;

  // Initialize outcome tracking from DAG action nodes
  for (const node of request.dag.nodes) {
    if (node.type === 'action' && node.action) {
      outcomeMap.set(node.id, {
        actionType: node.action.actionType,
        nodeId: node.id,
        wouldExecute: 0,
        estimatedSuccess: 0,
        estimatedFailure: 0,
        failureReasons: [],
      });
    }
  }

  for (const event of filtered) {
    fireCount++;

    // Track daily breakdown
    const dateKey = event.occurredAt.toISOString().split('T')[0];
    const daily = dailyMap.get(dateKey) ?? { fires: 0, passes: 0 };
    daily.fires++;
    dailyMap.set(dateKey, daily);

    // Deduplication check
    const dedupeKey = `${event.entityType}:${event.entityId}:${event.occurredAt.getUTCHours()}`;
    if (seenKeys.has(dedupeKey)) {
      deduplicatedCount++;
      continue;
    }
    seenKeys.add(dedupeKey);

    // Condition evaluation (simplified — AND within group, OR between groups)
    const conditionsPassed = evaluateSimulatedConditions(request.conditions ?? [], event.data);
    if (!conditionsPassed) continue;

    conditionPassCount++;
    daily.passes++;

    // Track affected entities
    const entityKey = `${event.entityType}:${event.entityId}`;
    const entity = entityMap.get(entityKey) ?? { entityType: event.entityType, entityId: event.entityId, times: 0 };
    entity.times++;
    entityMap.set(entityKey, entity);

    // Project action outcomes
    for (const node of request.dag.nodes) {
      if (node.type !== 'action' || !node.action) continue;
      const outcome = outcomeMap.get(node.id)!;
      outcome.wouldExecute++;

      const estimate = simulator(node.action.actionType, node.action.config, event.data);
      if (estimate.wouldSucceed) {
        outcome.estimatedSuccess++;
      } else {
        outcome.estimatedFailure++;
        if (estimate.failureReason && !outcome.failureReasons.includes(estimate.failureReason)) {
          outcome.failureReasons.push(estimate.failureReason);
        }
      }
    }
  }

  // Compute risk
  const risk = assessSimulationRisk(fireCount, conditionPassCount, [...outcomeMap.values()], request.dag);

  // Compute confidence (higher with more data)
  const confidence = computeConfidence(filtered.length, request.lookbackDays);

  return {
    fireCount,
    conditionPassCount,
    deduplicatedCount,
    dailyBreakdown: [...dailyMap.entries()]
      .map(([date, d]) => ({ date, fires: d.fires, passes: d.passes }))
      .sort((a, b) => a.date.localeCompare(b.date)),
    affectedEntities: [...entityMap.values()].sort((a, b) => b.times - a.times),
    projectedOutcomes: [...outcomeMap.values()],
    risk,
    confidence,
    lookbackDays: request.lookbackDays,
    eventsAnalyzed: filtered.length,
  };
}

// ---- Internal ----

const defaultSimulator: ActionSimulator = () => ({ wouldSucceed: true });

function evaluateSimulatedConditions(
  conditions: Array<{ field: string; comparator: string; value: string; groupIndex: number }>,
  data: Record<string, unknown>,
): boolean {
  if (conditions.length === 0) return true;

  // Group by groupIndex
  const groups = new Map<number, typeof conditions>();
  for (const cond of conditions) {
    const group = groups.get(cond.groupIndex) ?? [];
    group.push(cond);
    groups.set(cond.groupIndex, group);
  }

  // OR between groups (any group passing = overall pass)
  for (const group of groups.values()) {
    let allPass = true;
    for (const cond of group) {
      if (!evaluateSimpleCondition(data, cond)) {
        allPass = false;
        break;
      }
    }
    if (allPass) return true;
  }

  return false;
}

function evaluateSimpleCondition(
  data: Record<string, unknown>,
  cond: { field: string; comparator: string; value: string },
): boolean {
  const actual = getNestedValue(data, cond.field);
  const strActual = String(actual ?? '');

  switch (cond.comparator) {
    case 'EQUALS': return strActual === cond.value;
    case 'NOT_EQUALS': return strActual !== cond.value;
    case 'CONTAINS': return strActual.includes(cond.value);
    case 'NOT_CONTAINS': return !strActual.includes(cond.value);
    case 'IS_EMPTY': return !actual || strActual === '';
    case 'IS_NOT_EMPTY': return !!actual && strActual !== '';
    case 'GREATER_THAN': return Number(actual) > Number(cond.value);
    case 'LESS_THAN': return Number(actual) < Number(cond.value);
    default: return strActual === cond.value;
  }
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

function assessSimulationRisk(
  fireCount: number,
  passCount: number,
  outcomes: ProjectedOutcome[],
  dag: AutomationDag,
): SimulationResult['risk'] {
  const reasons: string[] = [];
  let level: 'low' | 'medium' | 'high' = 'low';

  if (passCount > 100) {
    reasons.push(`High volume: ${passCount} executions projected`);
    level = 'medium';
  }
  if (passCount > 500) {
    level = 'high';
  }

  const totalFailures = outcomes.reduce((sum, o) => sum + o.estimatedFailure, 0);
  const totalExecutions = outcomes.reduce((sum, o) => sum + o.wouldExecute, 0);
  if (totalExecutions > 0 && totalFailures / totalExecutions > 0.1) {
    reasons.push(`${Math.round(totalFailures / totalExecutions * 100)}% projected failure rate`);
    if (level === 'low') level = 'medium';
  }

  const hasIrreversible = dag.nodes.some(n =>
    n.type === 'action' && n.action &&
    (n.action.actionType === 'SEND_EMAIL' || n.action.actionType === 'CALL_WEBHOOK' || n.action.actionType.includes('DELETE'))
  );
  if (hasIrreversible && passCount > 10) {
    reasons.push('Contains irreversible actions (email/webhook/delete) at scale');
    if (level === 'low') level = 'medium';
  }

  if (reasons.length === 0) {
    reasons.push('No significant risks detected');
  }

  return { level, reasons };
}

function computeConfidence(eventCount: number, lookbackDays: number): number {
  // More events + longer window = higher confidence
  const eventConfidence = Math.min(eventCount / 100, 1);
  const timeConfidence = Math.min(lookbackDays / 30, 1);
  return Math.round((eventConfidence * 0.7 + timeConfidence * 0.3) * 100) / 100;
}
