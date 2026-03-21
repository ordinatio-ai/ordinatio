// IHS
/**
 * Module Admission Pipeline — Types (Book VI)
 *
 * Every module passes through five mechanical gates before activation.
 * These types describe the gates, their verdicts, the admission decision,
 * the Module Registry, and the Council Admission Workflow state machine.
 *
 * Book VI §XII: "Covenant enforcement must be machine-readable.
 * Validation must be automatic."
 *
 * DEPENDS ON: covenant/types (ModuleCovenant, ModuleStatus)
 *             governance/types (RiskLevel, GovernancePolicy)
 *             council/types (OfficeId, ArtifactType)
 *             construction/types (ValidationResult, ComplexityReport)
 */

import type { ModuleCovenant, ModuleStatus } from '../covenant/types';
import type { GovernancePolicy } from '../governance/types';
import type { OfficeId, ArtifactType } from '../council/types';
import type { ValidationResult, ComplexityReport, PreDisputationReport } from '../construction/types';

// ---------------------------------------------------------------------------
// Gate Definitions
// ---------------------------------------------------------------------------

/** The five gates every module must pass */
export type GateId = 'structural' | 'permission' | 'conflict' | 'governance' | 'sandbox';

/** The ordered sequence of gate evaluation */
export const GATE_SEQUENCE: readonly GateId[] = [
  'structural',
  'permission',
  'conflict',
  'governance',
  'sandbox',
] as const;

/** Outcome of a single gate */
export type GateVerdict = 'pass' | 'fail' | 'warn';

/** Severity of a gate issue */
export type GateIssueSeverity = 'error' | 'warning';

/** A single issue raised by a gate */
export interface GateIssue {
  /** Which gate raised this issue */
  readonly gate: GateId;
  /** Severity — error blocks admission, warning is advisory */
  readonly severity: GateIssueSeverity;
  /** Human-readable description of the issue */
  readonly message: string;
  /** Dot-separated path to the problematic field (e.g., 'capabilities[3].risk') */
  readonly path?: string;
}

