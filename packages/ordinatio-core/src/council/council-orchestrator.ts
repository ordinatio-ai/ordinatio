// IHS
/**
 * Council Orchestrator — Main Engine (Book II)
 *
 * The general-purpose orchestrator that drives any Scholastic Method cycle
 * through all 8 Offices. Pure async functions. Accepts an OfficeExecutor
 * (the consuming app provides the LLM implementation) and manages state
 * immutably through the phase sequence.
 *
 * Book II mandates:
 * - Artifact-based communication (never conversational)
 * - Separation of Offices (no self-approval)
 * - Scholastic Method sequence (7 phases + publication)
 * - Three Transcendentals (Verum/Bonum/Pulchrum) as judgment criteria
 * - Stall → freeze → Steward resolving axiom escalation path
 *
 * DEPENDS ON: council/types (CouncilArtifact, VerdictContent)
 *             council/orchestrator-types (OrchestratorState, CycleResult, etc.)
 *             council/artifact-helpers (createArtifact)
 *             council/artifact-validator (validateArtifactContent, hasValidType)
 *             council/office-briefs (buildOfficeBrief, getPhaseSequence, getOfficeForPhase)
 */

import type { CouncilArtifact, VerdictContent } from './types';
import type {
  OrchestratorState,
  CycleResult,
  CycleConfig,
  CycleOutcome,
  OfficeExecutor,
  PhaseRecord,
  ScholasticPhase,
} from './orchestrator-types';
import { CYCLE_DEFAULTS, PHASE_TO_OFFICE } from './orchestrator-types';
import { createArtifact } from './artifact-helpers';
import { validateArtifactContent, hasValidType } from './artifact-validator';
import { buildOfficeBrief, getPhaseSequence } from './office-briefs';

// ---------------------------------------------------------------------------
// State Initialization
// ---------------------------------------------------------------------------

/**
 * Initialize orchestrator state from a cycle config.
 * Creates pending PhaseRecords for each phase in the sequence.
 */
export function initializeState(config: CycleConfig): OrchestratorState {
  const phases = getPhaseSequence(config);
  const cycleId = `cycle-${Date.now()}`;

  const phaseRecords: PhaseRecord[] = phases.map(phase => ({
    phase,
    officeId: PHASE_TO_OFFICE[phase].office,
    status: 'pending',
    artifactId: null,
    startedAt: null,
    completedAt: null,
  }));

  return {
    cycleId,
    config,
    phaseRecords,
    currentPhaseIndex: 0,
    artifacts: [],
    stallDetected: false,
    frozen: false,
    startedAt: new Date(),
    totalDurationMs: 0,
  };
}

// ---------------------------------------------------------------------------
// State Queries
// ---------------------------------------------------------------------------

/**
 * Get the current phase (or null if finished).
 */
export function getCurrentOrchestratorPhase(
  state: OrchestratorState,
): (ScholasticPhase | 'publication') | null {
  if (state.currentPhaseIndex >= state.phaseRecords.length) return null;
  if (state.frozen || state.stallDetected) return null;
  return state.phaseRecords[state.currentPhaseIndex].phase;
}

/**
 * Check if the cycle is finished (all phases done, rejected, stalled, or frozen).
 */
export function isFinished(state: OrchestratorState): boolean {
  if (state.frozen) return true;
  if (state.stallDetected) return true;
  if (state.currentPhaseIndex >= state.phaseRecords.length) return true;

  // Check if a phase was rejected (Vindex rejection skips remaining)
  const hasSkipped = state.phaseRecords.some(r => r.status === 'skipped');
  if (hasSkipped && state.currentPhaseIndex >= state.phaseRecords.length) return true;

  return false;
}

// ---------------------------------------------------------------------------
// Stall Detection
// ---------------------------------------------------------------------------

/**
 * Detect if the cycle has stalled (exceeded max duration).
 */
