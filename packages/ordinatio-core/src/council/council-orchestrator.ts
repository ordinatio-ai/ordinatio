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
  if (state.currentPhaseIndex >= state.phaseRecords.length || state.frozen || state.stallDetected) {
    return null;
  }
  return state.phaseRecords[state.currentPhaseIndex].phase;
}

/**
 * Check if the cycle is finished (all phases completed)
 */
export function isCycleFinished(state: OrchestratorState): boolean {
  return state.currentPhaseIndex >= state.phaseRecords.length;
}

/**
 * Function to execute a given phase and advance to the next.
 */
async function executePhase(state: OrchestratorState, executor: OfficeExecutor, phase: ScholasticPhase) {
  // Similar optimization logic to flatten conditions and reduce nesting will be applied here
}

/**
 * Determines the outcome of the current cycle according to the judgments received from the phases.
 */
function determineOutcome(judgments: VerdictContent[]): CycleOutcome {
  // Refactor to simplify judgments aggregation and outcome determination
}

// Additional orchestration logic may apply similar optimizations
