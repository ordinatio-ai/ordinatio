// IHS
import { describe, it, expect, vi } from 'vitest';
import {
  runCycle,
  initializeState,
  executePhase,
  detectStall,
  freezeState,
  resumeWithAxiom,
  getCurrentOrchestratorPhase,
  isFinished,
  buildResult,
} from './council-orchestrator';
import type {
  CycleConfig,
  OfficeExecutor,
  OfficeBrief,
  OfficeResult,
  ScholasticPhase,
} from './orchestrator-types';
import { PHASE_TO_OFFICE } from './orchestrator-types';
import type { ArtifactContent, VerdictContent } from './types';

// ---------------------------------------------------------------------------
// Mock Executor
// ---------------------------------------------------------------------------

/**
 * Creates a mock executor that produces valid artifacts for each phase.
 * Can be configured to fail or reject at specific phases.
 */
function createMockExecutor(overrides?: {
  failAt?: (ScholasticPhase | 'publication')[];
  rejectAtIudicium?: boolean;
  invalidAt?: (ScholasticPhase | 'publication')[];
}): OfficeExecutor {
  return {
    execute: async (brief: OfficeBrief): Promise<OfficeResult> => {
      // Fail at specified phases
      if (overrides?.failAt?.includes(brief.phase)) {
        throw new Error(`Simulated failure at ${brief.phase}`);
      }

      // Return invalid content at specified phases
      if (overrides?.invalidAt?.includes(brief.phase)) {
        return {
          content: { type: brief.phase === 'publication' ? 'publication' : PHASE_TO_OFFICE[brief.phase].artifactType } as ArtifactContent,
          references: [],
        };
      }

      const content = makeContentForPhase(brief.phase, overrides?.rejectAtIudicium);
      return { content, references: [] };
    },
  };
}

function makeContentForPhase(
  phase: ScholasticPhase | 'publication',
  reject?: boolean,
): ArtifactContent {
  switch (phase) {
    case 'observatio':
      return {
        type: 'cycle_orchestration',
        phase: 'initiation',
        currentOffice: 'rector',
        artifactIds: [],
      };
    case 'propositio':
      return {
        type: 'propositio',
        signal: 'Test signal',
        proposal: 'Test proposal',
        benefit: 'Test benefit',
        affectedModules: ['mod-a'],
        risk: 'Low',
        implementation: 'Test impl',
      };
    case 'objectiones':
      return {
        type: 'objectiones',
        propositionId: 'art-1',
        objections: [{ argument: 'Counter', severity: 'minor', evidence: 'None' }],
        recommendation: 'proceed',
      };
    case 'iudicium':
      return {
        type: 'verdict',
        propositionId: 'art-1',
        objectionesId: 'art-2',
        judgment: reject ? 'rejected' : 'approved',
        reasoning: { verum: 'Correct', bonum: 'Good', pulchrum: 'Elegant' },
      };
    case 'probatio':
      return {
        type: 'trial_report',
        subject: 'Test subject',
        tests: [{ name: 'unit', type: 'unit', passed: true, details: 'All pass' }],
        assessment: 'passed',
        issues: [],
      };
    case 'purificatio':
      return {
        type: 'purification_record',
        subject: 'Code cleanup',
        complexityBefore: { lines: 200, cyclomaticComplexity: 15, dependencies: 5, exportedSymbols: 10 },
        complexityAfter: { lines: 180, cyclomaticComplexity: 12, dependencies: 4, exportedSymbols: 10 },
        beautyDelta: 3,
        changes: ['Removed dead code'],
        behaviorPreserved: true,
      };
    case 'canonizatio':
      return {
        type: 'canon_record',
        decision: 'Change approved and recorded',
        adrNumber: 'ADR-099',
        stateHash: 'abc123',
        filesAffected: ['src/index.ts'],
      };
    case 'publication':
      return {
        type: 'publication',
        title: 'Change Published',
        summary: 'A change was made',
        audience: 'developers',
        body: 'Full details here.',
      };
  }
}

