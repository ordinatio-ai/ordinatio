// IHS
/**
 * Module Construction Standards — Types (Book V)
 *
 * Machine-readable definitions for the seven construction standards
 * mandated by Book V §XVI. Every new module passes through these
 * structures before Council admission.
 *
 * DEPENDS ON: covenant/types (ModuleIdentity), council/types (ComplexityMetrics)
 * USED BY: covenant-validator, builders-questions, boundary-checker,
 *          complexity-meter, pre-disputation-audit, module-scaffolder
 */

import type { ModuleIdentity } from '../covenant/types';
import type { ComplexityMetrics } from '../council/types';

// ---------------------------------------------------------------------------
// 1. Concept Artifact (Book V §IV)
// ---------------------------------------------------------------------------

/** The structured Module Concept Document. No code before this exists. */
export interface ConceptArtifact {
  readonly moduleId: string;
  readonly version: string;
  readonly createdAt: Date;
  readonly author: string;
  /** What capability this module provides */
  readonly capabilityDefined: string;
  /** Why this is universal (not particular to one business) */
  readonly universalNeed: string;
  /** What data/events this module consumes */
  readonly inputs: readonly string[];
  /** What data/events this module produces */
  readonly outputs: readonly string[];
  /** Invariants: what is always true, what never happens */
  readonly invariants: {
    readonly alwaysTrue: readonly string[];
    readonly neverHappens: readonly string[];
  };
  /** What this module deliberately does NOT do */
  readonly nonGoals: readonly string[];
  // Required Reflection (Book V §IV)
  /** Why this module should NOT exist */
  readonly argumentAgainst: string;
  /** Risks of abstracting this capability */
  readonly abstractionRisks: readonly string[];
  /** Simpler alternatives considered and rejected */
  readonly rejectedAlternatives: readonly {
    readonly alternative: string;
    readonly rejectionReason: string;
  }[];
}

// ---------------------------------------------------------------------------
// 2. Module Boundary Check (Book V §II-III)
// ---------------------------------------------------------------------------

export type BoundaryCheckCategory =
  | 'necessity'
  | 'universality'
  | 'isolation'
  | 'simplification';

export interface BoundaryCheckItem {
  readonly category: BoundaryCheckCategory;
  readonly question: string;
  readonly passed: boolean;
  readonly evidence: string;
}

export interface BoundaryCheckResult {
  readonly moduleId: string;
  readonly checkedAt: Date;
  readonly items: readonly BoundaryCheckItem[];
  readonly overallPass: boolean;
  readonly categoryScores: Record<BoundaryCheckCategory, { passed: number; total: number }>;
  readonly recommendation: 'proceed' | 'revise' | 'reject';
  readonly rejectionReasons: readonly string[];
}

/** Input for a boundary check — answers to the diagnostic questions */
export interface BoundaryCheckInput {
  readonly moduleId: string;
  // Necessity (Book V §II)
  readonly appearsRepeatedly: boolean;
  readonly existingModulesInsufficient: boolean;
  readonly absenceCreatesDistortion: boolean;
  readonly canBeSolvedByComposition: boolean;
  // Universality (Book V §III)
  readonly unrelatedOrgsNeed: boolean;
  readonly dependsOnIndustryAssumptions: boolean;
  readonly brandingRemovableWithoutLoss: boolean;
  // Isolation
  readonly removableWithoutSystemicCollapse: boolean;
  readonly hasClearBoundary: boolean;
  // Simplification
  readonly reducesTotalComplexity: boolean;
}

// ---------------------------------------------------------------------------
// 3. Dependency Policy (Book V §VI)
// ---------------------------------------------------------------------------

export type DependencyWrapping = 'adapter' | 'facade' | 'port';

export interface DependencyDeclaration {
  readonly packageName: string;
  readonly wrapping: DependencyWrapping;
  readonly internalInterface: string;
  readonly replaceable: boolean;
  readonly leaksTypes: boolean;
}

export interface DependencyViolation {
  readonly packageName: string;
  readonly violation: string;
  readonly severity: 'error' | 'warning';
}

export interface DependencyPolicy {
  readonly moduleId: string;
  readonly declarations: readonly DependencyDeclaration[];
  readonly violations: readonly DependencyViolation[];
  readonly compliant: boolean;
}

// ---------------------------------------------------------------------------
// 4. Builder's Questions (Book V §VIII)
// ---------------------------------------------------------------------------

export interface BuildersAnswer {
  readonly question: string;
  readonly answer: string;
  readonly substantive: boolean;
}

export interface BuildersQuestionsResult {
  readonly moduleId: string;
  readonly answers: readonly BuildersAnswer[];
  readonly score: number;
  readonly allAnswered: boolean;
  readonly recommendations: readonly string[];
  readonly readyForSubmission: boolean;
}

// ---------------------------------------------------------------------------
// 5. Complexity Report (for Nitor BeautyDelta)
// ---------------------------------------------------------------------------

export interface ComplexityReport {
  readonly moduleId: string;
  readonly measuredAt: Date;
  readonly metrics: ComplexityMetrics;
  readonly capabilityCount: number;
  readonly invariantCount: number;
  readonly eventCount: number;
  readonly entityCount: number;
  readonly dependencyCount: number;
  /** Normalized score 0-100 (lower = less complex = better) */
  readonly complexityScore: number;
  readonly assessment: 'simple' | 'moderate' | 'complex' | 'excessive';
}

export const COMPLEXITY_THRESHOLDS = {
  simple: 25,
  moderate: 50,
  complex: 75,
} as const;

// ---------------------------------------------------------------------------
// 6. Pre-Disputation Audit (Book V §VII)
// ---------------------------------------------------------------------------

export type AuditCheckSeverity = 'required' | 'recommended' | 'informational';
export type AuditCheckStatus = 'pass' | 'fail' | 'skip' | 'warning';

export interface AuditCheck {
  readonly id: string;
  readonly name: string;
  readonly phase: 'concept' | 'boundary' | 'construction' | 'documentation' | 'testing' | 'complexity';
  readonly severity: AuditCheckSeverity;
  readonly status: AuditCheckStatus;
  readonly message: string;
}

export interface PreDisputationReport {
  readonly moduleId: string;
  readonly auditedAt: Date;
  readonly checks: readonly AuditCheck[];
  readonly passCount: number;
  readonly failCount: number;
  readonly warningCount: number;
  readonly skipCount: number;
  readonly overallVerdict: 'ready' | 'needs_work' | 'not_ready';
  readonly blockers: readonly string[];
}

// ---------------------------------------------------------------------------
// 7. Module Scaffold
// ---------------------------------------------------------------------------

export interface ScaffoldFile {
  readonly path: string;
  readonly content: string;
  readonly required: boolean;
  readonly purpose: string;
}

export interface ModuleScaffold {
  readonly identity: ModuleIdentity;
  readonly packageName: string;
  readonly packageDir: string;
  readonly files: readonly ScaffoldFile[];
  readonly totalFiles: number;
  readonly requiredFiles: number;
}

// ---------------------------------------------------------------------------
// 8. Covenant Validation
// ---------------------------------------------------------------------------

export type ValidationSeverity = 'error' | 'warning' | 'info';

export interface ValidationIssue {
  readonly path: string;
  readonly message: string;
  readonly severity: ValidationSeverity;
}

export interface ValidationResult {
  readonly moduleId: string;
  readonly valid: boolean;
  readonly issues: readonly ValidationIssue[];
  readonly errorCount: number;
  readonly warningCount: number;
  readonly infoCount: number;
}
