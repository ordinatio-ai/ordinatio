// IHS
import { describe, it, expect } from 'vitest';
import {
  createCouncilWorkflow,
  getCurrentPhase,
  getExpectedArtifact,
  isComplete,
  canAdvance,
  completePhase,
  stallWorkflow,
  finalizeWorkflow,
} from './council-admission';
import type { CouncilAdmissionWorkflow, GateResult, AdmissionPhase } from './types';
import { ADMISSION_PHASE_SEQUENCE, PHASE_OFFICE_MAP } from './types';

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

function makeGateResults(): readonly GateResult[] {
  return [
    { gate: 'structural', verdict: 'pass', issues: [], durationMs: 1 },
    { gate: 'permission', verdict: 'pass', issues: [], durationMs: 1 },
    { gate: 'conflict', verdict: 'pass', issues: [], durationMs: 1 },
    { gate: 'governance', verdict: 'pass', issues: [], durationMs: 1 },
    { gate: 'sandbox', verdict: 'pass', issues: [], durationMs: 1 },
  ];
}

function advanceToPhase(
  workflow: CouncilAdmissionWorkflow,
  targetPhaseIndex: number,
): CouncilAdmissionWorkflow {
  let current = workflow;
  for (let i = 0; i < targetPhaseIndex; i++) {
    current = completePhase(current, ADMISSION_PHASE_SEQUENCE[i], 'completed');
  }
  return current;
}

