// IHS
/**
 * Structural Gate — Gate 1 of Module Admission Pipeline (Book VI)
 *
 * Validates the structural integrity of a Module Covenant using
 * Phase 2 construction tools: covenant validation + complexity measurement.
 *
 * Checks:
 * - Covenant passes all structural validation rules
 * - Module ID is unique among known modules
 * - Complexity is within acceptable bounds
 *
 * DEPENDS ON: construction/covenant-validator, construction/complexity-meter
 * USED BY: admission-pipeline
 */

import type { ModuleCovenant } from '../covenant/types';
import { validateCovenant } from '../construction/covenant-validator';
import { measureComplexity } from '../construction/complexity-meter';
import type { GateResult, GateIssue } from './types';

/** Complexity score threshold for warning */
const COMPLEXITY_WARN_THRESHOLD = 75;

/**
 * Run the structural gate: covenant validation + complexity measurement.
 *
 * @param covenant - The module covenant to evaluate
 * @param knownModuleIds - IDs of already-registered modules (for uniqueness check)
 */
export function runStructuralGate(
  covenant: ModuleCovenant,
  knownModuleIds?: readonly string[],
): GateResult {
  const start = Date.now();
  const issues: GateIssue[] = [];

  // 1. Module ID uniqueness
  if (knownModuleIds?.includes(covenant.identity.id)) {
    issues.push({
      gate: 'structural',
      severity: 'error',
      message: `Module ID '${covenant.identity.id}' is already registered`,
      path: 'identity.id',
    });
  }

  // 2. Covenant validation (Phase 2 tool)
  const mutableKnownIds = knownModuleIds ? [...knownModuleIds] : undefined;
  const validationResult = validateCovenant(covenant, mutableKnownIds);

  for (const vi of validationResult.issues) {
    if (vi.severity === 'info') continue; // Skip info-level issues for gate purposes
    issues.push({
      gate: 'structural',
      severity: vi.severity === 'error' ? 'error' : 'warning',
      message: vi.message,
      path: vi.path,
    });
  }

  // 3. Complexity measurement (Phase 2 tool)
  const complexityReport = measureComplexity(covenant);

  if (complexityReport.assessment === 'excessive') {
    issues.push({
      gate: 'structural',
      severity: 'warning',
      message: `Excessive complexity score: ${complexityReport.complexityScore}/100 (assessment: ${complexityReport.assessment})`,
      path: 'complexity',
    });
  } else if (complexityReport.complexityScore >= COMPLEXITY_WARN_THRESHOLD) {
    issues.push({
      gate: 'structural',
      severity: 'warning',
      message: `High complexity score: ${complexityReport.complexityScore}/100 (assessment: ${complexityReport.assessment})`,
      path: 'complexity',
    });
  }

  // Determine verdict
  const hasErrors = issues.some(i => i.severity === 'error');
  const hasWarnings = issues.some(i => i.severity === 'warning');

  return {
    gate: 'structural',
    verdict: hasErrors ? 'fail' : hasWarnings ? 'warn' : 'pass',
    issues,
    durationMs: Date.now() - start,
    metadata: {
      validationResult,
      complexityReport,
    },
  };
}