/** Result of running a single gate */
export interface GateResult {
  /** Which gate produced this result */
  readonly gate: GateId;
  /** Overall verdict for this gate */
  readonly verdict: GateVerdict;
  /** Issues discovered (empty if clean pass) */
  readonly issues: readonly GateIssue[];
  /** How long the gate took to run (milliseconds) */
  readonly durationMs: number;
  /** Gate-specific metadata (e.g., validationResult, complexityReport) */
  readonly metadata?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Admission Decision
// ---------------------------------------------------------------------------

/** Final admission verdict */
export type AdmissionVerdict =
  | 'admitted'              // Fully admitted — Local modules with zero warnings
  | 'admitted_conditional'  // Admitted with conditions — warnings present or experimental
  | 'deferred'              // Requires higher-level review (ecclesial/canonical)
  | 'rejected';             // Failed one or more gates

/** Reason for deferral (ecclesial/canonical modules need additional review) */
export type DeferralReason =
  | 'requires_cross_enterprise_review'  // Ecclesial — needs cross-enterprise validation
  | 'requires_council_disputation';     // Canonical — needs full Scholastic Method

/** Request to run the admission pipeline */
export interface AdmissionRequest {
  /** The module covenant to evaluate */
  readonly covenant: ModuleCovenant;
  /** All currently registered covenants (for conflict detection) */
  readonly existingCovenants: readonly ModuleCovenant[];
  /** Governance policy (optional — enables governance gate checks) */
  readonly policy?: GovernancePolicy;
  /** Pre-disputation report (optional — if already run during construction) */
  readonly preDisputationReport?: PreDisputationReport;
  /** Gates to skip (e.g., ['sandbox'] for dry-run analysis) */
  readonly skipGates?: readonly GateId[];
}

/** The complete admission decision produced by the pipeline */
export interface AdmissionDecision {
  /** Module being evaluated */
  readonly moduleId: string;
  /** Module classification */
  readonly moduleStatus: ModuleStatus;
  /** Final verdict */
  readonly verdict: AdmissionVerdict;
  /** Results from each gate that was run */
  readonly gates: readonly GateResult[];
  /** Total issues across all gates */
  readonly totalIssues: number;
  /** Count of errors (block admission) */
  readonly errorCount: number;
  /** Count of warnings (advisory) */
  readonly warningCount: number;
  /** When the decision was made */
  readonly decidedAt: Date;
  /** Total pipeline duration (milliseconds) */
  readonly durationMs: number;
  /** Why admission was deferred (only present when verdict = 'deferred') */
  readonly deferralReason?: DeferralReason;
  /** Reasons for rejection (only present when verdict = 'rejected') */
  readonly rejectionReasons: readonly string[];
  /** Complexity report from structural gate (if available) */
  readonly complexityReport?: ComplexityReport;
  /** Validation result from structural gate (if available) */
  readonly validationResult?: ValidationResult;
}

// ---------------------------------------------------------------------------
// Module Registry
// ---------------------------------------------------------------------------

/** A registered module with its admission metadata */
export interface ModuleRegistryEntry {
  /** The module's covenant */
  readonly covenant: ModuleCovenant;
  /** When the module was admitted */
  readonly admittedAt: Date;
  /** The admission decision that granted entry */
  readonly decision: AdmissionDecision;
  /** Capability IDs this module provides (indexed for fast lookup) */
  readonly capabilityIds: readonly string[];
  /** Event IDs this module emits */
  readonly eventIds: readonly string[];
  /** Event IDs this module subscribes to */
  readonly subscriptionIds: readonly string[];
}

/** The immutable module registry — tracks all admitted modules */
export interface ModuleRegistry {
  /** Modules by ID */
  readonly modules: ReadonlyMap<string, ModuleRegistryEntry>;
  /** Reverse index: capability ID → module ID */
  readonly capabilityIndex: ReadonlyMap<string, string>;
  /** Reverse index: event ID → module ID (emitter) */
  readonly eventIndex: ReadonlyMap<string, string>;
}

// ---------------------------------------------------------------------------
// Council Admission Workflow (Scholastic Method)
// ---------------------------------------------------------------------------

/**
 * The six phases of Council admission.
 * Only canonical and ecclesial modules go through this process.
 * Local modules are auto-admitted.
 */
export type AdmissionPhase =
  | 'observatio'    // Rector observes and initiates
  | 'propositio'    // Speculator proposes admission
  | 'objectiones'   // Contrarius argues against
  | 'iudicium'      // Vindex judges
  | 'probatio'      // Pugil trials
  | 'canonizatio';  // Archivist records

/** Status of the overall workflow */
export type AdmissionWorkflowStatus = 'in_progress' | 'approved' | 'rejected' | 'stalled';

/** Outcome of a single phase */
export type PhaseOutcome = 'completed' | 'failed' | 'skipped';

/** The ordered sequence of admission phases */
export const ADMISSION_PHASE_SEQUENCE: readonly AdmissionPhase[] = [
  'observatio',
  'propositio',
  'objectiones',
  'iudicium',
  'probatio',
  'canonizatio',
] as const;

/** Maps each phase to its responsible Office and expected artifact type */
export const PHASE_OFFICE_MAP: Record<AdmissionPhase, { office: OfficeId; artifactType: ArtifactType }> = {
  observatio:   { office: 'rector',     artifactType: 'cycle_orchestration' },
  propositio:   { office: 'speculator', artifactType: 'propositio' },
  objectiones:  { office: 'contrarius', artifactType: 'objectiones' },
  iudicium:     { office: 'vindex',     artifactType: 'verdict' },
  probatio:     { office: 'pugil',      artifactType: 'trial_report' },
  canonizatio:  { office: 'archivist',  artifactType: 'canon_record' },
} as const;

/** Result of a single admission phase */
export interface AdmissionPhaseResult {
  /** Which phase */
  readonly phase: AdmissionPhase;
  /** Which Office executed this phase */
  readonly officeId: OfficeId;
  /** What artifact type was produced */
  readonly artifactType: ArtifactType;
  /** Outcome of this phase */
  readonly outcome: PhaseOutcome;
  /** When this phase completed */
  readonly completedAt: Date;
}

/** The complete Council admission workflow state machine */
export interface CouncilAdmissionWorkflow {
  /** Unique workflow ID */
  readonly id: string;
  /** Module being evaluated */
  readonly moduleId: string;
  /** Current workflow status */
  readonly status: AdmissionWorkflowStatus;
  /** Current phase (null if completed or stalled) */
  readonly currentPhase: AdmissionPhase | null;
  /** Results of completed phases */
  readonly phases: readonly AdmissionPhaseResult[];
  /** Gate results from the admission pipeline (input to the workflow) */
  readonly gateResults: readonly GateResult[];
  /** When the workflow started */
  readonly startedAt: Date;
  /** When the workflow completed (null if in progress) */
  readonly completedAt: Date | null;
  /** Final verdict (null until finalized) */
  readonly finalVerdict: AdmissionVerdict | null;
  /** Reason for stall (if status = 'stalled') */
  readonly stallReason?: string;
}
