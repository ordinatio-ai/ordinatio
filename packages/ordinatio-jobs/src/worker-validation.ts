// ===========================================
// ORDINATIO JOBS v1.1 — Worker Result Validator
// ===========================================
// Enforces the worker contract. Workers must
// return structured results with recovery plans
// on failure. No exceptions.
// ===========================================

import type { WorkerResult, JobTypeDefinition } from './types';
import { validateSideEffects } from './side-effects';
import { isValidRecoveryPlan } from './recovery';

/** Result of worker output validation. */
export interface WorkerValidation {
  valid: boolean;
  violations: string[];
}

/**
 * Validate that a worker's result conforms to the contract.
 * Checks: recovery plan on failure, error classification,
 * side effects within declared bounds.
 */
export function validateWorkerResult(
  result: WorkerResult,
  jobDef: JobTypeDefinition,
): WorkerValidation {
  const violations: string[] = [];

  // Rule 1: Failed results MUST have a recovery plan
  if (!result.success && !result.recovery) {
    violations.push('Failed result missing required RecoveryPlan');
  }

  // Rule 2: If recovery plan exists, it must be structurally valid
  if (result.recovery && !isValidRecoveryPlan(result.recovery)) {
    violations.push('RecoveryPlan is present but structurally invalid (missing required fields)');
  }

  // Rule 3: Failed results MUST classify the error
  if (!result.success && !result.errorClassification) {
    violations.push('Failed result missing errorClassification (retryable | fatal | quarantine)');
  }

  // Rule 4: Actual side effects must be subset of declared
  if (result.actualSideEffects && result.actualSideEffects.length > 0) {
    const sideEffectCheck = validateSideEffects(jobDef.sideEffects, result.actualSideEffects);
    if (!sideEffectCheck.valid) {
      violations.push(
        `Actual side effects exceed declared: undeclared=[${sideEffectCheck.undeclared.join(', ')}]`,
      );
    }
  }

  // Rule 5: errorClassification 'quarantine' must have humanInterventionRequired
  if (
    result.errorClassification === 'quarantine' &&
    result.recovery &&
    !result.recovery.humanInterventionRequired
  ) {
    violations.push('Quarantine classification requires humanInterventionRequired=true in recovery plan');
  }

  return {
    valid: violations.length === 0,
    violations,
  };
}
