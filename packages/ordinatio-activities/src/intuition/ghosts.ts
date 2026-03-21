// ===========================================
// OPERATIONAL INTUITION — Ghost Projection Engine
// ===========================================
// Predicts future missing beats BEFORE they happen.
//
// A "ghost" is a follow-up action that hasn't arrived
// yet but isn't overdue either. It's the shadow of
// a missing beat: still within the expected window,
// but the clock is ticking.
//
// This fills the gap between "everything's fine" and
// "something's overdue" — giving the agent advance
// warning to prevent problems instead of reacting.
//
// Missing beats: waitingMs >= p90 (overdue)
// Ghosts:        waitingMs < p90 (not yet due, but expected)
// ===========================================

import type { ActivityWithRelations } from '../types';
import type { LearnedSequence, IntuitionConfig } from './types';
import { DEFAULT_INTUITION_CONFIG } from './types';

/**
 * A projected future activity that hasn't arrived yet
 * but is expected based on learned sequences.
 */
export interface GhostProjection {
  /** ID of the trigger activity that started the clock */
  triggerId: string;
  /** The action we expect to see */
  expectedAction: string;
  /** Entity this ghost relates to */
  entityId: string | null;
  /** Entity type */
  entityType: 'client' | 'order' | null;
  /** When this ghost becomes a missing beat (trigger.createdAt + p90) */
  projectionTimestamp: Date;
  /** Milliseconds remaining until overdue (>0 = not yet due) */
  countdownMs: number;
  /** Confidence from the learned sequence */
  confidence: number;
  /** Urgency based on countdown percentage remaining */
  urgency: 'LOW' | 'MEDIUM' | 'HIGH';
  /** The learned sequence that generated this projection */
  sequence: LearnedSequence;
}

/**
 * Project ghosts: expected follow-up actions that haven't arrived
 * but aren't overdue yet.
 *
 * Mirrors `detectMissingBeats` but inverts the filter:
 * - Missing beats: waitingMs >= p90 → overdue
 * - Ghosts: waitingMs < p90 → not yet due, but ticking
 */
export function projectGhosts(
  activities: ActivityWithRelations[],
  sequences: LearnedSequence[],
  now: Date = new Date(),
  config: IntuitionConfig = {},
): GhostProjection[] {
  const cfg = { ...DEFAULT_INTUITION_CONFIG, ...config };
  const detectionCutoff = now.getTime() - cfg.detectionWindowDays * 24 * 60 * 60 * 1000;
  const ghosts: GhostProjection[] = [];

  for (const seq of sequences) {
    // Skip low-confidence sequences
    if (seq.confidence < cfg.minConfidence) continue;

    // Find trigger activities in the detection window
    const triggers = activities.filter(a =>
      a.action === seq.fromAction &&
      a.createdAt.getTime() >= detectionCutoff
    );

    for (const trigger of triggers) {
      const triggerTime = trigger.createdAt.getTime();
      const waitingMs = now.getTime() - triggerTime;

      // Skip if already overdue (that's a missing beat, not a ghost)
      if (waitingMs >= seq.p90DelayMs) continue;

      // Skip if waiting time is negative (future trigger — shouldn't happen but be safe)
      if (waitingMs <= 0) continue;

      // Check if the follow-up already exists
      const followUpExists = activities.some(a => {
        if (a.action !== seq.toAction) return false;
        if (a.createdAt.getTime() <= triggerTime) return false;

        if (seq.entityScoped) {
          const sameClient = trigger.clientId && a.clientId === trigger.clientId;
          const sameOrder = trigger.orderId && a.orderId === trigger.orderId;
          return sameClient || sameOrder;
        }

        return true;
      });

      if (followUpExists) continue;

      const projectionTimestamp = new Date(triggerTime + seq.p90DelayMs);
      const countdownMs = seq.p90DelayMs - waitingMs;

      ghosts.push({
        triggerId: trigger.id,
        expectedAction: seq.toAction,
        entityId: trigger.clientId ?? trigger.orderId ?? null,
        entityType: trigger.clientId ? 'client' : trigger.orderId ? 'order' : null,
        projectionTimestamp,
        countdownMs,
        confidence: seq.confidence,
        urgency: classifyGhostUrgency(countdownMs, seq.p90DelayMs, seq.confidence),
        sequence: seq,
      });
    }
  }

  // Sort by urgency (HIGH > MEDIUM > LOW), then countdown ascending
  return ghosts.sort((a, b) => {
    const urgencyOrder = { HIGH: 0, MEDIUM: 1, LOW: 2 };
    const urgencyDiff = urgencyOrder[a.urgency] - urgencyOrder[b.urgency];
    if (urgencyDiff !== 0) return urgencyDiff;
    return a.countdownMs - b.countdownMs;
  });
}

/**
 * Classify ghost urgency by how much of the expected window remains.
 *
 * - HIGH: <20% remaining (almost overdue)
 * - MEDIUM: 20-50% remaining
 * - LOW: >50% remaining (plenty of time)
 *
 * High-confidence sequences escalate faster via a confidence multiplier.
 */
function classifyGhostUrgency(
  countdownMs: number,
  p90DelayMs: number,
  confidence: number,
): 'LOW' | 'MEDIUM' | 'HIGH' {
  if (p90DelayMs <= 0) return 'LOW';
  const remainingPct = countdownMs / p90DelayMs;

  // High confidence sequences escalate: 0.8 conf → thresholds shift up by 0.3
  const confidenceShift = Math.max(0, (confidence - 0.5)) * 0.6;
  const adjustedPct = remainingPct - confidenceShift;

  if (adjustedPct < 0.2) return 'HIGH';
  if (adjustedPct < 0.5) return 'MEDIUM';
  return 'LOW';
}
