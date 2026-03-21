// IHS
/**
 * Council Orchestrator — Types (Book II)
 *
 * Types specific to the general-purpose Council Orchestrator engine.
 * Separated from types.ts (253 lines) to respect Rule 1 limits.
 *
 * The orchestrator drives any Scholastic Method cycle through all 8 Offices.
 * It accepts a pluggable OfficeExecutor (the consuming app provides LLM calls)
 * and manages state immutably through the phase sequence.
 *
 * DEPENDS ON: council/types (OfficeId, ArtifactType, CouncilArtifact, CouncilCycle, ArtifactContent)
 */

import type { OfficeId, ArtifactType, CouncilArtifact, ArtifactContent } from './types';

// ---------------------------------------------------------------------------
// Scholastic Method Phases
// ---------------------------------------------------------------------------

/** The 7 canonical phases of the Scholastic Method (Book II) */
export type ScholasticPhase =
  | 'observatio'    // Rector observes a signal
  | 'propositio'    // Speculator proposes
  | 'objectiones'   // Contrarius objects
  | 'iudicium'      // Vindex judges
  | 'probatio'      // Pugil trials
  | 'purificatio'   // Nitor simplifies
  | 'canonizatio';  // Archivist records

/** Ordered sequence of all 7 Scholastic phases */
export const SCHOLASTIC_PHASE_SEQUENCE: readonly ScholasticPhase[] = [
  'observatio',
  'propositio',
  'objectiones',
  'iudicium',
  'probatio',
  'purificatio',
  'canonizatio',
] as const;

/** Maps each phase (+ publication) to the Office that executes it and the artifact it produces */
export const PHASE_TO_OFFICE: Record<ScholasticPhase | 'publication', { office: OfficeId; artifactType: ArtifactType }> = {
  observatio:   { office: 'rector',      artifactType: 'cycle_orchestration' },
  propositio:   { office: 'speculator',  artifactType: 'propositio' },
  objectiones:  { office: 'contrarius',  artifactType: 'objectiones' },
  iudicium:     { office: 'vindex',      artifactType: 'verdict' },
  probatio:     { office: 'pugil',       artifactType: 'trial_report' },
  purificatio:  { office: 'nitor',       artifactType: 'purification_record' },
  canonizatio:  { office: 'archivist',   artifactType: 'canon_record' },
  publication:  { office: 'illuminatio', artifactType: 'publication' },
} as const;

/** All 8 Offices in canonical sequence */
export const FULL_OFFICE_SEQUENCE: readonly OfficeId[] = [
  'rector',
  'speculator',
  'contrarius',
  'vindex',
  'pugil',
  'nitor',
  'archivist',
  'illuminatio',
] as const;

// ---------------------------------------------------------------------------
// Office Execution (Pluggable LLM Interface)
// ---------------------------------------------------------------------------

/** The brief given to an Office — everything it needs to produce its artifact */
export interface OfficeBrief {
  /** Which cycle this belongs to */
  readonly cycleId: string;
  /** Which Office is being invoked */
  readonly officeId: OfficeId;
  /** Current Scholastic phase */
  readonly phase: ScholasticPhase | 'publication';
  /** What triggered this cycle */
  readonly trigger: string;
  /** Artifacts produced by prior Offices in this cycle */
  readonly priorArtifacts: readonly CouncilArtifact[];
  /** Cycle-specific context (e.g., module covenant, diff, vulnerability report) */
  readonly context: Record<string, unknown>;
  /** Instructions for this Office */
  readonly instructions: string;
}

/** What an Office returns after execution */
export interface OfficeResult {
  /** The artifact content produced */
  readonly content: ArtifactContent;
  /** IDs of artifacts this result references */
  readonly references: readonly string[];
  /** Optional reasoning (for debugging, not persisted in artifact) */
  readonly reasoning?: string;
}

/**
 * Pluggable executor interface — the consuming app implements this with LLM calls.
 * Rule 12: "LLM provider is swappable."
 */
