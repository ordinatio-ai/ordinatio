// IHS
/**
 * The Agentic Council — Self-Maintaining Codebase (Book II)
 *
 * Eight permanent Offices. Each is an AI agent role. Models change; Offices endure.
 * No Office may approve its own work or perform another's role.
 *
 * Workflow: Observation → Speculator → Contrarius → Vindex → Pugil → Nitor
 *           → Archivist → Illuminatio → REST
 *
 * All inter-Office communication is via structured, schema-validated, versioned,
 * signed artifacts. NEVER conversational. Invalid artifact = ignored input.
 *
 * Success = silence. The ideal Council is mostly idle.
 * Per Rule VIII: "The highest state of a module is stillness."
 */

// ---------------------------------------------------------------------------
// Office Definitions
// ---------------------------------------------------------------------------

export type OfficeId =
  | 'rector'       // Order — initiates cycles, enforces sequence
  | 'speculator'   // Discovery — proposes improvements
  | 'contrarius'   // Opposition — argues for non-change
  | 'vindex'       // Judgment — evaluates against Canon laws
  | 'pugil'        // Trial — adversarial testing
  | 'nitor'        // Purification — simplifies, reduces complexity
  | 'archivist'    // Preservation — records decisions, hashes states
  | 'illuminatio'; // Manifestation — publishes doctrine

export interface Office {
  readonly id: OfficeId;
  /** The faculty this office exercises */
  readonly faculty: string;
  /** What this office is responsible for */
  readonly responsibility: string;
  /** What artifact type this office produces */
  readonly outputArtifact: ArtifactType;
}

export const OFFICES: readonly Office[] = [
  { id: 'rector', faculty: 'Order', responsibility: 'Initiates cycles, assigns artifacts, enforces sequence, detects stalls', outputArtifact: 'cycle_orchestration' },
  { id: 'speculator', faculty: 'Discovery', responsibility: 'Monitors signals, proposes improvements', outputArtifact: 'propositio' },
  { id: 'contrarius', faculty: 'Opposition', responsibility: 'Constructs counter-argument, defends stability, argues for non-change', outputArtifact: 'objectiones' },
  { id: 'vindex', faculty: 'Judgment', responsibility: 'Evaluates proposition vs objections against Canon laws (Verum, Bonum, Pulchrum)', outputArtifact: 'verdict' },
  { id: 'pugil', faculty: 'Trial', responsibility: 'Adversarial testing, chaos simulation, invalid input injection', outputArtifact: 'trial_report' },
  { id: 'nitor', faculty: 'Purification', responsibility: 'Simplifies implementation, reduces complexity, eliminates redundancy', outputArtifact: 'purification_record' },
  { id: 'archivist', faculty: 'Preservation', responsibility: 'Records decisions, hashes canonical states, maintains audit lineage', outputArtifact: 'canon_record' },
  { id: 'illuminatio', faculty: 'Manifestation', responsibility: 'Publishes doctrine, generates white papers, announces changes', outputArtifact: 'publication' },
] as const;

// ---------------------------------------------------------------------------
// Council Artifacts
// ---------------------------------------------------------------------------

export type ArtifactType =
  | 'cycle_orchestration'
  | 'propositio'
  | 'objectiones'
  | 'verdict'
  | 'trial_report'
  | 'purification_record'
  | 'canon_record'
  | 'publication';

export type ArtifactStatus = 'draft' | 'submitted' | 'accepted' | 'rejected' | 'superseded';

export interface CouncilArtifact {
  /** Unique artifact ID */
  readonly id: string;
  /** Type of artifact */
  readonly type: ArtifactType;
  /** Office that produced this */
  readonly producedBy: OfficeId;
  /** Cycle this belongs to */
  readonly cycleId: string;
  /** Version (artifacts can be revised) */
  readonly version: number;
  /** Status */
  readonly status: ArtifactStatus;
  /** The artifact content (type-specific) */
  readonly content: ArtifactContent;
  /** SHA-256 hash of content for integrity */
  readonly contentHash: string;
  /** References to other artifacts this depends on */
  readonly references: readonly string[];
  /** When this was produced */
  readonly producedAt: Date;
}

// ---------------------------------------------------------------------------
// Artifact Content Types
// ---------------------------------------------------------------------------

export type ArtifactContent =
  | PropositioContent
  | ObjectionesContent
  | VerdictContent
  | TrialReportContent
  | PurificationRecordContent
  | CanonRecordContent
  | PublicationContent
  | CycleOrchestrationContent;

