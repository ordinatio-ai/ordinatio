// IHS
/**
 * Governance Gate — Gate 4 of Module Admission Pipeline (Book VI)
 *
 * Validates governance compatibility: documentation quality, pitfall coverage,
 * and risk/sensitivity completeness for agent consumption.
 *
 * Checks:
 * - Capabilities with 'govern' risk SHOULD have pitfalls defined
 * - Capabilities at 'act'+ risk should have substantive whenToUse and description
 * - Risk and sensitivity must be valid enum values on every capability
 * - Health check function must be present
 *
 * DEPENDS ON: governance/types (RISK_ORDINAL)
 * USED BY: admission-pipeline
 */

import type { ModuleCovenant } from '../covenant/types';
import type { GovernancePolicy } from '../governance/types';
import { RISK_ORDINAL } from '../governance/types';
import type { GateResult, GateIssue } from './types';

const VALID_RISKS = ['observe', 'suggest', 'act', 'govern'] as const;
const VALID_SENSITIVITIES = ['none', 'internal', 'sensitive', 'critical'] as const;

/** Minimum length for substantive documentation */
const MIN_DOC_LENGTH = 10;

/**
 * Run the governance gate: documentation quality + governance compatibility.
 *
 * @param covenant - The module covenant to evaluate
 * @param _policy - Optional governance policy (reserved for future checks)
 */
export function runGovernanceGate(
  covenant: ModuleCovenant,
  _policy?: GovernancePolicy,
): GateResult {
  const start = Date.now();
  const issues: GateIssue[] = [];
  const { capabilities, healthCheck } = covenant;

  for (let i = 0; i < capabilities.length; i++) {
    const cap = capabilities[i];
    const riskOrd = RISK_ORDINAL[cap.risk] ?? -1;

    // 1. Govern-level pitfalls
    if (cap.risk === 'govern') {
      if (!cap.pitfalls || cap.pitfalls.length === 0) {
        issues.push({
          gate: 'governance',
          severity: 'warning',
          message: `Capability '${cap.id}' has 'govern' risk but no pitfalls defined — agents need guidance for irreversible actions`,
          path: `capabilities[${i}].pitfalls`,
        });
      }
    }

    // 2. Act+ documentation quality
    if (riskOrd >= RISK_ORDINAL.act) {
      if (!cap.whenToUse || cap.whenToUse.length < MIN_DOC_LENGTH) {
        issues.push({
          gate: 'governance',
          severity: 'warning',
          message: `Capability '${cap.id}' at '${cap.risk}' risk has insufficient whenToUse guidance (${cap.whenToUse?.length ?? 0} chars, need ${MIN_DOC_LENGTH}+)`,
          path: `capabilities[${i}].whenToUse`,
        });
      }
      if (!cap.description || cap.description.length < MIN_DOC_LENGTH) {
        issues.push({
          gate: 'governance',
          severity: 'warning',
          message: `Capability '${cap.id}' at '${cap.risk}' risk has insufficient description (${cap.description?.length ?? 0} chars, need ${MIN_DOC_LENGTH}+)`,
          path: `capabilities[${i}].description`,
        });
      }
    }

    // 3. Risk/sensitivity completeness
    if (!VALID_RISKS.includes(cap.risk as typeof VALID_RISKS[number])) {
      issues.push({
        gate: 'governance',
        severity: 'error',
        message: `Capability '${cap.id}' has invalid risk: '${cap.risk}'`,
        path: `capabilities[${i}].risk`,
      });
    }
    if (!VALID_SENSITIVITIES.includes(cap.dataSensitivity as typeof VALID_SENSITIVITIES[number])) {
      issues.push({
        gate: 'governance',
        severity: 'error',
        message: `Capability '${cap.id}' has invalid data sensitivity: '${cap.dataSensitivity}'`,
        path: `capabilities[${i}].dataSensitivity`,
      });
    }
  }

  // 4. Health check present
  if (typeof healthCheck !== 'function') {
    issues.push({
      gate: 'governance',
      severity: 'error',
      message: 'Health check function must be present',
      path: 'healthCheck',
    });
  }

  const hasErrors = issues.some(i => i.severity === 'error');
  const hasWarnings = issues.some(i => i.severity === 'warning');

  return {
    gate: 'governance',
    verdict: hasErrors ? 'fail' : hasWarnings ? 'warn' : 'pass',
    issues,
    durationMs: Date.now() - start,
  };
}
