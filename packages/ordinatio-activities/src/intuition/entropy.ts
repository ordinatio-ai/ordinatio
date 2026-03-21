// ===========================================
// OPERATIONAL INTUITION — Shannon Entropy
// ===========================================
// Measures the "randomness" of the activity stream.
//
// Healthy systems have moderate entropy: a mix of
// different action types across natural intervals.
//
// Unhealthy signals:
// - Near-zero entropy: one action type dominating
//   (possible bot loop, stuck automation, spam)
// - Combined with uniform inter-arrival times:
//   bot storm (automated, not human)
// ===========================================

import type { ActivityWithRelations } from '../types';

/** Entropy below this suggests bot-like behavior */
export const ENTROPY_BOT_THRESHOLD = 0.5;

/** Entropy above this is considered healthy diversity */
export const ENTROPY_HEALTHY_THRESHOLD = 2.0;

/**
 * Calculate Shannon entropy over the action type distribution.
 *
 * H = -sum(p_i * log2(p_i)) where p_i = count_of_action_i / total
 *
 * - 0.0: all events are the same action
 * - log2(N): perfectly uniform across N action types
 *
 * @returns Entropy in bits. 0 for empty input.
 */
export function calculateEntropy(activities: ActivityWithRelations[]): number {
  if (activities.length <= 1) return 0;

  const counts = new Map<string, number>();
  for (const a of activities) {
    counts.set(a.action, (counts.get(a.action) ?? 0) + 1);
  }

  const total = activities.length;
  let entropy = 0;

  for (const count of counts.values()) {
    const p = count / total;
    if (p > 0) {
      entropy -= p * Math.log2(p);
    }
  }

  return entropy;
}

/**
 * Bot storm detection: combines low entropy with uniform timing.
 *
 * A bot storm is characterized by:
 * 1. Low action diversity (entropy < threshold)
 * 2. Uniform inter-arrival times (low coefficient of variation)
 * 3. High burst rate (many events in a short window)
 */
export function detectBotStorm(
  activities: ActivityWithRelations[],
  windowMs: number = 60 * 60 * 1000, // default 1 hour
): { isBotStorm: boolean; entropy: number; dominantAction: string | null; burstRate: number } {
  if (activities.length < 10) {
    return { isBotStorm: false, entropy: 0, dominantAction: null, burstRate: 0 };
  }

  // Filter to window
  const now = Math.max(...activities.map(a => a.createdAt.getTime()));
  const windowStart = now - windowMs;
  const windowed = activities.filter(a => a.createdAt.getTime() >= windowStart);

  if (windowed.length < 10) {
    return { isBotStorm: false, entropy: 0, dominantAction: null, burstRate: 0 };
  }

  const entropy = calculateEntropy(windowed);
  const burstRate = windowed.length / (windowMs / 1000); // events per second

  // Find dominant action
  const counts = new Map<string, number>();
  for (const a of windowed) {
    counts.set(a.action, (counts.get(a.action) ?? 0) + 1);
  }
  let dominantAction: string | null = null;
  let maxCount = 0;
  for (const [action, count] of counts) {
    if (count > maxCount) {
      maxCount = count;
      dominantAction = action;
    }
  }

  // Check inter-arrival time uniformity (coefficient of variation)
  const sorted = windowed
    .map(a => a.createdAt.getTime())
    .sort((a, b) => a - b);
  const intervals: number[] = [];
  for (let i = 1; i < sorted.length; i++) {
    intervals.push(sorted[i]! - sorted[i - 1]!);
  }

  let isUniformTiming = false;
  if (intervals.length >= 5) {
    const mean = intervals.reduce((s, v) => s + v, 0) / intervals.length;
    if (mean > 0) {
      const variance = intervals.reduce((s, v) => s + (v - mean) ** 2, 0) / intervals.length;
      const cv = Math.sqrt(variance) / mean; // coefficient of variation
      isUniformTiming = cv < 0.3; // very regular intervals
    }
  }

  const isBotStorm = entropy < ENTROPY_BOT_THRESHOLD && isUniformTiming;

  return { isBotStorm, entropy, dominantAction, burstRate };
}
