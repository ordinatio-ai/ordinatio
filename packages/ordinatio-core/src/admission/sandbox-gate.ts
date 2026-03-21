// IHS
/**
 * Sandbox Gate — Gate 5 of Module Admission Pipeline (Book VI)
 *
 * The only async gate — invokes the module's health check and performs
 * static analysis of capability budgets, input completeness, and
 * sensitivity-risk alignment.
 *
 * Checks:
 * - Health check invocation (5-second timeout)
 * - Capability count budget (>20 warn, >30 error)
 * - Input completeness for act+ mutations/actions
 * - Sensitivity-risk alignment
 * - Blast radius (govern + many dependencies)
 *
 * DEPENDS ON: governance/types (RISK_ORDINAL)
 * USED BY: admission-pipeline
 */

import type { ModuleCovenant } from '../covenant/types';
import { RISK_ORDINAL } from '../governance/types';
import type { GateResult, GateIssue } from './types';

/** Health check timeout in milliseconds */
const HEALTH_CHECK_TIMEOUT_MS = 5000;

/** Capability count thresholds */
const CAP_WARN_THRESHOLD = 20;
const CAP_ERROR_THRESHOLD = 30;

/** Blast radius: govern risk + this many dependencies = warning */
const BLAST_RADIUS_DEP_THRESHOLD = 5;

/**
 * Run the sandbox gate: health check + static analysis.
 *
 * @param covenant - The module covenant to evaluate
 */
export async function runSandboxGate(
  covenant: ModuleCovenant,
): Promise<GateResult> {
  const start = Date.now();
  const issues: GateIssue[] = [];
  const { capabilities, dependencies, healthCheck } = covenant;

  // 1. Health check invocation with timeout
  try {
    const healthPromise = healthCheck();
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Health check timed out')), HEALTH_CHECK_TIMEOUT_MS),
    );
    const result = await Promise.race([healthPromise, timeoutPromise]);

    if (!result.healthy) {
      issues.push({
        gate: 'sandbox',
        severity: 'error',
        message: `Health check returned unhealthy: ${result.message}`,
        path: 'healthCheck',
      });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    issues.push({
      gate: 'sandbox',
      severity: 'error',
      message: `Health check failed: ${message}`,
      path: 'healthCheck',
    });
  }

  // 2. Capability count budget
  if (capabilities.length > CAP_ERROR_THRESHOLD) {
    issues.push({
      gate: 'sandbox',
      severity: 'error',
      message: `Module declares ${capabilities.length} capabilities (max ${CAP_ERROR_THRESHOLD}) — exceeds reasonable sandbox bounds`,
      path: 'capabilities',
    });
  } else if (capabilities.length > CAP_WARN_THRESHOLD) {
    issues.push({
      gate: 'sandbox',
      severity: 'warning',
      message: `Module declares ${capabilities.length} capabilities (warning threshold: ${CAP_WARN_THRESHOLD}) — consider splitting into sub-modules`,
      path: 'capabilities',
    });
  }

  // 3. Input completeness for high-risk mutations/actions
  for (let i = 0; i < capabilities.length; i++) {
    const cap = capabilities[i];
    const riskOrd = RISK_ORDINAL[cap.risk] ?? 0;

    if ((cap.type === 'mutation' || cap.type === 'action') && riskOrd >= RISK_ORDINAL.act) {
      const hasRequiredInput = cap.inputs.some(input => input.required);
      if (!hasRequiredInput) {
        issues.push({
          gate: 'sandbox',
          severity: 'warning',
          message: `Capability '${cap.id}' is '${cap.type}' at '${cap.risk}' risk but has no required inputs — consider requiring at least one input for safety`,
          path: `capabilities[${i}].inputs`,
        });
      }
    }

    // 4. Sensitivity-risk alignment
    if (cap.dataSensitivity === 'critical' && cap.risk === 'observe') {
      issues.push({
        gate: 'sandbox',
        severity: 'warning',
        message: `Capability '${cap.id}' has 'critical' sensitivity but 'observe' risk — critical data access typically warrants higher risk classification`,
        path: `capabilities[${i}]`,
      });
    }
  }

  // 5. Blast radius check
  const hasGovernRisk = capabilities.some(cap => cap.risk === 'govern');
  if (hasGovernRisk && dependencies.length >= BLAST_RADIUS_DEP_THRESHOLD) {
    issues.push({
      gate: 'sandbox',
      severity: 'warning',
      message: `Module has 'govern' risk capabilities and ${dependencies.length} dependencies — high blast radius`,
      path: 'dependencies',
    });
  }

  const hasErrors = issues.some(i => i.severity === 'error');
  const hasWarnings = issues.some(i => i.severity === 'warning');

  return {
    gate: 'sandbox',
    verdict: hasErrors ? 'fail' : hasWarnings ? 'warn' : 'pass',
    issues,
    durationMs: Date.now() - start,
  };
}