export interface PropositioContent {
  readonly type: 'propositio';
  /** What signal triggered this proposal */
  readonly signal: string;
  /** The proposed change */
  readonly proposal: string;
  /** Expected benefit */
  readonly benefit: string;
  /** Affected modules */
  readonly affectedModules: readonly string[];
  /** Risk assessment */
  readonly risk: string;
  /** Implementation sketch */
  readonly implementation: string;
}

export interface ObjectionesContent {
  readonly type: 'objectiones';
  /** The propositio being opposed */
  readonly propositionId: string;
  /** Arguments against the change */
  readonly objections: readonly {
    readonly argument: string;
    readonly severity: 'minor' | 'major' | 'critical';
    readonly evidence: string;
  }[];
  /** Recommendation: proceed, modify, or reject */
  readonly recommendation: 'proceed' | 'modify' | 'reject';
}

export interface VerdictContent {
  readonly type: 'verdict';
  /** The propositio being judged */
  readonly propositionId: string;
  /** The objectiones considered */
  readonly objectionesId: string;
  /** Final judgment */
  readonly judgment: 'approved' | 'rejected' | 'modified';
  /** Reasoning against Verum (truth), Bonum (goodness), Pulchrum (beauty) */
  readonly reasoning: {
    readonly verum: string;  // Does it make the system more truthful/correct?
    readonly bonum: string;  // Does it make the system better/more useful?
    readonly pulchrum: string; // Does it make the system more beautiful/elegant?
  };
  /** Conditions for approval (if modified) */
  readonly conditions?: readonly string[];
}

export interface TrialReportContent {
  readonly type: 'trial_report';
  /** What was tested */
  readonly subject: string;
  /** Tests performed */
  readonly tests: readonly {
    readonly name: string;
    readonly type: 'unit' | 'integration' | 'chaos' | 'adversarial' | 'concurrency';
    readonly passed: boolean;
    readonly details: string;
  }[];
  /** Overall assessment */
  readonly assessment: 'passed' | 'failed' | 'conditional';
  /** Issues found */
  readonly issues: readonly string[];
}

export interface PurificationRecordContent {
  readonly type: 'purification_record';
  /** What was simplified */
  readonly subject: string;
  /** Complexity before (lines, cyclomatic, dependencies) */
  readonly complexityBefore: ComplexityMetrics;
  /** Complexity after */
  readonly complexityAfter: ComplexityMetrics;
  /** BeautyDelta = Complexity_before - Complexity_after (must be positive) */
  readonly beautyDelta: number;
  /** Changes made */
  readonly changes: readonly string[];
  /** Behavior verification: all tests still pass? */
  readonly behaviorPreserved: boolean;
}

export interface ComplexityMetrics {
  readonly lines: number;
  readonly cyclomaticComplexity: number;
  readonly dependencies: number;
  readonly exportedSymbols: number;
}

export interface CanonRecordContent {
  readonly type: 'canon_record';
  /** Decision recorded */
  readonly decision: string;
  /** ADR number */
  readonly adrNumber: string;
  /** Hash of the canonical state at this point */
  readonly stateHash: string;
  /** Files affected */
  readonly filesAffected: readonly string[];
}

export interface PublicationContent {
  readonly type: 'publication';
  /** What is being published */
  readonly title: string;
  /** Summary for external consumption */
  readonly summary: string;
  /** Target audience */
  readonly audience: 'developers' | 'agents' | 'steward' | 'public';
  /** Full content */
  readonly body: string;
}

export interface CycleOrchestrationContent {
  readonly type: 'cycle_orchestration';
  /** Cycle phase */
  readonly phase: 'initiation' | 'in_progress' | 'completed' | 'stalled';
  /** Current office turn */
  readonly currentOffice: OfficeId;
  /** Artifacts produced so far */
  readonly artifactIds: readonly string[];
  /** Stall detection */
  readonly stallDetected?: boolean;
  readonly stallReason?: string;
}

// ---------------------------------------------------------------------------
// Council Cycle
// ---------------------------------------------------------------------------

export type CycleStatus = 'active' | 'completed' | 'stalled' | 'frozen';

export interface CouncilCycle {
  /** Unique cycle ID */
  readonly id: string;
  /** What triggered this cycle */
  readonly trigger: string;
  /** Current status */
  readonly status: CycleStatus;
  /** Artifacts produced in sequence */
  readonly artifacts: readonly string[];
  /** When the cycle started */
  readonly startedAt: Date;
  /** When the cycle ended (if completed) */
  readonly endedAt?: Date;
  /** If frozen, the resolving axiom from the Steward */
  readonly resolvingAxiom?: string;
}
