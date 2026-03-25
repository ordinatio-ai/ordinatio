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
        if (next.action !== current.action) {
          const delayMs = next.createdAt.getTime() - current.createdAt.getTime();
          // further logic ...
        }
      }
    }
  }
  return observations;
}
