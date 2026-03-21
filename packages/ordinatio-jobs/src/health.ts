// ===========================================
// ORDINATIO JOBS v1.1 — Queue Health & Posture
// ===========================================
// Deterministic queue health monitoring with
// load assessment, failure trends, stuck
// detection, and agent-readable posture.
// ===========================================

import type { QueuePosture, QueueClient, JobSnapshot, HypermediaAction } from './types';

/** Default threshold for considering a job "stuck" (10 minutes). */
export const DEFAULT_STUCK_THRESHOLD_MS = 10 * 60 * 1000;

/**
 * Compute full queue posture for agents.
 * Includes load level, failure trends, and recommended actions.
 */
export async function computeQueuePosture(
  client: QueueClient,
  stuckThresholdMs: number = DEFAULT_STUCK_THRESHOLD_MS,
): Promise<QueuePosture> {
  const raw = await client.getHealth();
  const active = await client.getActive();
  const stuckCount = countStuckJobs(active, stuckThresholdMs);

  const waitingMs = computeOldestWaitingAge(await client.getWaiting(1));
  const loadLevel = assessLoadLevel(raw.counts.waiting, raw.counts.active);
  const needsAttention = computeNeedsAttention(raw, stuckCount);
  const recommendedAction = computeRecommendation(raw, stuckCount, loadLevel);

  const actions: Record<string, HypermediaAction> = {};
  if (stuckCount > 0) {
    actions.sweep_stuck = { intent: 'Reset stuck jobs to waiting state' };
  }
  if (raw.counts.failed > 0) {
    actions.retry_failed = { intent: 'Retry all failed jobs' };
    actions.purge_failed = { intent: 'Remove all failed jobs' };
  }
  if (raw.counts.waiting > 100) {
    actions.drain = { intent: 'Remove all waiting jobs (destructive)' };
  }

  return {
    queueName: raw.queueName,
    connected: raw.connected,
    loadLevel,
    counts: raw.counts,
    stuckJobs: stuckCount,
    oldestWaitingMs: waitingMs,
    consecutiveFailures: 0, // Tracked externally by the application
    needsAttention,
    recommendedAction,
    _actions: Object.keys(actions).length > 0 ? actions : undefined,
  };
}

/**
 * Count jobs that appear stuck (active for longer than threshold).
 */
export function countStuckJobs(
  activeJobs: JobSnapshot[],
  thresholdMs: number = DEFAULT_STUCK_THRESHOLD_MS,
): number {
  const now = Date.now();
  return activeJobs.filter(job => {
    if (!job.processedAt) return false;
    return now - job.processedAt.getTime() > thresholdMs;
  }).length;
}

/**
 * Get stuck jobs (active for longer than threshold).
 */
export function getStuckJobs(
  activeJobs: JobSnapshot[],
  thresholdMs: number = DEFAULT_STUCK_THRESHOLD_MS,
): JobSnapshot[] {
  const now = Date.now();
  return activeJobs.filter(job => {
    if (!job.processedAt) return false;
    return now - job.processedAt.getTime() > thresholdMs;
  });
}

/**
 * Check if a queue needs attention.
 */
export function queueNeedsAttention(
  posture: QueuePosture,
  waitingThreshold: number = 50,
): boolean {
  return computeNeedsAttention(posture, posture.stuckJobs, waitingThreshold);
}

function computeNeedsAttention(
  posture: Pick<QueuePosture, 'connected' | 'counts'>,
  stuckCount: number,
  waitingThreshold: number = 50,
): boolean {
  return (
    !posture.connected ||
    posture.counts.failed > 0 ||
    stuckCount > 0 ||
    posture.counts.waiting > waitingThreshold ||
    posture.counts.quarantined > 0
  );
}

/**
 * Summarize queue posture for LLM agent context windows.
 * Returns a compact string suitable for prompt injection.
 */
export function summarizePosture(posture: QueuePosture): string {
  if (!posture.connected) {
    return `DISCONNECTED — ${posture.queueName} queue is not connected to Redis`;
  }

  const parts: string[] = [];
  const { waiting, active, completed, failed, delayed, deadLetter, quarantined } = posture.counts;

  parts.push(`${posture.queueName} [${posture.loadLevel}]: ${waiting} waiting, ${active} active, ${failed} failed`);

  if (posture.stuckJobs > 0) {
    parts.push(`${posture.stuckJobs} STUCK jobs need immediate attention`);
  }
  if (quarantined > 0) {
    parts.push(`${quarantined} QUARANTINED (never auto-retry)`);
  }
  if (deadLetter > 0) {
    parts.push(`${deadLetter} in dead letter`);
  }
  if (delayed > 0) {
    parts.push(`${delayed} delayed`);
  }
  if (completed > 0) {
    parts.push(`${completed} completed (last 24h)`);
  }
  if (posture.recommendedAction) {
    parts.push(`Action: ${posture.recommendedAction}`);
  }

  return parts.join('. ');
}

// ---- Internal helpers ----

function assessLoadLevel(waiting: number, active: number): 'low' | 'medium' | 'high' {
  const total = waiting + active;
  if (total > 100) return 'high';
  if (total > 20) return 'medium';
  return 'low';
}

function computeOldestWaitingAge(waitingJobs: JobSnapshot[]): number {
  if (waitingJobs.length === 0) return 0;
  const oldest = waitingJobs[0];
  if (!oldest.createdAt) return 0;
  return Date.now() - oldest.createdAt.getTime();
}

function computeRecommendation(
  posture: Pick<QueuePosture, 'connected' | 'counts'>,
  stuckCount: number,
  loadLevel: string,
): string | undefined {
  if (!posture.connected) return 'Reconnect to Redis immediately.';
  if (stuckCount > 0) return `Sweep ${stuckCount} stuck jobs or investigate worker health.`;
  if (posture.counts.quarantined > 0) return 'Review quarantined jobs — manual investigation required.';
  if (posture.counts.failed > 5) return 'Multiple failures detected. Review error patterns.';
  if (loadLevel === 'high') return 'Queue load is high. Consider scaling workers.';
  return undefined;
}
