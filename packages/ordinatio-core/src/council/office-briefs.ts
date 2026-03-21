// IHS
/**
 * Council Office Briefs (Book II)
 *
 * Builds the OfficeBrief for each phase — the structured context an Office
 * needs to produce its artifact. This is the prompt engineering layer.
 *
 * Each Office gets:
 * - Its canonical instructions (role, constraints, output format)
 * - Prior artifacts from this cycle
 * - Cycle-specific context (trigger, module covenant, diff, etc.)
 * - Optional per-phase instructions from the CycleConfig
 *
 * DEPENDS ON: council/types (OfficeId, CouncilArtifact)
 *             council/orchestrator-types (ScholasticPhase, OfficeBrief, CycleConfig, PHASE_TO_OFFICE, SCHOLASTIC_PHASE_SEQUENCE)
 */

import type { OfficeId, CouncilArtifact } from './types';
import type { ScholasticPhase, OfficeBrief, CycleConfig } from './orchestrator-types';
import { PHASE_TO_OFFICE, SCHOLASTIC_PHASE_SEQUENCE } from './orchestrator-types';

// ---------------------------------------------------------------------------
// Office Instructions
// ---------------------------------------------------------------------------

/**
 * Core system prompt for each Office.
 * These define the role, constraints, and expected output format.
 */
export const OFFICE_INSTRUCTIONS: Record<OfficeId, string> = {
  rector:
    'You govern flow. You make NO judgments about correctness. ' +
    'Your role is to initiate cycles, assign artifacts to Offices, enforce sequence, and detect stalls. ' +
    'Produce a cycle_orchestration artifact recording the current phase and artifacts produced so far.',

  speculator:
    'Propose a concrete improvement. You are the Office of Discovery. ' +
    'Include: the signal that triggered this proposal, the specific change, expected benefit, ' +
    'affected modules, risk assessment, and implementation sketch. ' +
    'Be precise — vague proposals waste the Council\'s time.',

  contrarius:
    'Your sole purpose is to challenge. Construct the strongest counter-argument. ' +
    'Defend stability. Argue for non-change. Each objection must include an argument, ' +
    'severity (minor/major/critical), and supporting evidence. ' +
    'End with a recommendation: proceed, modify, or reject.',

  vindex:
    'Judge using the Three Transcendentals: Verum (correctness), Bonum (resilience), ' +
    'Pulchrum (elegance). You create no new reasoning — you weigh the proposition against ' +
    'the objections. Your judgment is: approved, rejected, or modified (with conditions). ' +
    'A rejected proposal ends the cycle.',

  pugil:
    'Assume a hostile world. Design adversarial tests. ' +
    'A module is good because it survives misuse, not because it works in ideal conditions. ' +
    'Include unit, integration, chaos, adversarial, and concurrency tests. ' +
    'Your assessment: passed, failed, or conditional.',

  nitor:
    'Simplify. BeautyDelta must be positive (complexity reduced). ' +
    'Behavior must not change — all tests must still pass. Interfaces must remain stable. ' +
    'Report complexity before/after (lines, cyclomatic complexity, dependencies, exported symbols). ' +
    'List every change made.',

  archivist:
    'Record the decision. Hash the canonical state. Maintain audit lineage. ' +
    'Your canon_record captures: the decision, ADR number, state hash, and files affected. ' +
    'You do not evaluate — you preserve.',

  illuminatio:
    'Publish the outcome. You do NOT influence decisions — you reveal outcomes. ' +
    'Write for the specified audience (developers, agents, steward, or public). ' +
    'Include title, summary, and full body. Clarity is your transcendental.',
};

// ---------------------------------------------------------------------------
// Phase → Office Mapping
// ---------------------------------------------------------------------------

/**
 * Get the Office responsible for a given phase.
 */
export function getOfficeForPhase(phase: ScholasticPhase | 'publication'): OfficeId {
  return PHASE_TO_OFFICE[phase].office;
}

// ---------------------------------------------------------------------------
// Phase Sequence
// ---------------------------------------------------------------------------

/**
 * Get the phase sequence for a cycle.
 * Defaults to all 7 Scholastic phases + publication.
 * Respects `config.phases` subset if provided.
 */
export function getPhaseSequence(
  config: CycleConfig,
): readonly (ScholasticPhase | 'publication')[] {
  const defaultSequence: readonly (ScholasticPhase | 'publication')[] = [
    ...SCHOLASTIC_PHASE_SEQUENCE,
    'publication',
  ];

  if (!config.phases || config.phases.length === 0) {
    return defaultSequence;
  }

  // Filter to only phases in the default sequence, preserving canonical order
  return defaultSequence.filter(p => config.phases!.includes(p));
}

// ---------------------------------------------------------------------------
// Brief Construction
// ---------------------------------------------------------------------------

/**
 * Build the OfficeBrief for a phase — everything the Office needs to produce its artifact.
 */
export function buildOfficeBrief(params: {
  cycleId: string;
  phase: ScholasticPhase | 'publication';
  config: CycleConfig;
  priorArtifacts: readonly CouncilArtifact[];
}): OfficeBrief {
  const { cycleId, phase, config, priorArtifacts } = params;
  const officeId = getOfficeForPhase(phase);

  // Base instructions for this Office
  let instructions = OFFICE_INSTRUCTIONS[officeId];

  // Append per-phase instructions from config if provided
  const phaseExtra = config.phaseInstructions?.[phase];
  if (phaseExtra) {
    instructions = `${instructions}\n\nAdditional instructions: ${phaseExtra}`;
  }

  return {
    cycleId,
    officeId,
    phase,
    trigger: config.trigger,
    priorArtifacts,
    context: config.context,
    instructions,
  };
}