function completeAllPhases(workflow: CouncilAdmissionWorkflow): CouncilAdmissionWorkflow {
  return advanceToPhase(workflow, ADMISSION_PHASE_SEQUENCE.length);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Council Admission Workflow', () => {
  describe('createCouncilWorkflow', () => {
    it('creates a workflow at observatio phase', () => {
      const wf = createCouncilWorkflow('test-module', makeGateResults());
      expect(wf.moduleId).toBe('test-module');
      expect(wf.status).toBe('in_progress');
      expect(wf.currentPhase).toBe('observatio');
      expect(wf.phases).toHaveLength(0);
      expect(wf.gateResults).toHaveLength(5);
      expect(wf.finalVerdict).toBeNull();
      expect(wf.completedAt).toBeNull();
    });

    it('generates a unique ID', () => {
      const wf1 = createCouncilWorkflow('mod-a', makeGateResults());
      const wf2 = createCouncilWorkflow('mod-b', makeGateResults());
      expect(wf1.id).not.toBe(wf2.id);
    });
  });

  describe('getCurrentPhase', () => {
    it('returns observatio phase details at start', () => {
      const wf = createCouncilWorkflow('test-module', makeGateResults());
      const phase = getCurrentPhase(wf);
      expect(phase).not.toBeNull();
      expect(phase!.phase).toBe('observatio');
      expect(phase!.office).toBe('rector');
      expect(phase!.artifactType).toBe('cycle_orchestration');
    });

    it('returns null when workflow is complete', () => {
      const wf = completeAllPhases(createCouncilWorkflow('test', makeGateResults()));
      const finalized = finalizeWorkflow(wf, 'admitted');
      expect(getCurrentPhase(finalized)).toBeNull();
    });
  });

  describe('getExpectedArtifact', () => {
    it('maps each phase to its artifact type', () => {
      expect(getExpectedArtifact('observatio')).toBe('cycle_orchestration');
      expect(getExpectedArtifact('propositio')).toBe('propositio');
      expect(getExpectedArtifact('objectiones')).toBe('objectiones');
      expect(getExpectedArtifact('iudicium')).toBe('verdict');
      expect(getExpectedArtifact('probatio')).toBe('trial_report');
      expect(getExpectedArtifact('canonizatio')).toBe('canon_record');
    });
  });

  describe('phase sequence', () => {
    it('advances through all 6 phases in order', () => {
      let wf = createCouncilWorkflow('test', makeGateResults());

      for (let i = 0; i < ADMISSION_PHASE_SEQUENCE.length; i++) {
        expect(wf.currentPhase).toBe(ADMISSION_PHASE_SEQUENCE[i]);
        wf = completePhase(wf, ADMISSION_PHASE_SEQUENCE[i], 'completed');
        expect(wf.phases).toHaveLength(i + 1);
      }

      // After all phases, currentPhase is null
      expect(wf.currentPhase).toBeNull();
      expect(wf.phases).toHaveLength(6);
    });

    it('records correct office and artifact for each phase', () => {
      const wf = completeAllPhases(createCouncilWorkflow('test', makeGateResults()));

      for (let i = 0; i < ADMISSION_PHASE_SEQUENCE.length; i++) {
        const phase = ADMISSION_PHASE_SEQUENCE[i];
        const result = wf.phases[i];
        expect(result.phase).toBe(phase);
        expect(result.officeId).toBe(PHASE_OFFICE_MAP[phase].office);
        expect(result.artifactType).toBe(PHASE_OFFICE_MAP[phase].artifactType);
        expect(result.outcome).toBe('completed');
      }
    });
  });

  describe('completePhase — idempotency', () => {
    it('out-of-order phase is no-op', () => {
      const wf = createCouncilWorkflow('test', makeGateResults());
      // Try to complete propositio while at observatio
      const result = completePhase(wf, 'propositio', 'completed');
      expect(result.phases).toHaveLength(0);
      expect(result.currentPhase).toBe('observatio');
    });

    it('completing already-completed workflow is no-op', () => {
      let wf = completeAllPhases(createCouncilWorkflow('test', makeGateResults()));
      wf = finalizeWorkflow(wf, 'admitted');
      const result = completePhase(wf, 'observatio', 'completed');
      expect(result.status).toBe('approved'); // unchanged
    });
  });

  describe('stallWorkflow', () => {
    it('stalls an in-progress workflow', () => {
      const wf = createCouncilWorkflow('test', makeGateResults());
      const stalled = stallWorkflow(wf, 'Irreconcilable objections');
      expect(stalled.status).toBe('stalled');
      expect(stalled.currentPhase).toBeNull();
      expect(stalled.stallReason).toBe('Irreconcilable objections');
    });

    it('stalling a completed workflow is no-op', () => {
      let wf = completeAllPhases(createCouncilWorkflow('test', makeGateResults()));
      wf = finalizeWorkflow(wf, 'admitted');
      const result = stallWorkflow(wf, 'Too late');
      expect(result.status).toBe('approved');
    });
  });

  describe('finalizeWorkflow', () => {
    it('finalizes with admitted after all phases', () => {
      const wf = completeAllPhases(createCouncilWorkflow('test', makeGateResults()));
      const finalized = finalizeWorkflow(wf, 'admitted');
      expect(finalized.status).toBe('approved');
      expect(finalized.finalVerdict).toBe('admitted');
      expect(finalized.completedAt).not.toBeNull();
    });

    it('finalizes with rejected after all phases', () => {
      const wf = completeAllPhases(createCouncilWorkflow('test', makeGateResults()));
      const finalized = finalizeWorkflow(wf, 'rejected');
      expect(finalized.status).toBe('rejected');
      expect(finalized.finalVerdict).toBe('rejected');
    });

    it('finalizes stalled workflow with rejected', () => {
      const stalled = stallWorkflow(
        createCouncilWorkflow('test', makeGateResults()),
        'Blocked',
      );
      const finalized = finalizeWorkflow(stalled, 'rejected');
      expect(finalized.status).toBe('rejected');
      expect(finalized.finalVerdict).toBe('rejected');
    });

    it('finalizing already-finalized workflow is no-op', () => {
      let wf = completeAllPhases(createCouncilWorkflow('test', makeGateResults()));
      wf = finalizeWorkflow(wf, 'admitted');
      const result = finalizeWorkflow(wf, 'rejected');
      expect(result.finalVerdict).toBe('admitted'); // unchanged
    });

    it('cannot finalize workflow still in progress (phases remaining)', () => {
      const wf = createCouncilWorkflow('test', makeGateResults());
      const result = finalizeWorkflow(wf, 'admitted');
      expect(result.finalVerdict).toBeNull(); // not finalized
      expect(result.status).toBe('in_progress');
    });
  });

  describe('isComplete', () => {
    it('returns false for in_progress', () => {
      expect(isComplete(createCouncilWorkflow('test', makeGateResults()))).toBe(false);
    });

    it('returns false for stalled', () => {
      const stalled = stallWorkflow(createCouncilWorkflow('test', makeGateResults()), 'Blocked');
      expect(isComplete(stalled)).toBe(false);
    });

    it('returns true for approved', () => {
      let wf = completeAllPhases(createCouncilWorkflow('test', makeGateResults()));
      wf = finalizeWorkflow(wf, 'admitted');
      expect(isComplete(wf)).toBe(true);
    });

    it('returns true for rejected', () => {
      let wf = completeAllPhases(createCouncilWorkflow('test', makeGateResults()));
      wf = finalizeWorkflow(wf, 'rejected');
      expect(isComplete(wf)).toBe(true);
    });
  });

  describe('canAdvance', () => {
    it('returns true for in_progress workflow', () => {
      expect(canAdvance(createCouncilWorkflow('test', makeGateResults()))).toBe(true);
    });

    it('returns false for stalled workflow', () => {
      const stalled = stallWorkflow(createCouncilWorkflow('test', makeGateResults()), 'Blocked');
      expect(canAdvance(stalled)).toBe(false);
    });

    it('returns false for completed workflow', () => {
      let wf = completeAllPhases(createCouncilWorkflow('test', makeGateResults()));
      wf = finalizeWorkflow(wf, 'admitted');
      expect(canAdvance(wf)).toBe(false);
    });
  });

  describe('full walkthrough', () => {
    it('observatio → propositio → objectiones → iudicium → probatio → canonizatio → approved', () => {
      let wf = createCouncilWorkflow('canonical-module', makeGateResults());

      // Phase 1: Observatio
      expect(getCurrentPhase(wf)!.office).toBe('rector');
      wf = completePhase(wf, 'observatio', 'completed');

      // Phase 2: Propositio
      expect(getCurrentPhase(wf)!.office).toBe('speculator');
      wf = completePhase(wf, 'propositio', 'completed');

      // Phase 3: Objectiones
      expect(getCurrentPhase(wf)!.office).toBe('contrarius');
      wf = completePhase(wf, 'objectiones', 'completed');

      // Phase 4: Iudicium
      expect(getCurrentPhase(wf)!.office).toBe('vindex');
      wf = completePhase(wf, 'iudicium', 'completed');

      // Phase 5: Probatio
      expect(getCurrentPhase(wf)!.office).toBe('pugil');
      wf = completePhase(wf, 'probatio', 'completed');

      // Phase 6: Canonizatio
      expect(getCurrentPhase(wf)!.office).toBe('archivist');
      wf = completePhase(wf, 'canonizatio', 'completed');

      // All phases done
      expect(wf.currentPhase).toBeNull();
      expect(wf.phases).toHaveLength(6);

      // Finalize
      wf = finalizeWorkflow(wf, 'admitted');
      expect(isComplete(wf)).toBe(true);
      expect(wf.status).toBe('approved');
      expect(wf.finalVerdict).toBe('admitted');
    });
  });
});
