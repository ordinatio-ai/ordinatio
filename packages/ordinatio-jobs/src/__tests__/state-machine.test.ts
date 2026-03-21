// ===========================================
// ORDINATIO JOBS v1.1 — State Machine Tests
// ===========================================

import { describe, it, expect } from 'vitest';
import {
  VALID_TRANSITIONS,
  isValidTransition,
  isTerminal,
  getTerminalStates,
  blocksAutoRetry,
  getNextStates,
  getAllStatuses,
} from '../state-machine';
import type { JobStatus } from '../types';

describe('State Machine', () => {

  // ---- Transition Map ----

  describe('VALID_TRANSITIONS', () => {
    it('defines transitions for all 8 statuses', () => {
      const statuses: JobStatus[] = ['pending', 'running', 'completed', 'failed', 'delayed', 'paused', 'dead_letter', 'quarantined'];
      for (const s of statuses) {
        expect(VALID_TRANSITIONS[s]).toBeDefined();
      }
    });

    it('completed has no outgoing transitions', () => {
      expect(VALID_TRANSITIONS.completed).toEqual([]);
    });

    it('quarantined can only go to pending (manual)', () => {
      expect(VALID_TRANSITIONS.quarantined).toEqual(['pending']);
    });

    it('dead_letter can only go to pending (manual reactivation)', () => {
      expect(VALID_TRANSITIONS.dead_letter).toEqual(['pending']);
    });

    it('running can reach all failure modes', () => {
      expect(VALID_TRANSITIONS.running).toContain('failed');
      expect(VALID_TRANSITIONS.running).toContain('dead_letter');
      expect(VALID_TRANSITIONS.running).toContain('quarantined');
      expect(VALID_TRANSITIONS.running).toContain('completed');
    });
  });

  // ---- Valid Transitions ----

  describe('isValidTransition', () => {
    // Happy paths
    it('pending → running is valid', () => {
      expect(isValidTransition('pending', 'running')).toBe(true);
    });

    it('pending → paused is valid', () => {
      expect(isValidTransition('pending', 'paused')).toBe(true);
    });

    it('running → completed is valid', () => {
      expect(isValidTransition('running', 'completed')).toBe(true);
    });

    it('running → failed is valid', () => {
      expect(isValidTransition('running', 'failed')).toBe(true);
    });

    it('running → quarantined is valid', () => {
      expect(isValidTransition('running', 'quarantined')).toBe(true);
    });

    it('failed → pending (retry) is valid', () => {
      expect(isValidTransition('failed', 'pending')).toBe(true);
    });

    it('failed → dead_letter is valid', () => {
      expect(isValidTransition('failed', 'dead_letter')).toBe(true);
    });

    it('dead_letter → pending (manual reactivation) is valid', () => {
      expect(isValidTransition('dead_letter', 'pending')).toBe(true);
    });

    it('quarantined → pending (manual only) is valid', () => {
      expect(isValidTransition('quarantined', 'pending')).toBe(true);
    });

    // Invalid transitions
    it('pending → completed is INVALID (must run first)', () => {
      expect(isValidTransition('pending', 'completed')).toBe(false);
    });

    it('completed → pending is INVALID (terminal)', () => {
      expect(isValidTransition('completed', 'pending')).toBe(false);
    });

    it('completed → running is INVALID (terminal)', () => {
      expect(isValidTransition('completed', 'running')).toBe(false);
    });

    it('quarantined → running is INVALID (must go through pending)', () => {
      expect(isValidTransition('quarantined', 'running')).toBe(false);
    });

    it('quarantined → completed is INVALID', () => {
      expect(isValidTransition('quarantined', 'completed')).toBe(false);
    });

    it('dead_letter → completed is INVALID (must reactivate first)', () => {
      expect(isValidTransition('dead_letter', 'completed')).toBe(false);
    });

    it('dead_letter → running is INVALID', () => {
      expect(isValidTransition('dead_letter', 'running')).toBe(false);
    });

    it('failed → completed is INVALID (must retry through pending)', () => {
      expect(isValidTransition('failed', 'completed')).toBe(false);
    });
  });

  // ---- Terminal States ----

  describe('isTerminal', () => {
    it('completed is terminal', () => {
      expect(isTerminal('completed')).toBe(true);
    });

    it('pending is not terminal', () => {
      expect(isTerminal('pending')).toBe(false);
    });

    it('failed is not terminal (can retry)', () => {
      expect(isTerminal('failed')).toBe(false);
    });

    it('quarantined is not terminal (can be manually reactivated)', () => {
      expect(isTerminal('quarantined')).toBe(false);
    });

    it('dead_letter is not terminal (can be manually reactivated)', () => {
      expect(isTerminal('dead_letter')).toBe(false);
    });
  });

  describe('getTerminalStates', () => {
    it('returns only completed', () => {
      expect(getTerminalStates()).toEqual(['completed']);
    });
  });

  // ---- Auto-Retry Blocking ----

  describe('blocksAutoRetry', () => {
    it('quarantined blocks auto-retry', () => {
      expect(blocksAutoRetry('quarantined')).toBe(true);
    });

    it('completed blocks auto-retry', () => {
      expect(blocksAutoRetry('completed')).toBe(true);
    });

    it('failed does NOT block auto-retry', () => {
      expect(blocksAutoRetry('failed')).toBe(false);
    });

    it('dead_letter does NOT block auto-retry (can be reactivated)', () => {
      expect(blocksAutoRetry('dead_letter')).toBe(false);
    });

    it('pending does NOT block auto-retry', () => {
      expect(blocksAutoRetry('pending')).toBe(false);
    });
  });

  // ---- Helper Functions ----

  describe('getNextStates', () => {
    it('returns valid next states for pending', () => {
      expect(getNextStates('pending')).toContain('running');
      expect(getNextStates('pending')).toContain('paused');
    });

    it('returns empty array for completed', () => {
      expect(getNextStates('completed')).toEqual([]);
    });
  });

  describe('getAllStatuses', () => {
    it('returns all 8 statuses', () => {
      expect(getAllStatuses()).toHaveLength(8);
      expect(getAllStatuses()).toContain('pending');
      expect(getAllStatuses()).toContain('quarantined');
      expect(getAllStatuses()).toContain('dead_letter');
    });
  });

  // ---- Invariants ----

  describe('invariants', () => {
    it('every status can reach quarantined (safety escape hatch)', () => {
      const nonTerminal = getAllStatuses().filter(s => s !== 'completed');
      for (const status of nonTerminal) {
        // Every non-terminal status should be able to reach quarantined
        // either directly or through intermediate states
        const direct = isValidTransition(status, 'quarantined');
        const viaPending = isValidTransition(status, 'pending');
        expect(
          direct || viaPending,
          `${status} cannot reach quarantined directly or via pending`,
        ).toBe(true);
      }
    });

    it('no status can transition to itself', () => {
      for (const status of getAllStatuses()) {
        expect(
          isValidTransition(status, status),
          `${status} → ${status} should be invalid`,
        ).toBe(false);
      }
    });

    it('completed is truly terminal — no outgoing edges', () => {
      for (const target of getAllStatuses()) {
        expect(isValidTransition('completed', target)).toBe(false);
      }
    });
  });
});