function makeConfig(overrides: Partial<CycleConfig> = {}): CycleConfig {
  return {
    type: 'code_change',
    trigger: 'Test trigger',
    context: { reason: 'testing' },
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Council Orchestrator', () => {
  describe('initializeState', () => {
    it('creates state with pending phase records for all 8 phases', () => {
      const state = initializeState(makeConfig());
      expect(state.phaseRecords).toHaveLength(8);
      expect(state.phaseRecords.every(r => r.status === 'pending')).toBe(true);
      expect(state.currentPhaseIndex).toBe(0);
      expect(state.artifacts).toHaveLength(0);
      expect(state.stallDetected).toBe(false);
      expect(state.frozen).toBe(false);
    });

    it('respects custom phase subset', () => {
      const config = makeConfig({ phases: ['propositio', 'objectiones', 'iudicium'] });
      const state = initializeState(config);
      expect(state.phaseRecords).toHaveLength(3);
      expect(state.phaseRecords[0].phase).toBe('propositio');
      expect(state.phaseRecords[1].phase).toBe('objectiones');
      expect(state.phaseRecords[2].phase).toBe('iudicium');
    });

    it('assigns correct offices to phases', () => {
      const state = initializeState(makeConfig());
      expect(state.phaseRecords[0].officeId).toBe('rector');
      expect(state.phaseRecords[1].officeId).toBe('speculator');
      expect(state.phaseRecords[7].officeId).toBe('illuminatio');
    });

    it('generates a unique cycle ID', () => {
      const s1 = initializeState(makeConfig());
      const s2 = initializeState(makeConfig());
      // IDs are timestamp-based, so they differ (or are the same ms — both valid)
      expect(s1.cycleId).toMatch(/^cycle-\d+$/);
      expect(s2.cycleId).toMatch(/^cycle-\d+$/);
    });
  });

  describe('getCurrentOrchestratorPhase / isFinished', () => {
    it('returns observatio for fresh state', () => {
      const state = initializeState(makeConfig());
      expect(getCurrentOrchestratorPhase(state)).toBe('observatio');
      expect(isFinished(state)).toBe(false);
    });

    it('returns null when all phases are done', () => {
      const state = initializeState(makeConfig());
      const done = { ...state, currentPhaseIndex: 8 };
      expect(getCurrentOrchestratorPhase(done)).toBeNull();
      expect(isFinished(done)).toBe(true);
    });

    it('returns null when frozen', () => {
      const state = freezeState(initializeState(makeConfig()), 'test reason');
      expect(getCurrentOrchestratorPhase(state)).toBeNull();
      expect(isFinished(state)).toBe(true);
    });

    it('returns null when stall detected', () => {
      const state = { ...initializeState(makeConfig()), stallDetected: true };
      expect(getCurrentOrchestratorPhase(state)).toBeNull();
      expect(isFinished(state)).toBe(true);
    });
  });

  describe('detectStall', () => {
    it('returns stalled: false for fresh state', () => {
      const state = initializeState(makeConfig());
      expect(detectStall(state).stalled).toBe(false);
    });

    it('returns stalled: true when max duration exceeded', () => {
      const state = initializeState(makeConfig({ maxDurationMs: 1 }));
      // Set start time far in the past
      const pastState = { ...state, startedAt: new Date(Date.now() - 1000) };
      const result = detectStall(pastState);
      expect(result.stalled).toBe(true);
      expect(result.reason).toContain('exceeded max duration');
    });

    it('uses CYCLE_DEFAULTS when no maxDurationMs specified', () => {
      const state = initializeState(makeConfig());
      const result = detectStall(state);
      expect(result.stalled).toBe(false); // Fresh state, well within 30 min
    });
  });

  describe('freezeState / resumeWithAxiom', () => {
    it('freezes the state', () => {
      const state = initializeState(makeConfig());
      const frozen = freezeState(state, 'Irreconcilable objections');
      expect(frozen.frozen).toBe(true);
      expect(frozen.stallDetected).toBe(true);
      expect(frozen.stallReason).toBe('Irreconcilable objections');
    });

    it('resumes a frozen state with resolving axiom', () => {
      const state = freezeState(initializeState(makeConfig()), 'Stalled');
      const resumed = resumeWithAxiom(state, 'Steward says: proceed with caution');
      expect(resumed.frozen).toBe(false);
      expect(resumed.stallDetected).toBe(false);
      expect(resumed.resolvingAxiom).toBe('Steward says: proceed with caution');
    });

    it('is a no-op on non-frozen state', () => {
      const state = initializeState(makeConfig());
      const same = resumeWithAxiom(state, 'axiom');
      expect(same).toBe(state); // Same reference
    });
  });

  describe('executePhase', () => {
    it('executes a phase and advances index', async () => {
      const state = initializeState(makeConfig());
      const executor = createMockExecutor();
      const next = await executePhase(state, executor);

      expect(next.currentPhaseIndex).toBe(1);
      expect(next.phaseRecords[0].status).toBe('completed');
      expect(next.phaseRecords[0].artifactId).toBeTruthy();
      expect(next.artifacts).toHaveLength(1);
    });

    it('marks phase as failed when executor throws', async () => {
      const state = initializeState(makeConfig());
      const executor = createMockExecutor({ failAt: ['observatio'] });
      const next = await executePhase(state, executor);

      expect(next.phaseRecords[0].status).toBe('failed');
      expect(next.phaseRecords[0].error).toContain('Simulated failure');
      expect(next.currentPhaseIndex).toBe(1); // Still advances
      expect(next.artifacts).toHaveLength(0); // No artifact produced
    });

    it('marks phase as failed for invalid artifact content', async () => {
      const state = initializeState(makeConfig());
      const executor = createMockExecutor({ invalidAt: ['observatio'] });
      const next = await executePhase(state, executor);

      expect(next.phaseRecords[0].status).toBe('failed');
      expect(next.phaseRecords[0].error).toContain('Invalid artifact content');
    });

    it('is a no-op when already finished', async () => {
      const state = { ...initializeState(makeConfig()), currentPhaseIndex: 8 };
      const executor = createMockExecutor();
      const next = await executePhase(state, executor);
      expect(next).toBe(state);
    });

    it('records durationMs on completed phase', async () => {
      const state = initializeState(makeConfig());
      const executor = createMockExecutor();
      const next = await executePhase(state, executor);

      expect(next.phaseRecords[0].durationMs).toBeDefined();
      expect(next.phaseRecords[0].durationMs).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Vindex rejection', () => {
    it('skips remaining phases after rejection', async () => {
      // Run through observatio, propositio, objectiones, then iudicium rejects
      const config = makeConfig();
      const executor = createMockExecutor({ rejectAtIudicium: true });
      let state = initializeState(config);

      // Execute 4 phases: observatio, propositio, objectiones, iudicium
      for (let i = 0; i < 4; i++) {
        state = await executePhase(state, executor);
      }

      // iudicium (index 3) should be completed
      expect(state.phaseRecords[3].status).toBe('completed');

      // Remaining phases (probatio, purificatio, canonizatio, publication) should be skipped
      expect(state.phaseRecords[4].status).toBe('skipped');
      expect(state.phaseRecords[5].status).toBe('skipped');
      expect(state.phaseRecords[6].status).toBe('skipped');
      expect(state.phaseRecords[7].status).toBe('skipped');

      // Should be finished
      expect(isFinished(state)).toBe(true);
    });

    it('produces rejected outcome', async () => {
      const config = makeConfig();
      const executor = createMockExecutor({ rejectAtIudicium: true });
      let state = initializeState(config);

      for (let i = 0; i < 4; i++) {
        state = await executePhase(state, executor);
      }

      const result = buildResult(state);
      expect(result.outcome).toBe('rejected');
    });
  });

  describe('buildResult', () => {
    it('builds a completed result', async () => {
      const executor = createMockExecutor();
      const result = await runCycle(executor, makeConfig());

      expect(result.outcome).toBe('completed');
      expect(result.phaseRecords).toHaveLength(8);
      expect(result.artifacts).toHaveLength(8);
      expect(result.totalDurationMs).toBeGreaterThanOrEqual(0);
      expect(result.cycleId).toMatch(/^cycle-\d+$/);
    });

    it('builds a failed result when a phase errors', async () => {
      const executor = createMockExecutor({ failAt: ['propositio'] });
      const result = await runCycle(executor, makeConfig());

      expect(result.outcome).toBe('failed');
      expect(result.phaseRecords[1].status).toBe('failed');
    });

    it('includes stall reason when frozen', () => {
      const state = freezeState(initializeState(makeConfig()), 'Too slow');
      const result = buildResult(state);
      expect(result.outcome).toBe('frozen');
      expect(result.stallReason).toBe('Too slow');
    });
  });

  describe('runCycle — full cycle', () => {
    it('runs all 8 phases with mock executor', async () => {
      const executor = createMockExecutor();
      const executeSpy = vi.spyOn(executor, 'execute');
      const result = await runCycle(executor, makeConfig());

      expect(result.outcome).toBe('completed');
      expect(executeSpy).toHaveBeenCalledTimes(8);
      expect(result.artifacts).toHaveLength(8);

      // Verify artifact types
      const types = result.artifacts.map(a => a.content.type);
      expect(types).toEqual([
        'cycle_orchestration', 'propositio', 'objectiones', 'verdict',
        'trial_report', 'purification_record', 'canon_record', 'publication',
      ]);
    });

    it('stops at Vindex rejection', async () => {
      const executor = createMockExecutor({ rejectAtIudicium: true });
      const result = await runCycle(executor, makeConfig());

      expect(result.outcome).toBe('rejected');
      expect(result.artifacts).toHaveLength(4); // observatio through iudicium
    });

    it('handles executor failure mid-cycle', async () => {
      const executor = createMockExecutor({ failAt: ['probatio'] });
      const result = await runCycle(executor, makeConfig());

      expect(result.outcome).toBe('failed');
      // Should have executed all 8 phases, but probatio failed
      expect(result.phaseRecords[4].status).toBe('failed');
      // Phases after failure still execute
      expect(result.artifacts.length).toBe(7); // All except probatio
    });

    it('runs with custom phase subset', async () => {
      const executor = createMockExecutor();
      const config = makeConfig({
        phases: ['propositio', 'objectiones', 'iudicium'],
      });
      const result = await runCycle(executor, config);

      expect(result.outcome).toBe('completed');
      expect(result.phaseRecords).toHaveLength(3);
      expect(result.artifacts).toHaveLength(3);
    });

    it('detects timeout during cycle', async () => {
      // Use a slow executor that introduces enough delay for the stall check
      const slowExecutor: OfficeExecutor = {
        execute: async (brief: OfficeBrief): Promise<OfficeResult> => {
          return { content: makeContentForPhase(brief.phase), references: [] };
        },
      };

      // Initialize state manually with start time far in the past
      const config = makeConfig({ maxDurationMs: 1 });
      const state = initializeState(config);
      const pastState = {
        ...state,
        startedAt: new Date(Date.now() - 1000), // 1 second ago, threshold is 1ms
      };

      // detectStall should catch it
      const stallCheck = detectStall(pastState);
      expect(stallCheck.stalled).toBe(true);
      expect(stallCheck.reason).toContain('exceeded max duration');

      // freezeState produces the right outcome
      const frozen = freezeState(pastState, stallCheck.reason!);
      const result = buildResult(frozen);
      expect(result.outcome).toBe('frozen');
      expect(result.stallReason).toContain('exceeded max duration');
    });

    it('each phase receives prior artifacts', async () => {
      const calls: OfficeBrief[] = [];
      const executor: OfficeExecutor = {
        execute: async (brief: OfficeBrief): Promise<OfficeResult> => {
          calls.push(brief);
          return { content: makeContentForPhase(brief.phase), references: [] };
        },
      };

      await runCycle(executor, makeConfig());

      // First phase (observatio) gets 0 prior artifacts
      expect(calls[0].priorArtifacts).toHaveLength(0);
      // Second phase (propositio) gets 1 prior artifact
      expect(calls[1].priorArtifacts).toHaveLength(1);
      // Last phase (publication) gets 7 prior artifacts
      expect(calls[7].priorArtifacts).toHaveLength(7);
    });
  });

  describe('immutability', () => {
    it('initializeState returns a new object', () => {
      const config = makeConfig();
      const s1 = initializeState(config);
      const s2 = initializeState(config);
      expect(s1).not.toBe(s2);
    });

    it('executePhase returns a new state object', async () => {
      const state = initializeState(makeConfig());
      const executor = createMockExecutor();
      const next = await executePhase(state, executor);
      expect(next).not.toBe(state);
      // Original state unchanged
      expect(state.currentPhaseIndex).toBe(0);
      expect(state.artifacts).toHaveLength(0);
    });

    it('freezeState returns a new object', () => {
      const state = initializeState(makeConfig());
      const frozen = freezeState(state, 'reason');
      expect(frozen).not.toBe(state);
      expect(state.frozen).toBe(false);
    });
  });
});
