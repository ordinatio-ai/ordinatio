// IHS
/**
 * Permission Gate — Gate 2 of Module Admission Pipeline (Book VI)
 *
 * Validates risk escalation rules and data sensitivity constraints
 * based on module classification (status).
 *
 * Checks:
 * - Local/experimental modules cannot declare 'govern' risk capabilities
 * - Local modules cannot declare 'critical' data sensitivity
 * - Mutation/action with 'observe' risk is suspicious (warning)
 * - Ecclesial modules with 'govern' get a warning
 *
 * DEPENDS ON: governance/types (RISK_ORDINAL)
 * USED BY: admission-pipeline
 */

import type { ModuleCovenant } from '../covenant/types';
import type { GovernancePolicy } from '../governance/types';
import { RISK_ORDINAL } from '../governance/types';
import type { GateResult, GateIssue } from './types';

/** Data sensitivity ordinal for comparison */
const SENSITIVITY_ORDINAL: Record<string, number> = {
  none: 0,
  internal: 1,
  sensitive: 2,
  critical: 3,
};

/**
 * Run the permission gate: risk escalation + data sensitivity checks.
 *
 * @param covenant - The module covenant to evaluate
 * @param _policy - Optional governance policy (reserved for future policy-specific checks)
 */
export function runPermissionGate(
  covenant: ModuleCovenant,
  _policy?: GovernancePolicy,
): GateResult {
  const start = Date.now();
  const issues: GateIssue[] = [];
  const { identity, capabilities } = covenant;
  const status = identity.status;

  for (let i = 0; i < capabilities.length; i++) {
    const cap = capabilities[i];
    const riskOrd = RISK_ORDINAL[cap.risk] ?? 0;
    const sensOrd = SENSITIVITY_ORDINAL[cap.dataSensitivity] ?? 0;

    // 1. Status-based risk escalation
    if (cap.risk === 'govern') {
      if (status === 'local' || status === 'experimental') {
        issues.push({
          gate: 'permission',
          severity: 'error',
          message: `${status} module cannot declare 'govern' risk capability '${cap.id}'`,
          path: `capabilities[${i}].risk`,
        });
      } else if (status === 'ecclesial') {
        issues.push({
          gate: 'permission',
          severity: 'warning',
          message: `Ecclesial module declares 'govern' risk capability '${cap.id}' — requires cross-enterprise review`,
          path: `capabilities[${i}].risk`,
        });
      }
    }

    // 2. Data sensitivity limits by status
    if (cap.dataSensitivity === 'critical') {
      if (status === 'local' || status === 'experimental') {
        issues.push({
          gate: 'permission',
          severity: 'error',
          message: `${status} module cannot declare 'critical' data sensitivity on capability '${cap.id}'`,
          path: `capabilities[${i}].dataSensitivity`,
        });
      }
    }

    // 3. Risk consistency: mutation/action with 'observe' risk is suspicious
    if ((cap.type === 'mutation' || cap.type === 'action') && cap.risk === 'observe') {
      issues.push({
        gate: 'permission',
        severity: 'warning',
        message: `Capability '${cap.id}' is type '${cap.type}' but declared as 'observe' risk — mutations typically require higher risk`,
        path: `capabilities[${i}].risk`,
      });
    }
  }

  const hasErrors = issues.some(i => i.severity === 'error');
  const hasWarnings = issues.some(i => i.severity === 'warning');

  return {
    gate: 'permission',
    verdict: hasErrors ? 'fail' : hasWarnings ? 'warn' : 'pass',
    issues,
    durationMs: Date.now() - start,
  };
}