export function detectStall(
  state: OrchestratorState,
): { stalled: boolean; reason?: string } {
  const maxDuration = state.config.maxDurationMs ?? CYCLE_DEFAULTS.maxDurationMs;
  const elapsed = Date.now() - state.startedAt.getTime();

  if (elapsed > maxDuration) {
    return {
      stalled: true,
      reason: `Cycle exceeded max duration (${maxDuration}ms). Elapsed: ${elapsed}ms`,
    };
  }

  return { stalled: false };
}

// ---------------------------------------------------------------------------
// Freeze / Resume
// ---------------------------------------------------------------------------

/**
 * Freeze the cycle — escalate to Steward per Book II §VII.
 */
export function freezeState(
  state: OrchestratorState,
  reason: string,
): OrchestratorState {
  return {
    ...state,
    frozen: true,
    stallDetected: true,
    stallReason: reason,
    totalDurationMs: Date.now() - state.startedAt.getTime(),
  };
}

/**
 * Resume a frozen cycle with a Steward's resolving axiom.
 * Unfreezes the cycle so execution can continue.
 */
export function resumeWithAxiom(
  state: OrchestratorState,
  resolvingAxiom: string,
): OrchestratorState {
  if (!state.frozen) return state;

  return {
    ...state,
    frozen: false,
    stallDetected: false,
    stallReason: undefined,
    resolvingAxiom,
  };
}

// ---------------------------------------------------------------------------
// Phase Execution
// ---------------------------------------------------------------------------

/**
 * Execute the current phase: build brief, call executor, validate, create artifact.
 * Returns a new state with the phase completed (or failed) and index advanced.
 */
