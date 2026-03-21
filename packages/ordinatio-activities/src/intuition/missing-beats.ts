// ===========================================
// OPERATIONAL INTUITION — Missing Beat Detection
// ===========================================
// The heart of Operational Intuition.
//
// A "missing beat" is when action A happened but
// the expected follow-up action B hasn't arrived
// within the learned time window.
//
// This detects the most dangerous class of failures:
// ones where nothing technically "broke" — the system
// just silently stopped doing the next thing.
//
// Examples:
//   - Client measured 4 days ago, no fit profile created
//   - Placement failed 6 hours ago, nobody retried
//   - Order created a week ago, still in DRAFT
//   - Email linked to client, but no follow-up task
// ===========================================

import type { ActivityWithRelations } from '../types';
import type { LearnedSequence, MissingBeat, IntuitionConfig } from './types';
import { DEFAULT_INTUITION_CONFIG } from './types';

/**
 * Detect missing beats: actions that were expected but haven't happened.
 *
 * Algorithm:
 * 1. For each learned sequence (A->B), find recent A activities
 * 2. For each A activity, check if B has occurred within the expected window
 * 3. If B hasn't occurred and we're past the p90 threshold, flag it
 * 4. Classify urgency based on how overdue and sequence confidence
 *
 * @param activities - Recent activities to scan (should include detection window)
 * @param sequences - Learned sequences from `learnSequences()`
 * @param now - Current time (injectable for testing)
 * @param config - Tuning parameters
 */
export function detectMissingBeats(
  activities: ActivityWithRelations[],
  sequences: LearnedSequence[],
  now: Date = new Date(),
  config: IntuitionConfig = {},
): MissingBeat[] {
  const cfg = { ...DEFAULT_INTUITION_CONFIG, ...config };
  const detectionCutoff = now.getTime() - cfg.detectionWindowDays * 24 * 60 * 60 * 1000;

  const missingBeats: MissingBeat[] = [];

  for (const seq of sequences) {
    const beats = findMissingBeatsForSequence(
      activities, seq, now, detectionCutoff
    );
    missingBeats.push(...beats);
  }

  // Sort by urgency (alarm > nudge > watch), then by overdueRatio descending
  return missingBeats.sort((a, b) => {
    const urgencyOrder = { alarm: 0, nudge: 1, watch: 2 };
    const urgencyDiff = urgencyOrder[a.urgency] - urgencyOrder[b.urgency];
    if (urgencyDiff !== 0) return urgencyDiff;
    return b.overdueRatio - a.overdueRatio;
  });
}

/**
 * Find missing beats for a single learned sequence.
 */
function findMissingBeatsForSequence(
  activities: ActivityWithRelations[],
  sequence: LearnedSequence,
  now: Date,
  detectionCutoff: number,
): MissingBeat[] {
  const beats: MissingBeat[] = [];

  // Find all trigger activities (action A) in the detection window
  const triggerActivities = activities.filter(a =>
    a.action === sequence.fromAction &&
    a.createdAt.getTime() >= detectionCutoff
  );

  for (const trigger of triggerActivities) {
    const triggerTime = trigger.createdAt.getTime();
    const waitingMs = now.getTime() - triggerTime;

    // Not overdue yet — skip
    if (waitingMs < sequence.p90DelayMs) continue;

    // Check if the expected follow-up has already occurred
    const followUpExists = activities.some(a => {
      if (a.action !== sequence.toAction) return false;
      if (a.createdAt.getTime() <= triggerTime) return false;

      // If entity-scoped, the follow-up must be for the same entity
      if (sequence.entityScoped) {
        const sameClient = trigger.clientId && a.clientId === trigger.clientId;
        const sameOrder = trigger.orderId && a.orderId === trigger.orderId;
        return sameClient || sameOrder;
      }

      return true; // Global sequence — any occurrence counts
    });

    if (followUpExists) continue;

    // This is a missing beat
    const overdueRatio = waitingMs / sequence.p90DelayMs;

    beats.push({
      triggerActivity: {
        id: trigger.id,
        action: trigger.action,
        createdAt: trigger.createdAt,
        orderId: trigger.orderId,
        clientId: trigger.clientId,
        description: trigger.description,
        entityLabel: trigger.client?.name ?? trigger.order?.orderNumber ?? null,
      },
      expectedAction: sequence.toAction,
      expectedWithinMs: sequence.p90DelayMs,
      waitingMs,
      overdueRatio,
      sequence,
      urgency: classifyUrgency(overdueRatio, sequence.confidence),
    });
  }

  return beats;
}

/**
 * Classify how urgent a missing beat is.
 *
 * - watch:  1.0-2.0x overdue, or low confidence sequence. Worth knowing.
 * - nudge:  2.0-5.0x overdue with decent confidence. Agent should mention it.
 * - alarm:  >5.0x overdue with high confidence. Something is clearly dropped.
 *
 * High confidence sequences escalate faster.
 */
function classifyUrgency(
  overdueRatio: number,
  confidence: number,
): 'watch' | 'nudge' | 'alarm' {
  // High confidence sequences are more alarming when overdue
  const adjustedRatio = overdueRatio * (0.5 + confidence);

  if (adjustedRatio >= 3.0) return 'alarm';
  if (adjustedRatio >= 1.5) return 'nudge';
  return 'watch';
}

/**
 * Filter missing beats to only the most actionable ones.
 * Deduplicates when multiple sequences flag the same trigger activity.
 */
export function prioritizeMissingBeats(
  beats: MissingBeat[],
  maxResults = 10,
): MissingBeat[] {
  // Deduplicate: for each trigger activity, keep only the most urgent beat
  const byTrigger = new Map<string, MissingBeat>();
  for (const beat of beats) {
    const existing = byTrigger.get(beat.triggerActivity.id);
    if (!existing || urgencyRank(beat.urgency) < urgencyRank(existing.urgency)) {
      byTrigger.set(beat.triggerActivity.id, beat);
    }
  }

  return Array.from(byTrigger.values())
    .sort((a, b) => {
      const urgencyDiff = urgencyRank(a.urgency) - urgencyRank(b.urgency);
      if (urgencyDiff !== 0) return urgencyDiff;
      return b.overdueRatio - a.overdueRatio;
    })
    .slice(0, maxResults);
}

function urgencyRank(u: 'watch' | 'nudge' | 'alarm'): number {
  return { alarm: 0, nudge: 1, watch: 2 }[u];
}
