// ===========================================
// ORDINATIO JOBS v1.1 — Queue Health & Posture Tests
// ===========================================

import { describe, it, expect } from 'vitest';
import {
  countStuckJobs,
  getStuckJobs,
  queueNeedsAttention,
  summarizePosture,
  DEFAULT_STUCK_THRESHOLD_MS,
} from '../health';
import type { JobSnapshot, QueuePosture } from '../types';

function makeSnapshot(overrides: Partial<JobSnapshot> = {}): JobSnapshot {
  return {
    id: 'job-1',
    type: 'TEST',
    status: 'running',
    progress: 0,
    attemptsMade: 0,
    data: {},
    ...overrides,
  };
}

function makePosture(overrides: Partial<QueuePosture> = {}): QueuePosture {
  return {
    queueName: 'test-queue',
    connected: true,
    loadLevel: 'low',
    counts: {
      waiting: 0, active: 0, completed: 0, failed: 0,
      delayed: 0, paused: 0, deadLetter: 0, quarantined: 0,
    },
    stuckJobs: 0,
    oldestWaitingMs: 0,
    consecutiveFailures: 0,
    needsAttention: false,
    ...overrides,
  };
}

describe('Queue Health & Posture v1.1', () => {
  // ---- Stuck Jobs ----

  describe('countStuckJobs', () => {
    it('returns 0 for empty list', () => {
      expect(countStuckJobs([])).toBe(0);
    });

    it('returns 0 for jobs without processedAt', () => {
      expect(countStuckJobs([makeSnapshot()])).toBe(0);
    });

    it('counts jobs exceeding threshold', () => {
      const twentyMinAgo = new Date(Date.now() - 20 * 60 * 1000);
      const oneMinAgo = new Date(Date.now() - 60 * 1000);
      const jobs = [
        makeSnapshot({ id: 'stuck', processedAt: twentyMinAgo }),
        makeSnapshot({ id: 'ok', processedAt: oneMinAgo }),
      ];
      expect(countStuckJobs(jobs, DEFAULT_STUCK_THRESHOLD_MS)).toBe(1);
    });

    it('uses custom threshold', () => {
      const threeMinAgo = new Date(Date.now() - 3 * 60 * 1000);
      const jobs = [makeSnapshot({ processedAt: threeMinAgo })];
      expect(countStuckJobs(jobs, 2 * 60 * 1000)).toBe(1);
      expect(countStuckJobs(jobs, 5 * 60 * 1000)).toBe(0);
    });
  });

  describe('getStuckJobs', () => {
    it('returns only stuck jobs', () => {
      const twentyMinAgo = new Date(Date.now() - 20 * 60 * 1000);
      const oneMinAgo = new Date(Date.now() - 60 * 1000);
      const jobs = [
        makeSnapshot({ id: 'stuck', processedAt: twentyMinAgo }),
        makeSnapshot({ id: 'ok', processedAt: oneMinAgo }),
      ];
      const stuck = getStuckJobs(jobs);
      expect(stuck).toHaveLength(1);
      expect(stuck[0].id).toBe('stuck');
    });
  });

  // ---- Needs Attention ----

  describe('queueNeedsAttention', () => {
    it('returns false for healthy queue', () => {
      expect(queueNeedsAttention(makePosture())).toBe(false);
    });

    it('returns true when disconnected', () => {
      expect(queueNeedsAttention(makePosture({ connected: false }))).toBe(true);
    });

    it('returns true when failed > 0', () => {
      expect(queueNeedsAttention(makePosture({
        counts: { waiting: 0, active: 0, completed: 0, failed: 3, delayed: 0, paused: 0, deadLetter: 0, quarantined: 0 },
      }))).toBe(true);
    });

    it('returns true when stuck > 0', () => {
      expect(queueNeedsAttention(makePosture({ stuckJobs: 1 }))).toBe(true);
    });

    it('returns true when quarantined > 0', () => {
      expect(queueNeedsAttention(makePosture({
        counts: { waiting: 0, active: 0, completed: 0, failed: 0, delayed: 0, paused: 0, deadLetter: 0, quarantined: 2 },
      }))).toBe(true);
    });

    it('returns true when waiting exceeds threshold', () => {
      expect(queueNeedsAttention(
        makePosture({ counts: { waiting: 51, active: 0, completed: 0, failed: 0, delayed: 0, paused: 0, deadLetter: 0, quarantined: 0 } }),
        50,
      )).toBe(true);
    });

    it('returns false when waiting is at threshold', () => {
      expect(queueNeedsAttention(
        makePosture({ counts: { waiting: 50, active: 0, completed: 0, failed: 0, delayed: 0, paused: 0, deadLetter: 0, quarantined: 0 } }),
        50,
      )).toBe(false);
    });
  });

  // ---- Posture Summary ----

  describe('summarizePosture', () => {
    it('reports disconnected state', () => {
      expect(summarizePosture(makePosture({ connected: false }))).toContain('DISCONNECTED');
    });

    it('includes load level', () => {
      expect(summarizePosture(makePosture({ loadLevel: 'high' }))).toContain('[high]');
    });

    it('includes basic counts', () => {
      const summary = summarizePosture(makePosture({
        counts: { waiting: 5, active: 2, completed: 100, failed: 1, delayed: 3, paused: 0, deadLetter: 0, quarantined: 0 },
      }));
      expect(summary).toContain('5 waiting');
      expect(summary).toContain('2 active');
      expect(summary).toContain('1 failed');
    });

    it('includes stuck job count', () => {
      expect(summarizePosture(makePosture({ stuckJobs: 3 }))).toContain('3 STUCK');
    });

    it('includes quarantined count', () => {
      expect(summarizePosture(makePosture({
        counts: { waiting: 0, active: 0, completed: 0, failed: 0, delayed: 0, paused: 0, deadLetter: 0, quarantined: 5 },
      }))).toContain('5 QUARANTINED');
    });

    it('includes dead letter count', () => {
      expect(summarizePosture(makePosture({
        counts: { waiting: 0, active: 0, completed: 0, failed: 0, delayed: 0, paused: 0, deadLetter: 4, quarantined: 0 },
      }))).toContain('4 in dead letter');
    });

    it('includes recommended action', () => {
      expect(summarizePosture(makePosture({
        recommendedAction: 'Scale workers immediately',
      }))).toContain('Action: Scale workers immediately');
    });
  });
});
