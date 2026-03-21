// IHS
/**
 * Admission Pipeline — Module Admission Orchestrator (Book VI)
 *
 * Runs the five mechanical gates in sequence, producing an AdmissionDecision.
 * Supports early termination (structural/permission failure skips remaining gates),
 * gate skipping, and classification-specific verdicts.
 *
 * Book VI §VI: Five gates. Every module. No exceptions.
 * Book VI §XII: "Validation must be automatic."
 *
 * DEPENDS ON: all 5 gates, types
 * USED BY: council-admission (Phase 4), module-registry
 */

import type { ModuleCovenant } from '../covenant/types';
import type { GovernancePolicy } from '../governance/types';
import type { ComplexityReport, ValidationResult } from '../construction/types';
import type {
  AdmissionRequest,
  AdmissionDecision,
  AdmissionVerdict,
  DeferralReason,
  GateResult,
  GateId,
} from './types';
import { GATE_SEQUENCE } from './types';
import { runStructuralGate } from './structural-gate';
import { runPermissionGate } from './permission-gate';
import { runConflictGate } from './conflict-gate';
import { runGovernanceGate } from './governance-gate';
import { runSandboxGate } from './sandbox-gate';

/** Gates that trigger early termination on failure */
const EARLY_TERMINATION_GATES: ReadonlySet<GateId> = new Set(['structural', 'permission']);

/**
 * Run the complete admission pipeline — all 5 gates in sequence.
 *
 * @param request - The admission request containing the covenant and context
 * @returns The admission decision with gate results and verdict
 */
export async function runAdmissionPipeline(
  request: AdmissionRequest,
): Promise<AdmissionDecision> {
  const pipelineStart = Date.now();
  const { covenant, existingCovenants, policy, skipGates } = request;
  const skipSet = new Set(skipGates ?? []);
  const gates: GateResult[] = [];
  let earlyTerminated = false;

  const knownModuleIds = existingCovenants.map(c => c.identity.id);

  for (const gateId of GATE_SEQUENCE) {
    if (skipSet.has(gateId)) continue;

    // Early termination: skip remaining gates if a critical gate failed
    if (earlyTerminated) break;

    const gateResult = await runGate(gateId, covenant, existingCovenants, knownModuleIds, policy);
    gates.push(gateResult);

    // Check for early termination
    if (gateResult.verdict === 'fail' && EARLY_TERMINATION_GATES.has(gateId)) {
      earlyTerminated = true;
    }
  }

  // Aggregate metrics
  const allIssues = gates.flatMap(g => g.issues);
  const errorCount = allIssues.filter(i => i.severity === 'error').length;
  const warningCount = allIssues.filter(i => i.severity === 'warning').length;

  // Extract metadata from structural gate
  const structuralGate = gates.find(g => g.gate === 'structural');
  const complexityReport = structuralGate?.metadata?.complexityReport as ComplexityReport | undefined;
  const validationResult = structuralGate?.metadata?.validationResult as ValidationResult | undefined;

  // Determine verdict
  const { verdict, deferralReason, rejectionReasons } = classifyVerdict(
    covenant,
    gates,
    errorCount,
    warningCount,
  );

  return {
    moduleId: covenant.identity.id,
    moduleStatus: covenant.identity.status,
    verdict,
    gates,
    totalIssues: allIssues.length,
    errorCount,
    warningCount,
    decidedAt: new Date(),
    durationMs: Date.now() - pipelineStart,
    deferralReason,
    rejectionReasons,
    complexityReport,
    validationResult,
  };
}

/**
 * Check if a module can be auto-admitted (no human review needed).
 * Only Local modules with zero warnings qualify.
 */
export function canAutoAdmit(decision: AdmissionDecision): boolean {
  return decision.verdict === 'admitted';
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

async function runGate(
  gateId: GateId,
  covenant: ModuleCovenant,
  existingCovenants: readonly ModuleCovenant[],
  knownModuleIds: string[],
  policy?: GovernancePolicy,
): Promise<GateResult> {
  switch (gateId) {
    case 'structural':
      return runStructuralGate(covenant, knownModuleIds);
    case 'permission':
      return runPermissionGate(covenant, policy);
    case 'conflict':
      return runConflictGate(covenant, existingCovenants);
    case 'governance':
      return runGovernanceGate(covenant, policy);
    case 'sandbox':
      return runSandboxGate(covenant);
  }
}

function classifyVerdict(
  covenant: ModuleCovenant,
  gates: readonly GateResult[],
  errorCount: number,
  warningCount: number,
): {
  verdict: AdmissionVerdict;
  deferralReason?: DeferralReason;
  rejectionReasons: readonly string[];
} {
  // Any gate failure → rejected
  const failedGates = gates.filter(g => g.verdict === 'fail');
  if (failedGates.length > 0 || errorCount > 0) {
    const rejectionReasons = failedGates.flatMap(g =>
      g.issues.filter(i => i.severity === 'error').map(i => `[${g.gate}] ${i.message}`),
    );
    return { verdict: 'rejected', rejectionReasons };
  }

  const status = covenant.identity.status;

  // Classification-specific verdicts
  switch (status) {
    case 'canonical':
      return {
        verdict: 'deferred',
        deferralReason: 'requires_council_disputation',
        rejectionReasons: [],
      };

    case 'ecclesial':
      return {
        verdict: 'deferred',
        deferralReason: 'requires_cross_enterprise_review',
        rejectionReasons: [],
      };

    case 'experimental':
      return {
        verdict: 'admitted_conditional',
        rejectionReasons: [],
      };

    case 'local':
      if (warningCount > 0) {
        return {
          verdict: 'admitted_conditional',
          rejectionReasons: [],
        };
      }
      return {
        verdict: 'admitted',
        rejectionReasons: [],
      };

    default:
      return { verdict: 'rejected', rejectionReasons: [`Unknown module status: ${status}`] };
  }
}
