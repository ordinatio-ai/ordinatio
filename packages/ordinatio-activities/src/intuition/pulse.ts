// ===========================================
// OPERATIONAL INTUITION — Pulse
// ===========================================
// The full operational pulse: combines sequence
// learning, missing beat detection, cadence
// analysis, and intent inference into a single
// snapshot of system health.
//
// This is what the agent consumes. One function
// call gives it complete situational awareness.
// ===========================================

import type { ActivityWithRelations } from '../types';
import type {
  OperationalPulse,
  MissingBeat,
  IntuitionConfig,
} from './types';
import { DEFAULT_INTUITION_CONFIG } from './types';
import { learnSequences } from './sequence-learner';
import { detectMissingBeats, prioritizeMissingBeats } from './missing-beats';
import { projectGhosts } from './ghosts';
import { calculateEntropy, detectBotStorm } from './entropy';
import { learnCadence, detectCadenceBreaks, overallCadenceStatus } from './cadence';
import { inferIntents } from './intent-inference';

/**
 * Compute the full operational pulse.
 *
 * This is the single entry point for agents. Feed it the full activity
 * history and it returns a complete picture of:
 * - What's missing (expected actions that haven't happened)
 * - What's unusual (activity rate deviations)
 * - What's in progress (inferred operational intents)
 *
 * @param historicalActivities - Activities from the learning window (e.g., last 90 days)
 * @param recentActivities - Activities from the detection window (e.g., last 24h for cadence)
 * @param now - Current time (injectable for testing)
 * @param config - Tuning parameters
 */
export function computePulse(
  historicalActivities: ActivityWithRelations[],
  recentActivities: ActivityWithRelations[],
  now: Date = new Date(),
  config: IntuitionConfig = {},
): OperationalPulse {
  const cfg = { ...DEFAULT_INTUITION_CONFIG, ...config };

  // 1. Learn sequences from historical data
  const sequences = learnSequences(historicalActivities, cfg);

  // 2. Detect missing beats in the detection window
  const allActivities = [...historicalActivities, ...recentActivities];
  const uniqueActivities = deduplicateById(allActivities);
  const rawMissingBeats = detectMissingBeats(uniqueActivities, sequences, now, cfg);
  const missingBeats = prioritizeMissingBeats(rawMissingBeats, 15);

  // 2b. Project ghosts (expected actions not yet overdue)
  const ghostProjections = projectGhosts(uniqueActivities, sequences, now, cfg);

  // 2c. Calculate entropy on recent activities
  const entropy = calculateEntropy(recentActivities);
  const { isBotStorm: botStormDetected } = detectBotStorm(recentActivities);

  // 3. Learn cadence and detect breaks
  const cadenceProfile = learnCadence(historicalActivities);
  const cadenceBreaks = detectCadenceBreaks(recentActivities, cadenceProfile, now);

  // 4. Infer active intents
  const activeIntents = inferIntents(recentActivities, sequences);

  // 5. Compute summary
  const alarmCount = missingBeats.filter(b => b.urgency === 'alarm').length;
  const nudgeCount = missingBeats.filter(b => b.urgency === 'nudge').length;
  const watchCount = missingBeats.filter(b => b.urgency === 'watch').length;

  return {
    computedAt: now,
    activitiesAnalyzed: uniqueActivities.length,
    missingBeats,
    ghostProjections,
    cadenceBreaks,
    activeIntents,
    summary: {
      totalMissingBeats: missingBeats.length,
      alarmCount,
      nudgeCount,
      watchCount,
      ghostCount: ghostProjections.length,
      entropy,
      botStormDetected,
      cadenceStatus: overallCadenceStatus(cadenceBreaks),
    },
  };
}

/**
 * Generate a concise text summary of the pulse for agent context.
 *
 * Designed to fit in a small token budget while giving the agent
 * everything it needs to act. The agent reads this and knows:
 * - What balls are being dropped
 * - What's unusually quiet
 * - What's in progress and what should happen next
 */
