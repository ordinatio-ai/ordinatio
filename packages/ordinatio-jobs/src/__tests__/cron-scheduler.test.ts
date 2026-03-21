// ===========================================
// ORDINATIO JOBS v1.1 — Cron Scheduler Tests
// ===========================================

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  registerCron,
  getSchedulerStatus,
  triggerCron,
  setCronEnabled,
  deregisterCron,
  clearCrons,
  getNextRunTime,
  startScheduler,
  stopScheduler,
  isSchedulerRunning,
  getCronPosture,
  getAllCronPostures,
} from '../cron-scheduler';

describe('Cron Scheduler v1.1', () => {
  beforeEach(() => {
    clearCrons();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ---- getNextRunTime ----

  describe('getNextRunTime', () => {
    it('parses "0 6 * * *" (6 AM UTC)', () => {
      vi.setSystemTime(new Date('2026-03-19T03:00:00Z'));
      const next = getNextRunTime('0 6 * * *');
      expect(next.getUTCHours()).toBe(6);
      expect(next.getUTCMinutes()).toBe(0);
      expect(next.getUTCDate()).toBe(19);
    });

    it('schedules tomorrow if time has passed', () => {
      vi.setSystemTime(new Date('2026-03-19T10:00:00Z'));
      const next = getNextRunTime('0 6 * * *');
      expect(next.getUTCDate()).toBe(20);
    });

    it('throws on invalid expression', () => {
      expect(() => getNextRunTime('invalid')).toThrow('Invalid cron expression');
    });
  });

  // ---- Registration ----

  describe('registerCron', () => {
    it('registers a cron with health tracking fields', () => {
      const handler = vi.fn().mockResolvedValue(undefined);
      const job = registerCron({
        name: 'stock-sync',
        schedule: '0 6 * * *',
        description: 'Sync fabric stock daily',
        handler,
      });

      expect(job.name).toBe('stock-sync');
      expect(job.enabled).toBe(true);
      expect(job.isRunning).toBe(false);
      expect(job.consecutiveFailures).toBe(0);
      expect(job.missedRuns).toBe(0);
    });

    it('throws JOBS_120 on duplicate name', () => {
      const handler = vi.fn().mockResolvedValue(undefined);
      registerCron({ name: 'dup', schedule: '0 0 * * *', handler });
      expect(() => registerCron({ name: 'dup', schedule: '0 0 * * *', handler })).toThrow('JOBS_120');
    });
  });

  // ---- Manual Trigger ----

  describe('triggerCron', () => {
    it('triggers and resets consecutiveFailures on success', async () => {
      const handler = vi.fn().mockResolvedValue(undefined);
      registerCron({ name: 'ok', schedule: '0 6 * * *', handler });

      await triggerCron('ok');
      expect(handler).toHaveBeenCalledOnce();

      const posture = getCronPosture('ok')!;
      expect(posture.consecutiveFailures).toBe(0);
      expect(posture.health).toBe('healthy');
    });

    it('increments consecutiveFailures on error', async () => {
      const handler = vi.fn().mockRejectedValue(new Error('boom'));
      registerCron({ name: 'fail', schedule: '0 6 * * *', handler });

      await triggerCron('fail');
      expect(getCronPosture('fail')!.consecutiveFailures).toBe(1);
      expect(getCronPosture('fail')!.health).toBe('degraded');

      await triggerCron('fail');
      await triggerCron('fail');
      expect(getCronPosture('fail')!.consecutiveFailures).toBe(3);
      expect(getCronPosture('fail')!.health).toBe('failing');
    });

    it('tracks lastSuccessAt on success', async () => {
      vi.setSystemTime(new Date('2026-03-19T10:00:00Z'));
      const handler = vi.fn().mockResolvedValue(undefined);
      registerCron({ name: 'tracked', schedule: '0 6 * * *', handler });

      await triggerCron('tracked');

      const posture = getCronPosture('tracked')!;
      expect(posture.lastSuccessAt).toBe(new Date('2026-03-19T10:00:00Z').getTime());
    });

    it('returns false for nonexistent cron', async () => {
      expect(await triggerCron('nope')).toBe(false);
    });

    it('returns false if already running', async () => {
      let resolve: () => void;
      const handler = vi.fn().mockImplementation(
        () => new Promise<void>(r => { resolve = r; }),
      );
      registerCron({ name: 'slow', schedule: '0 6 * * *', handler });

      const promise = triggerCron('slow');
      const result2 = await triggerCron('slow');
      expect(result2).toBe(false);

      resolve!();
      await promise;
    });
  });

  // ---- Enable/Disable ----

  describe('setCronEnabled', () => {
    it('enables a disabled cron', () => {
      const handler = vi.fn().mockResolvedValue(undefined);
      registerCron({ name: 'toggle', schedule: '0 6 * * *', handler, enabled: false });

      expect(setCronEnabled('toggle', true)).toBe(true);
      const status = getSchedulerStatus();
      expect(status.jobs.find(j => j.name === 'toggle')!.enabled).toBe(true);
    });

    it('returns false for nonexistent cron', () => {
      expect(setCronEnabled('nope', true)).toBe(false);
    });
  });

  // ---- Scheduler Lifecycle ----

  describe('startScheduler / stopScheduler', () => {
    it('starts and stops the scheduler', () => {
      startScheduler();
      expect(isSchedulerRunning()).toBe(true);
      stopScheduler();
      expect(isSchedulerRunning()).toBe(false);
    });

    it('fires callbacks on cron execution', async () => {
      const onCronFired = vi.fn().mockResolvedValue(undefined);
      const handler = vi.fn().mockResolvedValue(undefined);

      vi.setSystemTime(new Date('2026-03-19T05:59:00Z'));
      registerCron({ name: 'cb-test', schedule: '0 6 * * *', handler });

      startScheduler({ onCronFired });

      vi.setSystemTime(new Date('2026-03-19T06:00:30Z'));
      await vi.advanceTimersByTimeAsync(60_000);

      expect(handler).toHaveBeenCalled();
      expect(onCronFired).toHaveBeenCalledWith('cb-test');
      stopScheduler();
    });

    it('fires onCronFailed callback on handler error', async () => {
      const onCronFailed = vi.fn().mockResolvedValue(undefined);
      const handler = vi.fn().mockRejectedValue(new Error('boom'));

      vi.setSystemTime(new Date('2026-03-19T05:59:00Z'));
      registerCron({ name: 'fail-test', schedule: '0 6 * * *', handler });

      startScheduler({ onCronFailed });

      vi.setSystemTime(new Date('2026-03-19T06:00:30Z'));
      await vi.advanceTimersByTimeAsync(60_000);

      expect(onCronFailed).toHaveBeenCalledWith('fail-test', expect.any(Error));
      stopScheduler();
    });
  });

  // ---- Cron Posture (Agent Interface) ----

  describe('getCronPosture', () => {
    it('returns null for nonexistent cron', () => {
      expect(getCronPosture('ghost')).toBeNull();
    });

    it('returns healthy posture for new cron', () => {
      const handler = vi.fn().mockResolvedValue(undefined);
      registerCron({ name: 'fresh', schedule: '0 6 * * *', handler });

      const posture = getCronPosture('fresh')!;
      expect(posture.health).toBe('healthy');
      expect(posture.consecutiveFailures).toBe(0);
      expect(posture.missedRuns).toBe(0);
      expect(posture.recommendedAction).toBeUndefined();
    });

    it('returns degraded posture after 1 failure', async () => {
      const handler = vi.fn().mockRejectedValue(new Error('fail'));
      registerCron({ name: 'degraded', schedule: '0 6 * * *', handler });

      await triggerCron('degraded');

      const posture = getCronPosture('degraded')!;
      expect(posture.health).toBe('degraded');
      expect(posture.recommendedAction).toContain('Monitor');
    });

    it('returns failing posture after 3+ failures', async () => {
      const handler = vi.fn().mockRejectedValue(new Error('fail'));
      registerCron({ name: 'failing', schedule: '0 6 * * *', handler });

      await triggerCron('failing');
      await triggerCron('failing');
      await triggerCron('failing');

      const posture = getCronPosture('failing')!;
      expect(posture.health).toBe('failing');
      expect(posture.recommendedAction).toContain('Investigate');
    });

    it('includes hypermedia actions', () => {
      const handler = vi.fn().mockResolvedValue(undefined);
      registerCron({ name: 'actions', schedule: '0 6 * * *', handler });

      const posture = getCronPosture('actions')!;
      expect(posture._actions).toBeDefined();
      expect(posture._actions!.trigger).toBeDefined();
      expect(posture._actions!.disable).toBeDefined();
    });

    it('shows enable action for disabled crons', () => {
      const handler = vi.fn().mockResolvedValue(undefined);
      registerCron({ name: 'off', schedule: '0 6 * * *', handler, enabled: false });

      const posture = getCronPosture('off')!;
      expect(posture._actions!.enable).toBeDefined();
    });
  });

  describe('getAllCronPostures', () => {
    it('returns postures for all crons', () => {
      const handler = vi.fn().mockResolvedValue(undefined);
      registerCron({ name: 'a', schedule: '0 1 * * *', handler });
      registerCron({ name: 'b', schedule: '30 2 * * *', handler });

      const postures = getAllCronPostures();
      expect(postures).toHaveLength(2);
      expect(postures.map(p => p.jobName)).toEqual(['a', 'b']);
    });
  });

  // ---- Deregistration ----

  describe('deregisterCron / clearCrons', () => {
    it('removes a cron', () => {
      const handler = vi.fn().mockResolvedValue(undefined);
      registerCron({ name: 'remove-me', schedule: '0 0 * * *', handler });
      expect(deregisterCron('remove-me')).toBe(true);
      expect(getSchedulerStatus().jobs).toHaveLength(0);
    });

    it('clears all and stops scheduler', () => {
      const handler = vi.fn().mockResolvedValue(undefined);
      registerCron({ name: 'a', schedule: '0 1 * * *', handler });
      startScheduler();

      clearCrons();
      expect(getSchedulerStatus().jobs).toHaveLength(0);
      expect(isSchedulerRunning()).toBe(false);
    });
  });
});
