// IHS
/**
 * Pre-Disputation Audit (Book V §VII)
 *
 * A comprehensive self-critique workflow that a module builder runs
 * BEFORE submitting to the Council. Integrates covenant validation,
 * boundary checking, builder's questions, and complexity measurement
 * into a single pass/fail report.
 *
 * "No module should arrive at the Council unprepared."
 *
 * DEPENDS ON: construction/types, covenant-validator, boundary-checker,
 *             builders-questions, complexity-meter
 * USED BY: module admission pipeline, Council governance
 */

import type { ModuleCovenant } from '../covenant/types';
import type {
  ConceptArtifact,
  BoundaryCheckInput,
  AuditCheck,
  AuditCheckSeverity,
  AuditCheckStatus,
  PreDisputationReport,
} from './types';
import { validateCovenant } from './covenant-validator';
import { checkModuleBoundary } from './boundary-checker';
import { assessBuildersQuestions } from './builders-questions';
import { measureComplexity } from './complexity-meter';

// ---------------------------------------------------------------------------
// Options
// ---------------------------------------------------------------------------

export interface PreDisputationOptions {
  /** If provided, concept artifact completeness is checked */
  conceptArtifact?: ConceptArtifact;
  /** If provided, boundary diagnostic is run */
  boundaryInput?: BoundaryCheckInput;
  /** If provided, builder's questions are assessed */
  buildersAnswers?: Record<number, string>;
  /** Known module IDs for dependency cross-referencing */
  knownModuleIds?: string[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function check(
  id: string,
  name: string,
  phase: AuditCheck['phase'],
  severity: AuditCheckSeverity,
  status: AuditCheckStatus,
  message: string,
): AuditCheck {
  return { id, name, phase, severity, status, message };
}

// ---------------------------------------------------------------------------
// Concept Phase Checks
// ---------------------------------------------------------------------------

function auditConceptArtifact(artifact: ConceptArtifact): AuditCheck[] {
  const checks: AuditCheck[] = [];
  const MIN_LEN = 20;

  const fields: { key: keyof ConceptArtifact; name: string }[] = [
    { key: 'capabilityDefined', name: 'Capability definition' },
    { key: 'universalNeed', name: 'Universal need statement' },
    { key: 'argumentAgainst', name: 'Required Reflection (argument against)' },
  ];

  for (const f of fields) {
    const val = artifact[f.key];
    const ok = typeof val === 'string' && val.length >= MIN_LEN;
    checks.push(check(
      `concept.${f.key}`,
      f.name,
      'concept',
      'required',
      ok ? 'pass' : 'fail',
      ok ? `${f.name}: provided (${(val as string).length} chars)` : `${f.name}: missing or too brief`,
    ));
  }

  const arrayFields: { key: keyof ConceptArtifact; name: string; minItems: number }[] = [
    { key: 'inputs', name: 'Inputs', minItems: 1 },
    { key: 'outputs', name: 'Outputs', minItems: 1 },
    { key: 'nonGoals', name: 'Non-goals', minItems: 1 },
    { key: 'abstractionRisks', name: 'Abstraction risks', minItems: 1 },
    { key: 'rejectedAlternatives', name: 'Rejected alternatives', minItems: 1 },
  ];

  for (const f of arrayFields) {
    const val = artifact[f.key] as readonly unknown[];
    const ok = Array.isArray(val) && val.length >= f.minItems;
    checks.push(check(
      `concept.${f.key}`,
      f.name,
      'concept',
      f.key === 'rejectedAlternatives' ? 'required' : 'recommended',
      ok ? 'pass' : 'fail',
      ok ? `${f.name}: ${val.length} entries` : `${f.name}: requires at least ${f.minItems} entry`,
    ));
  }

  // Invariants within concept artifact
  const invOk = artifact.invariants
    && artifact.invariants.alwaysTrue.length > 0
    && artifact.invariants.neverHappens.length > 0;
  checks.push(check(
    'concept.invariants',
    'Concept invariants',
    'concept',
    'required',
    invOk ? 'pass' : 'fail',
    invOk ? 'Invariants: both alwaysTrue and neverHappens populated' : 'Invariants: incomplete',
  ));

  return checks;
}

// ---------------------------------------------------------------------------
// Boundary Phase Checks
// ---------------------------------------------------------------------------

function auditBoundary(input: BoundaryCheckInput): AuditCheck[] {
  const result = checkModuleBoundary(input);

  const checks: AuditCheck[] = [
    check(
      'boundary.overall',
      'Module boundary check',
      'boundary',
      'required',
      result.recommendation === 'proceed' ? 'pass' : result.recommendation === 'revise' ? 'warning' : 'fail',
      `Boundary recommendation: ${result.recommendation}` +
        (result.rejectionReasons.length > 0 ? ` — ${result.rejectionReasons.join('; ')}` : ''),
    ),
  ];

  // Report category-level summary
  for (const [cat, score] of Object.entries(result.categoryScores)) {
    const allPassed = score.passed === score.total;
    checks.push(check(
      `boundary.${cat}`,
      `Boundary: ${cat}`,
      'boundary',
      cat === 'necessity' ? 'required' : 'recommended',
      allPassed ? 'pass' : 'warning',
      `${cat}: ${score.passed}/${score.total} passed`,
    ));
  }

  return checks;
}

// ---------------------------------------------------------------------------
// Construction Phase Checks (covenant validation)
// ---------------------------------------------------------------------------

function auditConstruction(covenant: ModuleCovenant, knownModuleIds?: string[]): AuditCheck[] {
  const result = validateCovenant(covenant, knownModuleIds);
  const checks: AuditCheck[] = [];

  checks.push(check(
    'construction.covenant',
    'Covenant validation',
    'construction',
    'required',
    result.valid ? 'pass' : 'fail',
    result.valid
      ? `Covenant valid (${result.warningCount} warnings, ${result.infoCount} info)`
      : `Covenant invalid: ${result.errorCount} errors — ${result.issues.filter(i => i.severity === 'error').map(i => i.message).join('; ')}`,
  ));

  // Risk levels check (from validator info issues)
  const riskInfo = result.issues.find(i => i.severity === 'info' && i.message.includes('risk levels'));
  checks.push(check(
    'construction.risk_diversity',
    'Capability risk level diversity',
    'construction',
    'recommended',
    riskInfo ? 'warning' : 'pass',
    riskInfo ? riskInfo.message : 'Capabilities span multiple risk levels',
  ));

  // Health check function present
  checks.push(check(
    'construction.health_check',
    'Health check defined',
    'construction',
    'required',
    typeof covenant.healthCheck === 'function' ? 'pass' : 'fail',
    typeof covenant.healthCheck === 'function' ? 'Health check function defined' : 'Health check is missing or not a function',
  ));

  return checks;
}

// ---------------------------------------------------------------------------
// Documentation Phase Checks
// ---------------------------------------------------------------------------

function auditDocumentation(covenant: ModuleCovenant): AuditCheck[] {
  const checks: AuditCheck[] = [];
  const { invariants, identity, capabilities } = covenant;

  // Invariants depth
  const invCount = invariants.alwaysTrue.length + invariants.neverHappens.length;
  checks.push(check(
    'docs.invariants_depth',
    'Invariant depth',
    'documentation',
    'recommended',
    invCount >= 4 ? 'pass' : 'warning',
    `${invCount} invariants (≥4 recommended for thorough documentation)`,
  ));

  // Description adequacy
  checks.push(check(
    'docs.description',
    'Module description',
    'documentation',
    'recommended',
    identity.description.length >= 30 ? 'pass' : 'warning',
    `Description: ${identity.description.length} chars (≥30 recommended)`,
  ));

  // whenToUse on all capabilities
  const missingWhenToUse = capabilities.filter(c => !c.whenToUse || c.whenToUse.length < 10);
  checks.push(check(
    'docs.when_to_use',
    'Capability usage guidance',
    'documentation',
    'recommended',
    missingWhenToUse.length === 0 ? 'pass' : 'warning',
    missingWhenToUse.length === 0
      ? 'All capabilities have whenToUse guidance'
      : `${missingWhenToUse.length} capabilities missing adequate whenToUse`,
  ));

  return checks;
}

// ---------------------------------------------------------------------------
// Complexity Phase Checks
// ---------------------------------------------------------------------------

function auditComplexity(covenant: ModuleCovenant): AuditCheck[] {
  const report = measureComplexity(covenant);

  return [
    check(
      'complexity.score',
      'Complexity assessment',
      'complexity',
      'required',
      report.assessment !== 'excessive' ? 'pass' : 'fail',
      `Complexity: ${report.complexityScore}/100 (${report.assessment})`,
    ),
    check(
      'complexity.dependencies',
      'Dependency count',
      'complexity',
      'informational',
      report.dependencyCount <= 6 ? 'pass' : 'warning',
      `${report.dependencyCount} dependencies (≤6 recommended)`,
    ),
  ];
}

// ---------------------------------------------------------------------------
// Testing Phase Checks (builder's questions)
// ---------------------------------------------------------------------------

function auditTesting(moduleId: string, answers: Record<number, string>): AuditCheck[] {
  const result = assessBuildersQuestions(moduleId, answers);

  const checks: AuditCheck[] = [
    check(
      'testing.builders_questions',
      "Builder's Questions",
      'testing',
      'required',
      result.readyForSubmission ? 'pass' : 'fail',
      result.readyForSubmission
        ? "All 4 Builder's Questions answered substantively"
        : `Builder's Questions score: ${result.score}/100 — ${result.recommendations.join('; ')}`,
    ),
  ];

  return checks;
}

// ---------------------------------------------------------------------------
// Main Audit Function
// ---------------------------------------------------------------------------

/**
 * Run the full pre-disputation audit for a module.
 *
 * Required: covenant (always validated).
 * Optional: conceptArtifact, boundaryInput, buildersAnswers (skipped if not provided).
 */
export function runPreDisputationAudit(
  covenant: ModuleCovenant,
  options: PreDisputationOptions = {},
): PreDisputationReport {
  const auditedAt = new Date();
  const moduleId = covenant.identity.id;
  const checks: AuditCheck[] = [];

  // Phase 1: Concept (if provided)
  if (options.conceptArtifact) {
    checks.push(...auditConceptArtifact(options.conceptArtifact));
  }

  // Phase 2: Boundary (if provided)
  if (options.boundaryInput) {
    checks.push(...auditBoundary(options.boundaryInput));
  }

  // Phase 3: Construction (always)
  checks.push(...auditConstruction(covenant, options.knownModuleIds));

  // Phase 4: Documentation (always)
  checks.push(...auditDocumentation(covenant));

  // Phase 5: Complexity (always)
  checks.push(...auditComplexity(covenant));

  // Phase 6: Testing / Builder's Questions (if provided)
  if (options.buildersAnswers) {
    checks.push(...auditTesting(moduleId, options.buildersAnswers));
  }

  // Compute summary
  const passCount = checks.filter(c => c.status === 'pass').length;
  const failCount = checks.filter(c => c.status === 'fail').length;
  const warningCount = checks.filter(c => c.status === 'warning').length;
  const skipCount = checks.filter(c => c.status === 'skip').length;

  const requiredFailures = checks.filter(c => c.severity === 'required' && c.status === 'fail');
  const blockers = requiredFailures.map(c => `[${c.id}] ${c.message}`);

  let overallVerdict: PreDisputationReport['overallVerdict'];
  if (requiredFailures.length === 0 && failCount === 0) {
    overallVerdict = 'ready';
  } else if (requiredFailures.length === 0) {
    // Non-required failures only → fixable
    overallVerdict = 'needs_work';
  } else {
    overallVerdict = 'not_ready';
  }

  return {
    moduleId,
    auditedAt,
    checks,
    passCount,
    failCount,
    warningCount,
    skipCount,
    overallVerdict,
    blockers,
  };
}
