// ===========================================
// ORDINATIO JOBS v1.1 — Job Type Registry
// ===========================================
// Central registry for job type definitions.
// Enforces the full agentic contract: intent,
// definition of done, side effects, safety,
// and recovery requirements.
// ===========================================

import type { JobTypeDefinition, RetryPolicy, JobPlan, PolicyResult, PolicyEvaluator } from './types';
import { jobsError } from './errors';

/** Default retry policy used when none is specified. */
export const DEFAULT_RETRY_POLICY: RetryPolicy = {
  maxAttempts: 3,
  backoff: {
    type: 'exponential',
    delay: 5000,
  },
};

const registry = new Map<string, JobTypeDefinition>();
let policyEvaluator: PolicyEvaluator | null = null;

// ---- Registration ----

/**
 * Register a job type with its full contract.
 * Validates that all required agentic fields are present.
 * @throws JOBS_130 on duplicate, JOBS_132 on invalid contract.
 */
export function registerJobType<TData = unknown>(
  definition: JobTypeDefinition<TData>,
): void {
  if (registry.has(definition.type)) {
    const { ref } = jobsError('JOBS_130', { type: definition.type });
    throw new Error(`[${ref}] Job type "${definition.type}" is already registered.`);
  }

  // Validate type name
  if (!definition.type || definition.type.trim().length === 0) {
    const { ref } = jobsError('JOBS_132', { type: definition.type });
    throw new Error(`[${ref}] Job type has empty or blank type name.`);
  }

  // Validate agentic contract completeness
  const missing: string[] = [];
  if (!definition.intent) missing.push('intent');
  if (!definition.definitionOfDone?.checks?.length) missing.push('definitionOfDone.checks');
  if (!definition.sideEffects) missing.push('sideEffects');
  if (definition.safeToRetry === undefined) missing.push('safeToRetry');
  if (definition.idempotent === undefined) missing.push('idempotent');
  if (definition.requiresHumanApproval === undefined) missing.push('requiresHumanApproval');
  if (!definition.riskLevel) missing.push('riskLevel');
  if (!definition.spec) missing.push('spec');

  if (missing.length > 0) {
    const { ref } = jobsError('JOBS_132', { type: definition.type, missing });
    throw new Error(
      `[${ref}] Job type "${definition.type}" has incomplete contract. Missing: ${missing.join(', ')}`,
    );
  }

  registry.set(definition.type, definition as JobTypeDefinition);
}

// ---- Retrieval ----

/** Get a registered job type definition. */
export function getJobType(type: string): JobTypeDefinition | undefined {
  return registry.get(type);
}

/** Get all registered job type names. */
export function getRegisteredTypes(): string[] {
  return Array.from(registry.keys());
}

/** Check if a job type is registered. */
export function isRegisteredType(type: string): boolean {
  return registry.has(type);
}

/** Get the retry policy for a job type. Falls back to default. */
export function getRetryPolicy(type: string): RetryPolicy {
  return registry.get(type)?.retry ?? DEFAULT_RETRY_POLICY;
}

/** Get the full registry as a read-only map. */
export function getRegistry(): ReadonlyMap<string, JobTypeDefinition> {
  return registry;
}

// ---- Validation ----

/**
 * Validate job data against the registered type's validator.
 * @throws JOBS_131 on validation failure.
 */
export function validateJobData<TData>(type: string, data: unknown): TData {
  const definition = registry.get(type);
  if (!definition?.validate) {
    return data as TData;
  }

  try {
    return definition.validate(data) as TData;
  } catch (error) {
    const { ref } = jobsError('JOBS_131', { type, error: String(error) });
    throw new Error(
      `[${ref}] Job data validation failed for type "${type}": ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

// ---- Job Plan (Preflight) ----

/**
 * Plan a job without executing it.
 * Returns a preflight analysis: validation, risk, side effects,
 * dependencies, policy evaluation, and recommended actions.
 */
export function planJob(
  type: string,
  payload: unknown,
  context?: { principalId?: string; organizationId?: string; trustTier?: number },
): JobPlan {
  const definition = registry.get(type);

  if (!definition) {
    return {
      valid: false,
      validationErrors: [`Unknown job type: "${type}". Not registered in job registry.`],
      type,
      intent: 'compute',
      riskLevel: 'critical',
      sideEffects: { writes: [], externalCalls: [], irreversible: false },
      definitionOfDone: { checks: [] },
      retryPolicy: DEFAULT_RETRY_POLICY,
      idempotent: false,
      replayPolicy: 'deny',
      requiresApproval: true,
      safeToRetry: false,
    };
  }

  // Validate payload
  let valid = true;
  const validationErrors: string[] = [];
  if (definition.validate) {
    try {
      definition.validate(payload);
    } catch (error) {
      valid = false;
      validationErrors.push(error instanceof Error ? error.message : String(error));
    }
  }

  // Check dependencies
  const dependsOn = definition.dependsOn ?? [];

  // Run policy evaluation if configured
  let policyResult: PolicyResult | undefined;
  if (policyEvaluator && context) {
    policyResult = policyEvaluator(definition, context);
  }

  // Build hypermedia actions
  const actions: Record<string, { intent: string; requiredInputs?: string[] }> = {};
  if (valid) {
    actions.execute = { intent: 'Execute this job' };
  }
  if (!valid) {
    actions.fix_payload = {
      intent: 'Fix validation errors and re-plan',
      requiredInputs: validationErrors,
    };
  }
  if (definition.requiresHumanApproval) {
    actions.request_approval = { intent: 'Request human approval before execution' };
  }

  return {
    valid,
    validationErrors: validationErrors.length > 0 ? validationErrors : undefined,
    type: definition.type,
    intent: definition.intent,
    riskLevel: definition.riskLevel,
    sideEffects: definition.sideEffects,
    definitionOfDone: definition.definitionOfDone,
    retryPolicy: definition.retry,
    idempotent: definition.idempotent,
    replayPolicy: definition.replayPolicy,
    requiresApproval: definition.requiresHumanApproval,
    safeToRetry: definition.safeToRetry,
    dependsOn: dependsOn.length > 0 ? dependsOn : undefined,
    policyResult,
    _actions: Object.keys(actions).length > 0 ? actions : undefined,
  };
}

// ---- Policy ----

/**
 * Set the policy evaluator function.
 * Called before execution to determine allow/deny/escalate.
 */
export function setPolicyEvaluator(evaluator: PolicyEvaluator | null): void {
  policyEvaluator = evaluator;
}

/** Get the current policy evaluator. */
export function getPolicyEvaluator(): PolicyEvaluator | null {
  return policyEvaluator;
}

// ---- Lifecycle ----

/** Deregister a job type (for testing). */
export function deregisterJobType(type: string): boolean {
  return registry.delete(type);
}

/** Clear all registered job types and policy (for testing). */
export function clearRegistry(): void {
  registry.clear();
  policyEvaluator = null;
}
