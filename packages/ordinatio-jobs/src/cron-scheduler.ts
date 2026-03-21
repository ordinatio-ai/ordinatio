// ===========================================
// ORDINATIO JOBS v1.1 — Cron Scheduler
// ===========================================
// Named cron jobs with health tracking,
// posture reporting, and failure detection.
// ===========================================

import type { CronJob, CronRegistration, CronPosture, JobCallbacks, HypermediaAction } from './types';
import { jobsError } from './errors';

const cronJobs: CronJob[] = [];
const handlers = new Map<string, () => Promise<void>>();
let intervalId: ReturnType<typeof setInterval> | null = null;
let callbacks: JobCallbacks = {};

/**
 * Parse a simple cron expression to get next run time.
 * Supports "minute hour * * *" format (daily at specific time UTC).
 */
export function getNextRunTime(cronExpression: string): Date {
  const parts = cronExpression.split(' ').map(Number);
  const [minute, hour] = parts;

  if (isNaN(minute) || isNaN(hour)) {
    throw new Error(`Invalid cron expression: "${cronExpression}" — expected "minute hour * * *" format`);
  }

  const now = new Date();
  const next = new Date();
  next.setUTCHours(hour, minute, 0, 0);

  if (next <= now) {
    next.setDate(next.getDate() + 1);
  }

  return next;
}

/**
 * Register a cron job.
 * @throws JOBS_120 if a cron with the same name is already registered.
 */
export function registerCron(registration: CronRegistration): CronJob {
  if (cronJobs.some(j => j.name === registration.name)) {
    const { ref } = jobsError('JOBS_120', { name: registration.name });
    throw new Error(`[${ref}] Cron "${registration.name}" is already registered.`);
  }

  const enabled = registration.enabled ?? true;
  const nextRun = enabled ? getNextRunTime(registration.schedule) : undefined;

  const job: CronJob = {
    name: registration.name,
    schedule: registration.schedule,
    description: registration.description,
    enabled,
    nextRun,
    isRunning: false,
    consecutiveFailures: 0,
    missedRuns: 0,
  };

  cronJobs.push(job);
  handlers.set(registration.name, registration.handler);
  return job;
}

function shouldRunCron(job: CronJob): boolean {
  if (!job.enabled || job.isRunning || !job.nextRun) return false;
  return new Date() >= job.nextRun;
}

async function executeCron(job: CronJob): Promise<void> {
  const handler = handlers.get(job.name);
  if (!handler) return;

  job.isRunning = true;
  job.lastRun = new Date();

  try {
    await handler();
    job.consecutiveFailures = 0;
    job.lastSuccessAt = new Date();
    try { await callbacks.onCronFired?.(job.name); } catch { /* callback errors never propagate */ }
  } catch (error) {
    job.consecutiveFailures++;
    try { await callbacks.onCronFailed?.(job.name, error instanceof Error ? error : new Error(String(error))); } catch { /* callback errors never propagate */ }
  } finally {
    job.isRunning = false;
    job.nextRun = getNextRunTime(job.schedule);
  }
}

/**
 * Start the cron scheduler.
 * Checks registered crons every 60 seconds.
 */
export function startScheduler(jobCallbacks?: JobCallbacks): void {
  if (intervalId) return;
  if (jobCallbacks) callbacks = jobCallbacks;

  intervalId = setInterval(async () => {
    for (const job of cronJobs) {
      if (shouldRunCron(job)) {
        await executeCron(job);
      } else if (job.enabled && job.nextRun && new Date() > new Date(job.nextRun.getTime() + 120_000)) {
        // If we're >2 minutes past nextRun and didn't fire, count as missed
        job.missedRuns++;
      }
    }
  }, 60_000);
}

/** Stop the cron scheduler. */
export function stopScheduler(): void {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
  }
}

/**
 * Manually trigger a cron job by name.
 * @returns true if triggered, false if not found or already running.
 */
export async function triggerCron(name: string): Promise<boolean> {
  const job = cronJobs.find(j => j.name === name);
  if (!job || job.isRunning) return false;
  await executeCron(job);
  return true;
}

/** Enable or disable a cron job. */
export function setCronEnabled(name: string, enabled: boolean): boolean {
  const job = cronJobs.find(j => j.name === name);
  if (!job) return false;

  job.enabled = enabled;
  if (enabled && !job.nextRun) {
    job.nextRun = getNextRunTime(job.schedule);
  }
  return true;
}

/** Get status of all registered cron jobs. */
export function getSchedulerStatus(): {
  running: boolean;
  jobs: CronJob[];
} {
  return {
    running: intervalId !== null,
    jobs: cronJobs.map(j => ({ ...j })),
  };
}

// ---- Cron Posture (Agent Interface) ----

/**
 * Compute the health posture of a cron job.
 * Agents use this to detect degradation.
 */
export function getCronPosture(name: string): CronPosture | null {
  const job = cronJobs.find(j => j.name === name);
  if (!job) return null;

  const health = computeCronHealth(job);
  const recommendedAction = computeCronRecommendation(job, health);

  const actions: Record<string, HypermediaAction> = {};
  if (!job.isRunning) {
    actions.trigger = { intent: 'Manually trigger this cron job' };
  }
  if (!job.enabled) {
    actions.enable = { intent: 'Re-enable this cron job' };
  }
  if (job.enabled) {
    actions.disable = { intent: 'Disable this cron job' };
  }

  return {
    jobName: job.name,
    schedule: job.schedule,
    lastRun: job.lastRun?.getTime(),
    nextRun: job.nextRun?.getTime(),
    lastSuccessAt: job.lastSuccessAt?.getTime(),
    consecutiveFailures: job.consecutiveFailures,
    missedRuns: job.missedRuns,
    health,
    recommendedAction,
    _actions: actions,
  };
}

/**
 * Get posture for all cron jobs.
 */
export function getAllCronPostures(): CronPosture[] {
  return cronJobs.map(j => getCronPosture(j.name)!);
}

function computeCronHealth(job: CronJob): 'healthy' | 'degraded' | 'failing' {
  if (job.consecutiveFailures >= 3 || job.missedRuns >= 3) return 'failing';
  if (job.consecutiveFailures >= 1 || job.missedRuns >= 1) return 'degraded';
  return 'healthy';
}

function computeCronRecommendation(job: CronJob, health: string): string | undefined {
  if (health === 'failing' && job.consecutiveFailures >= 3) {
    return 'Cron has failed 3+ times consecutively. Investigate handler errors.';
  }
  if (health === 'failing' && job.missedRuns >= 3) {
    return 'Cron has missed 3+ scheduled runs. Check if scheduler is running.';
  }
  if (health === 'degraded') {
    return 'Cron has recent failures or missed runs. Monitor closely.';
  }
  return undefined;
}

// ---- Lifecycle ----

/** Deregister a cron job by name. */
export function deregisterCron(name: string): boolean {
  const index = cronJobs.findIndex(j => j.name === name);
  if (index === -1) return false;
  cronJobs.splice(index, 1);
  handlers.delete(name);
  return true;
}

/** Clear all registered crons. Used for testing. */
export function clearCrons(): void {
  cronJobs.length = 0;
  handlers.clear();
  stopScheduler();
  callbacks = {};
}

/** Check if the scheduler is running. */
export function isSchedulerRunning(): boolean {
  return intervalId !== null;
}