export function summarizeForAgent(pulse: OperationalPulse): string {
  const lines: string[] = [];

  // Header
  lines.push(`Operational Pulse (${pulse.activitiesAnalyzed} activities analyzed)`);

  // Ghost projections
  if (pulse.ghostProjections.length > 0) {
    const highGhosts = pulse.ghostProjections.filter(g => g.urgency === 'HIGH');
    if (highGhosts.length > 0) {
      lines.push(`\nImminent (${highGhosts.length} actions approaching deadline):`);
      for (const ghost of highGhosts.slice(0, 3)) {
        const hoursLeft = Math.round(ghost.countdownMs / (60 * 60 * 1000) * 10) / 10;
        const entity = ghost.entityId ?? 'global';
        lines.push(`  "${ghost.expectedAction}" for ${entity} — ${hoursLeft}h remaining`);
      }
    }
  }

  // Bot storm warning
  if (pulse.summary.botStormDetected) {
    lines.push('\nWARNING: Bot storm detected — low action diversity with uniform timing');
  }

  // Missing beats
  if (pulse.missingBeats.length === 0) {
    lines.push('\nNo missing beats — all expected follow-ups are on track.');
  } else {
    lines.push(`\nMissing Beats (${pulse.summary.totalMissingBeats}):`);
    if (pulse.summary.alarmCount > 0) {
      lines.push(`  ALARM: ${pulse.summary.alarmCount} significantly overdue`);
    }
    if (pulse.summary.nudgeCount > 0) {
      lines.push(`  NUDGE: ${pulse.summary.nudgeCount} worth checking on`);
    }

    // Detail the most urgent ones
    const urgent = pulse.missingBeats.filter(b => b.urgency !== 'watch').slice(0, 5);
    for (const beat of urgent) {
      const entity = beat.triggerActivity.entityLabel ?? beat.triggerActivity.clientId ?? beat.triggerActivity.orderId ?? 'unknown';
      const waitDays = Math.round(beat.waitingMs / (24 * 60 * 60 * 1000) * 10) / 10;
      const expectedDays = Math.round(beat.expectedWithinMs / (24 * 60 * 60 * 1000) * 10) / 10;
      lines.push(
        `  [${beat.urgency.toUpperCase()}] "${beat.triggerActivity.action}" for ${entity} ` +
        `(${waitDays}d ago) — expected "${beat.expectedAction}" within ${expectedDays}d`
      );
    }
  }

  // Cadence
  if (pulse.cadenceBreaks.length > 0) {
    lines.push(`\nCadence: ${pulse.summary.cadenceStatus.toUpperCase()}`);
    for (const brk of pulse.cadenceBreaks.slice(0, 3)) {
      lines.push(`  ${brk.period}: ${brk.actual} activities (expected ~${brk.expected})`);
    }
  }

  // Active intents
  if (pulse.activeIntents.length > 0) {
    lines.push(`\nActive Workflows (${pulse.activeIntents.length}):`);
    for (const intent of pulse.activeIntents.slice(0, 3)) {
      const entity = intent.entityContext.clientId ?? intent.entityContext.orderId ?? 'global';
      const nextActions = intent.predictedNext.map(p =>
        `${p.action} (${Math.round(p.confidence * 100)}%)`
      ).join(', ');
      lines.push(`  ${intent.label} [${entity}]`);
      if (nextActions) {
        lines.push(`    Next expected: ${nextActions}`);
      }
    }
  }

  return lines.join('\n');
}

/**
 * Quick check: does the pulse contain anything the agent should act on?
 */
export function pulseNeedsAttention(pulse: OperationalPulse): boolean {
  return (
    pulse.summary.alarmCount > 0 ||
    pulse.summary.nudgeCount > 0 ||
    pulse.summary.botStormDetected ||
    pulse.ghostProjections.some(g => g.urgency === 'HIGH') ||
    pulse.summary.cadenceStatus === 'silent' ||
    pulse.summary.cadenceStatus === 'unusual'
  );
}

/**
 * Get missing beats grouped by entity for agent tools.
 */
export function getMissingBeatsByEntity(
  beats: MissingBeat[],
): Map<string, MissingBeat[]> {
  const byEntity = new Map<string, MissingBeat[]>();

  for (const beat of beats) {
    const key = beat.triggerActivity.clientId
      ?? beat.triggerActivity.orderId
      ?? 'unscoped';
    const group = byEntity.get(key);
    if (group) {
      group.push(beat);
    } else {
      byEntity.set(key, [beat]);
    }
  }

  return byEntity;
}

// ---- Helpers ----

function deduplicateById(
  activities: ActivityWithRelations[],
): ActivityWithRelations[] {
  const seen = new Set<string>();
  return activities.filter(a => {
    if (seen.has(a.id)) return false;
    seen.add(a.id);
    return true;
  });
}
