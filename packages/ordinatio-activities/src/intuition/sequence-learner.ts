// ===========================================
// OPERATIONAL INTUITION — Sequence Learner
// ===========================================
// Mines A->B sequential patterns from historical
// activity data. Pure functions operating on
// activity arrays — no DB, no LLM, no config.
//
// The key insight: every business operation is a
// sequence of activities. Measure -> Fit Profile ->
// Order -> Placement. The system learns these
// sequences automatically and detects when the
// chain breaks.
// ===========================================

import type { ActivityWithRelations } from '../types';
import type { LearnedSequence, IntuitionConfig } from './types';
import { DEFAULT_INTUITION_CONFIG } from './types';

/**
 * A raw observation of action A followed by action B,
 * optionally scoped to the same entity.
 */
interface SequenceObservation {
  fromAction: string;
  toAction: string;
  delayMs: number;
  entityScoped: boolean;
}

/**
 * Learn sequential patterns from historical activity data.
 *
 * Algorithm:
 * 1. For each entity (clientId/orderId), sort activities chronologically
 * 2. For each activity A, find the NEXT activity B within the time window
 * 3. Record the A->B pair and delay
 * 4. Also check global (non-entity-scoped) sequential patterns
 * 5. Aggregate: compute median delay, p90 delay, confidence per pair
 * 6. Filter by minimum occurrences and confidence
 *
 * Returns learned sequences sorted by confidence (highest first).
 */
export function learnSequences(
  activities: ActivityWithRelations[],
  config: IntuitionConfig = {},
): LearnedSequence[] {
  const cfg = { ...DEFAULT_INTUITION_CONFIG, ...config };

  if (activities.length < cfg.minActivitiesForLearning) {
    return [];
  }

  const observations = extractObservations(activities, cfg.maxSequenceDelayMs);
  return aggregateObservations(observations, activities, cfg);
}

/**
 * Extract raw A->B observations from activity data.
 */
function extractObservations(
  activities: ActivityWithRelations[],
  maxDelayMs: number,
): SequenceObservation[] {
  const observations: SequenceObservation[] = [];

  // Group by entity (clientId, orderId)
  const byClient = groupByField(activities, 'clientId');
  const byOrder = groupByField(activities, 'orderId');

  // Entity-scoped sequences (same client or same order)
  for (const [_entityId, entityActivities] of [...byClient, ...byOrder]) {
    const sorted = entityActivities.sort(
      (a, b) => a.createdAt.getTime() - b.createdAt.getTime()
    );

    for (let i = 0; i < sorted.length; i++) {
      const current = sorted[i]!;
      // Look at the next few activities (not just immediate next)
      // to catch cases where intermediate logging steps exist
      const lookahead = Math.min(i + 4, sorted.length);
      for (let j = i + 1; j < lookahead; j++) {
        const next = sorted[j]!;
        if (next.action === current.action) continue; // skip self-loops

        const delayMs = next.createdAt.getTime() - current.createdAt.getTime();
        if (delayMs <= 0 || delayMs > maxDelayMs) continue;

        observations.push({
          fromAction: current.action,
          toAction: next.action,
          delayMs,
          entityScoped: true,
        });
      }
    }
  }

  // Global sequences (action-level, not entity-scoped)
  // Group all activities by action, then check temporal ordering
  const sorted = [...activities].sort(
    (a, b) => a.createdAt.getTime() - b.createdAt.getTime()
  );

  for (let i = 0; i < sorted.length; i++) {
    const current = sorted[i]!;
    // Only look at the immediate next activity globally
    if (i + 1 >= sorted.length) break;
    const next = sorted[i + 1]!;
    if (next.action === current.action) continue;

    const delayMs = next.createdAt.getTime() - current.createdAt.getTime();
    if (delayMs <= 0 || delayMs > maxDelayMs) continue;

    // Only record global if NOT already entity-scoped
    const sameEntity = (current.clientId && current.clientId === next.clientId) ||
                       (current.orderId && current.orderId === next.orderId);
    if (!sameEntity) {
      observations.push({
        fromAction: current.action,
        toAction: next.action,
        delayMs,
        entityScoped: false,
      });
    }
  }

  return observations;
}

/**
 * Aggregate raw observations into learned sequences.
 */
function aggregateObservations(
  observations: SequenceObservation[],
  allActivities: ActivityWithRelations[],
  cfg: Required<IntuitionConfig>,
): LearnedSequence[] {
  // Group by (fromAction, toAction, entityScoped)
  const groups = new Map<string, SequenceObservation[]>();

  for (const obs of observations) {
    const key = `${obs.fromAction}|${obs.toAction}|${obs.entityScoped}`;
    const group = groups.get(key);
    if (group) {
      group.push(obs);
    } else {
      groups.set(key, [obs]);
    }
  }

  // Count total occurrences of each fromAction for confidence calculation
  const fromActionCounts = new Map<string, number>();
  for (const activity of allActivities) {
    fromActionCounts.set(
      activity.action,
      (fromActionCounts.get(activity.action) ?? 0) + 1

    );
  }

  const sequences: LearnedSequence[] = [];

  for (const [key, group] of groups) {
    if (group.length < cfg.minOccurrences) continue;

    const [fromAction, toAction, scopeStr] = key.split('|') as [string, string, string];
    const entityScoped = scopeStr === 'true';
    const delays = group.map(o => o.delayMs).sort((a, b) => a - b);
    const medianDelayMs = median(delays);
    const p90DelayMs = percentile(delays, 0.9);
    const totalFromAction = fromActionCounts.get(fromAction) ?? 1;
    const confidence = group.length / totalFromAction;

    if (confidence < cfg.minConfidence) continue;

    sequences.push({
      fromAction,
      toAction,
      occurrences: group.length,
      medianDelayMs,
      p90DelayMs,
      confidence,
      entityScoped,
    });
  }

  // Sort by confidence descending, then occurrences descending
  return sequences.sort((a, b) =>
    b.confidence - a.confidence || b.occurrences - a.occurrences
  );
}

// ---- Helpers ----

function groupByField(
  activities: ActivityWithRelations[],
  field: 'clientId' | 'orderId',
): Array<[string, ActivityWithRelations[]]> {
  const groups = new Map<string, ActivityWithRelations[]>();
  for (const activity of activities) {
    const value = activity[field];
    if (!value) continue;
    const group = groups.get(value);
    if (group) {
      group.push(activity);
    } else {
      groups.set(value, [activity]);
    }
  }
  return Array.from(groups.entries());
}

function median(sorted: number[]): number {
  if (sorted.length === 0) return 0;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1]! + sorted[mid]!) / 2
    : sorted[mid]!;
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.ceil(p * sorted.length) - 1;
  return sorted[Math.max(0, idx)]!;
}
