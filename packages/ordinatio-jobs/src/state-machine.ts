// ===========================================
// ORDINATIO JOBS v1.1 — State Machine
// ===========================================
// Canonical job status transitions. No job can
// move between states outside these edges.
// Quarantined jobs never auto-transition.
// ===========================================

import type { JobStatus } from './types';

/**
 * Canonical state transition map.
 * Each key lists the states it can transition TO.
 */
export const VALID_TRANSITIONS: Record<JobStatus, readonly JobStatus[]> = {
  pending:      ['running', 'paused', 'quarantined'],
  running:      ['completed', 'failed', 'dead_letter', 'quarantined'],
  completed:    [],  // terminal
  failed:       ['pending', 'dead_letter', 'quarantined'],
  delayed:      ['pending', 'quarantined'],
  paused:       ['pending', 'quarantined'],
  dead_letter:  ['pending'],  // manual reactivation only
  quarantined:  ['pending'],  // manual only — never automatic
} as const;

/** States that have no outgoing transitions (except quarantined's manual escape). */
const TERMINAL_STATES: readonly JobStatus[] = ['completed'] as const;

/** States that block automatic retry. */
const NO_AUTO_RETRY_STATES: readonly JobStatus[] = ['quarantined', 'completed'] as const;

/**
 * Check if a state transition is valid.
 */
export function isValidTransition(from: JobStatus, to: JobStatus): boolean {
  const allowed = VALID_TRANSITIONS[from];
  if (!allowed) return false;
  return allowed.includes(to);
}

/**
 * Check if a status is terminal (no outgoing transitions).
 */
export function isTerminal(status: JobStatus): boolean {
  return TERMINAL_STATES.includes(status);
}

/**
 * Get all terminal states.
 */
export function getTerminalStates(): readonly JobStatus[] {
  return TERMINAL_STATES;
}

/**
 * Check if a status blocks automatic retry.
 */
export function blocksAutoRetry(status: JobStatus): boolean {
  return NO_AUTO_RETRY_STATES.includes(status);
}

/**
 * Get the valid next states from a given status.
 */
export function getNextStates(status: JobStatus): readonly JobStatus[] {
  return VALID_TRANSITIONS[status] ?? [];
}

/**
 * Get all defined statuses.
 */
export function getAllStatuses(): JobStatus[] {
  return Object.keys(VALID_TRANSITIONS) as JobStatus[];
}
