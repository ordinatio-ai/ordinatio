// IHS
/**
 * Council Admission Workflow — Scholastic Method State Machine (Book VI)
 *
 * State machine for the six-phase Council admission process.
 * Only canonical and ecclesial modules go through this.
 * Defines phase transitions but does NOT invoke actual AI agent Offices
 * (that's Phase 4: Council Orchestrator).
 *
 * Phases:
 * 1. Observatio  → Rector initiates
 * 2. Propositio  → Speculator proposes
 * 3. Objectiones → Contrarius objects
 * 4. Iudicium    → Vindex judges
 * 5. Probatio    → Pugil trials
 * 6. Canonizatio → Archivist records
 *
 * DEPENDS ON: council/types (OfficeId, ArtifactType), admission types
 * USED BY: Phase 4 (Council Orchestrator)
 */

import type { ArtifactType } from '../council/types';
import type {
  CouncilAdmissionWorkflow,
  AdmissionPhase,
  AdmissionPhaseResult,
  AdmissionWorkflowStatus,
  AdmissionVerdict,
  GateResult,
  PhaseOutcome,
} from './types';
import { ADMISSION_PHASE_SEQUENCE, PHASE_OFFICE_MAP } from './types';

// ---------------------------------------------------------------------------
// Workflow Creation
// ---------------------------------------------------------------------------

/**
 * Create a new Council admission workflow for a module.
 * Starts at the first phase ('observatio') in 'in_progress' status.
 *
 * @param moduleId - The module being evaluated
 * @param gateResults - Results from the admission pipeline gates
 */
export function createCouncilWorkflow(
  moduleId: string,
  gateResults: readonly GateResult[],
): CouncilAdmissionWorkflow {
  return {
    id: `council-${moduleId}-${Date.now()}`,
    moduleId,
    status: 'in_progress',
    currentPhase: ADMISSION_PHASE_SEQUENCE[0],
    phases: [],
    gateResults,
    startedAt: new Date(),
    completedAt: null,
    finalVerdict: null,
  };
}

// ---------------------------------------------------------------------------
// Phase Queries
// ---------------------------------------------------------------------------

/**
 * Get the current phase details (phase, office, artifact type).
 * Returns null if workflow is completed or stalled.
 */
export function getCurrentPhase(
  workflow: CouncilAdmissionWorkflow,
): { phase: AdmissionPhase; office: string; artifactType: ArtifactType } | null {
  if (!workflow.currentPhase) return null;
  const mapping = PHASE_OFFICE_MAP[workflow.currentPhase];
  return {
    phase: workflow.currentPhase,
    office: mapping.office,
    artifactType: mapping.artifactType,
  };
}

/**
 * Get the expected artifact type for a phase.
 */
export function getExpectedArtifact(phase: AdmissionPhase): ArtifactType {
  return PHASE_OFFICE_MAP[phase].artifactType;
}

/**
 * Check if the workflow is complete (all phases done or finalized).
 */
export function isComplete(workflow: CouncilAdmissionWorkflow): boolean {
  return workflow.status === 'approved' || workflow.status === 'rejected';
}

/**
 * Check if the workflow can advance to the next phase.
 * True if in_progress and current phase matches the next expected phase.
 */
export function canAdvance(workflow: CouncilAdmissionWorkflow): boolean {
  if (workflow.status !== 'in_progress') return false;
  if (!workflow.currentPhase) return false;
  return true;
}

// ---------------------------------------------------------------------------
// Phase Transitions
// ---------------------------------------------------------------------------

/**
 * Complete a phase and advance to the next one.
 * Idempotent: completing the wrong phase is a no-op.
 *
 * @param workflow - The current workflow state
 * @param phase - The phase being completed (must match currentPhase)
 * @param outcome - The outcome of this phase
 */
export function completePhase(
  workflow: CouncilAdmissionWorkflow,
  phase: AdmissionPhase,
  outcome: PhaseOutcome,
): CouncilAdmissionWorkflow {
  // Idempotent: wrong phase = no-op
  if (workflow.currentPhase !== phase) return workflow;
  if (workflow.status !== 'in_progress') return workflow;

  const mapping = PHASE_OFFICE_MAP[phase];
  const phaseResult: AdmissionPhaseResult = {
    phase,
    officeId: mapping.office,
    artifactType: mapping.artifactType,
    outcome,
    completedAt: new Date(),
  };

  const newPhases = [...workflow.phases, phaseResult];

  // Determine next phase
  const currentIndex = ADMISSION_PHASE_SEQUENCE.indexOf(phase);
  const nextPhase = currentIndex < ADMISSION_PHASE_SEQUENCE.length - 1
    ? ADMISSION_PHASE_SEQUENCE[currentIndex + 1]
    : null;

  return {
    ...workflow,
    phases: newPhases,
    currentPhase: nextPhase,
  };
}

/**
 * Stall the workflow (e.g., due to irreconcilable objections).
 */
export function stallWorkflow(
  workflow: CouncilAdmissionWorkflow,
  reason: string,
): CouncilAdmissionWorkflow {
  if (isComplete(workflow)) return workflow;

  return {
    ...workflow,
    status: 'stalled',
    currentPhase: null,
    stallReason: reason,
  };
}

/**
 * Finalize the workflow with a verdict.
 * Can only be called when all phases are complete or workflow is stalled.
 *
 * @param workflow - The current workflow state
 * @param verdict - The final admission verdict
 */
export function finalizeWorkflow(
  workflow: CouncilAdmissionWorkflow,
  verdict: AdmissionVerdict,
): CouncilAdmissionWorkflow {
  // Already finalized
  if (isComplete(workflow)) return workflow;

  // Can finalize if all phases done (currentPhase is null after last phase) or stalled
  const allPhasesDone = workflow.currentPhase === null;
  const isStalled = workflow.status === 'stalled';

  if (!allPhasesDone && !isStalled) return workflow;

  const finalStatus: AdmissionWorkflowStatus =
    verdict === 'admitted' || verdict === 'admitted_conditional' || verdict === 'deferred'
      ? 'approved'
      : 'rejected';

  return {
    ...workflow,
    status: finalStatus,
    completedAt: new Date(),
    finalVerdict: verdict,
  };
}
