// ===========================================
// ORDINATIO JOBS v1.1 — Side Effects Validator
// ===========================================
// Compares declared side effects against what
// actually happened. Undeclared writes are a
// data integrity violation.
// ===========================================

import type { SideEffectSpec } from './types';

/** Result of side effects validation. */
export interface SideEffectValidation {
  valid: boolean;
  undeclared: string[];
}

/**
 * Validate that actual side effects are a subset of declared.
 * Undeclared writes indicate the job changed something it shouldn't have.
 */
export function validateSideEffects(
  declared: SideEffectSpec,
  actual: string[],
): SideEffectValidation {
  const allowed = new Set([...declared.writes, ...declared.externalCalls]);
  const undeclared = actual.filter(effect => !allowed.has(effect));

  return {
    valid: undeclared.length === 0,
    undeclared,
  };
}

/**
 * Check if a partial failure on an irreversible job is dangerous.
 * Returns true if the job is irreversible AND some side effects occurred.
 */
export function isIrreversiblePartialFailure(
  declared: SideEffectSpec,
  actualSideEffects: string[],
  jobFailed: boolean,
): boolean {
  return declared.irreversible && jobFailed && actualSideEffects.length > 0;
}