export async function executePhase(
  state: OrchestratorState,
  executor: OfficeExecutor,
): Promise<OrchestratorState> {
  const currentPhase = getCurrentOrchestratorPhase(state);
  if (currentPhase === null) return state;

  const phaseIndex = state.currentPhaseIndex;
  const record = state.phaseRecords[phaseIndex];
  const phaseStartedAt = new Date();

  // Mark phase as executing
  const executingRecords = updatePhaseRecord(state.phaseRecords, phaseIndex, {
    status: 'executing',
    startedAt: phaseStartedAt,
  });

  // Build the brief for this Office
  const brief = buildOfficeBrief({
    cycleId: state.cycleId,
    phase: currentPhase,
    config: state.config,
    priorArtifacts: state.artifacts,
  });

  try {
    // Call the executor (LLM)
    const result = await executor.execute(brief);

    // Validate the returned content
    if (!hasValidType(result.content)) {
      return failPhase(state, executingRecords, phaseIndex, phaseStartedAt,
        'Executor returned content without a valid artifact type');
    }

    const validation = validateArtifactContent(result.content);
    if (!validation.valid) {
      const issuesSummary = validation.issues.map(i => `${i.field}: ${i.message}`).join('; ');
      return failPhase(state, executingRecords, phaseIndex, phaseStartedAt,
        `Invalid artifact content: ${issuesSummary}`);
    }

    // Create the artifact
    const mapping = PHASE_TO_OFFICE[currentPhase];
    const artifact = createArtifact({
      cycleId: state.cycleId,
      producedBy: record.officeId,
      type: mapping.artifactType,
      content: result.content,
      references: result.references,
    });

    // Mark phase completed
    const completedAt = new Date();
    const completedRecords = updatePhaseRecord(executingRecords, phaseIndex, {
      status: 'completed',
      completedAt,
      artifactId: artifact.id,
      durationMs: completedAt.getTime() - phaseStartedAt.getTime(),
    });

    const newArtifacts = [...state.artifacts, artifact];

    // Check for Vindex rejection — skip remaining phases
    if (currentPhase === 'iudicium' && isRejection(artifact)) {
      const skippedRecords = skipRemainingPhases(completedRecords, phaseIndex + 1);
      return {
        ...state,
        phaseRecords: skippedRecords,
        currentPhaseIndex: skippedRecords.length, // Past the end
        artifacts: newArtifacts,
        totalDurationMs: Date.now() - state.startedAt.getTime(),
      };
    }

    return {
      ...state,
      phaseRecords: completedRecords,
      currentPhaseIndex: phaseIndex + 1,
      artifacts: newArtifacts,
      totalDurationMs: Date.now() - state.startedAt.getTime(),
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    return failPhase(state, executingRecords, phaseIndex, phaseStartedAt,
      `Executor threw: ${errorMsg}`);
  }
}

// ---------------------------------------------------------------------------
// Result Building
// ---------------------------------------------------------------------------

/**
 * Build the final CycleResult from the orchestrator state.
 */
export function buildResult(state: OrchestratorState): CycleResult {
  return {
    cycleId: state.cycleId,
    outcome: determineOutcome(state),
    phaseRecords: state.phaseRecords,
    artifacts: state.artifacts,
    totalDurationMs: state.totalDurationMs || (Date.now() - state.startedAt.getTime()),
    stallReason: state.stallReason,
  };
}

// ---------------------------------------------------------------------------
// Main Orchestrator Loop
// ---------------------------------------------------------------------------

/**
 * Run a complete Council cycle through all phases.
 *
 * 1. Initialize state
 * 2. Loop: detect stall → execute phase → advance
 * 3. Build result
 */
export async function runCycle(
  executor: OfficeExecutor,
  config: CycleConfig,
): Promise<CycleResult> {
  let state = initializeState(config);

  while (!isFinished(state)) {
    // Check for stall
    const stallCheck = detectStall(state);
    if (stallCheck.stalled) {
      state = freezeState(state, stallCheck.reason!);
      break;
    }

    // Execute current phase
    state = await executePhase(state, executor);
  }

  return buildResult(state);
}

// ---------------------------------------------------------------------------
// Internal Helpers
// ---------------------------------------------------------------------------

function updatePhaseRecord(
  records: readonly PhaseRecord[],
  index: number,
  updates: Partial<PhaseRecord>,
): PhaseRecord[] {
  return records.map((r, i) =>
    i === index ? { ...r, ...updates } : r,
  );
}

function failPhase(
  state: OrchestratorState,
  records: PhaseRecord[],
  phaseIndex: number,
  phaseStartedAt: Date,
  error: string,
): OrchestratorState {
  const completedAt = new Date();
  const failedRecords = updatePhaseRecord(records, phaseIndex, {
    status: 'failed',
    completedAt,
    error,
    durationMs: completedAt.getTime() - phaseStartedAt.getTime(),
  });

  return {
    ...state,
    phaseRecords: failedRecords,
    currentPhaseIndex: phaseIndex + 1,
    totalDurationMs: Date.now() - state.startedAt.getTime(),
  };
}

function skipRemainingPhases(records: PhaseRecord[], fromIndex: number): PhaseRecord[] {
  return records.map((r, i) =>
    i >= fromIndex ? { ...r, status: 'skipped' as const } : r,
  );
}

function isRejection(artifact: CouncilArtifact): boolean {
  const content = artifact.content;
  if (content.type !== 'verdict') return false;
  return (content as VerdictContent).judgment === 'rejected';
}

function determineOutcome(state: OrchestratorState): CycleOutcome {
  if (state.frozen) return 'frozen';
  if (state.stallDetected) return 'stalled';

  // Check for rejection
  const hasRejection = state.artifacts.some(a =>
    a.content.type === 'verdict' && (a.content as VerdictContent).judgment === 'rejected',
  );
  if (hasRejection) return 'rejected';

  // Check for failures
  const hasFailed = state.phaseRecords.some(r => r.status === 'failed');
  if (hasFailed) return 'failed';

  // All phases completed or skipped
  const allDone = state.phaseRecords.every(r =>
    r.status === 'completed' || r.status === 'skipped',
  );
  if (allDone) return 'completed';

  return 'timed_out';
}