export interface OfficeExecutor {
  execute(brief: OfficeBrief): Promise<OfficeResult>;
}

// ---------------------------------------------------------------------------
// Cycle Configuration
// ---------------------------------------------------------------------------

/** Types of Council cycles */
export type CycleType =
  | 'module_admission'
  | 'code_change'
  | 'dependency_update'
  | 'vulnerability_response'
  | 'purification'
  | 'doctrine_update'
  | 'custom';

/** Configuration for starting a Council cycle */
export interface CycleConfig {
  /** What kind of cycle */
  readonly type: CycleType;
  /** What triggered this cycle */
  readonly trigger: string;
  /** Cycle-specific context passed to each Office */
  readonly context: Record<string, unknown>;
  /** Optional phase subset (defaults to all 7 + publication) */
  readonly phases?: readonly (ScholasticPhase | 'publication')[];
  /** How long before a phase is considered stalled (default: 5 min) */
  readonly stallThresholdMs?: number;
  /** Max total cycle duration (default: 30 min) */
  readonly maxDurationMs?: number;
  /** Optional per-phase instructions appended to Office defaults */
  readonly phaseInstructions?: Partial<Record<ScholasticPhase | 'publication', string>>;
}

/** Default cycle timing */
export const CYCLE_DEFAULTS = {
  stallThresholdMs: 5 * 60 * 1000,   // 5 minutes
  maxDurationMs: 30 * 60 * 1000,     // 30 minutes
} as const;

// ---------------------------------------------------------------------------
// Orchestrator State
// ---------------------------------------------------------------------------

/** Status of an individual phase */
export type PhaseStatus = 'pending' | 'executing' | 'completed' | 'failed' | 'skipped';

/** Record of a single phase's execution */
export interface PhaseRecord {
  readonly phase: ScholasticPhase | 'publication';
  readonly officeId: OfficeId;
  readonly status: PhaseStatus;
  readonly artifactId: string | null;
  readonly startedAt: Date | null;
  readonly completedAt: Date | null;
  readonly error?: string;
  readonly durationMs?: number;
}

/** Complete orchestrator state — immutable, new object per transition */
export interface OrchestratorState {
  /** The cycle being orchestrated */
  readonly cycleId: string;
  /** Configuration that started this cycle */
  readonly config: CycleConfig;
  /** Record of each phase's execution */
  readonly phaseRecords: readonly PhaseRecord[];
  /** Index into phaseRecords for the current phase */
  readonly currentPhaseIndex: number;
  /** Artifacts produced so far */
  readonly artifacts: readonly CouncilArtifact[];
  /** Whether a stall has been detected */
  readonly stallDetected: boolean;
  /** Reason for stall (if detected) */
  readonly stallReason?: string;
  /** Whether the cycle was frozen for Steward escalation */
  readonly frozen: boolean;
  /** Resolving axiom provided by the Steward */
  readonly resolvingAxiom?: string;
  /** Cycle start time */
  readonly startedAt: Date;
  /** Total duration so far (ms) */
  readonly totalDurationMs: number;
}

/** Final outcome of a Council cycle */
export type CycleOutcome =
  | 'completed'   // All phases finished successfully
  | 'rejected'    // Vindex rejected the proposal
  | 'stalled'     // A phase exceeded the stall threshold
  | 'frozen'      // Escalated to Steward
  | 'timed_out'   // Total duration exceeded max
  | 'failed';     // An unrecoverable error occurred

/** Result returned when a cycle finishes */
export interface CycleResult {
  /** The cycle ID */
  readonly cycleId: string;
  /** How the cycle ended */
  readonly outcome: CycleOutcome;
  /** Record of each phase */
  readonly phaseRecords: readonly PhaseRecord[];
  /** Artifacts produced */
  readonly artifacts: readonly CouncilArtifact[];
  /** Total duration (ms) */
  readonly totalDurationMs: number;
  /** Reason for stall/freeze */
  readonly stallReason?: string;
  /** Error message (if failed) */
  readonly error?: string;
}
