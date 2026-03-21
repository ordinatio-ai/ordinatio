// IHS
import { describe, it, expect } from 'vitest';
import {
  OFFICE_INSTRUCTIONS,
  getOfficeForPhase,
  getPhaseSequence,
  buildOfficeBrief,
} from './office-briefs';
import type { CycleConfig } from './orchestrator-types';
import { SCHOLASTIC_PHASE_SEQUENCE } from './orchestrator-types';
import type { CouncilArtifact, OfficeId } from './types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeConfig(overrides: Partial<CycleConfig> = {}): CycleConfig {
  return {
    type: 'code_change',
    trigger: 'Dependency update detected',
    context: { package: 'lodash', from: '4.17.0', to: '5.0.0' },
    ...overrides,
  };
}

function makeMockArtifact(officeId: OfficeId): CouncilArtifact {
  return {
    id: `art-mock-${officeId}`,
    type: 'propositio',
    producedBy: officeId,
    cycleId: 'cycle-1',
    version: 1,
    status: 'submitted',
    content: { type: 'propositio', signal: 's', proposal: 'p', benefit: 'b', affectedModules: [], risk: 'r', implementation: 'i' },
    contentHash: 'abc',
    references: [],
    producedAt: new Date(),
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Office Briefs', () => {
  describe('OFFICE_INSTRUCTIONS', () => {
    it('has instructions for all 8 offices', () => {
      const offices: OfficeId[] = [
        'rector', 'speculator', 'contrarius', 'vindex',
        'pugil', 'nitor', 'archivist', 'illuminatio',
      ];
      for (const office of offices) {
        expect(OFFICE_INSTRUCTIONS[office]).toBeDefined();
        expect(OFFICE_INSTRUCTIONS[office].length).toBeGreaterThan(20);
      }
    });
  });

  describe('getOfficeForPhase', () => {
    const cases: [string, OfficeId][] = [
      ['observatio', 'rector'],
      ['propositio', 'speculator'],
      ['objectiones', 'contrarius'],
      ['iudicium', 'vindex'],
      ['probatio', 'pugil'],
      ['purificatio', 'nitor'],
      ['canonizatio', 'archivist'],
      ['publication', 'illuminatio'],
    ];

    it.each(cases)('maps %s to %s', (phase, expectedOffice) => {
      expect(getOfficeForPhase(phase as 'publication')).toBe(expectedOffice);
    });
  });

  describe('getPhaseSequence', () => {
    it('returns all 7 phases + publication by default', () => {
      const seq = getPhaseSequence(makeConfig());
      expect(seq).toHaveLength(8);
      expect(seq[0]).toBe('observatio');
      expect(seq[6]).toBe('canonizatio');
      expect(seq[7]).toBe('publication');
    });

    it('respects custom phase subset', () => {
      const config = makeConfig({ phases: ['propositio', 'objectiones', 'iudicium'] });
      const seq = getPhaseSequence(config);
      expect(seq).toEqual(['propositio', 'objectiones', 'iudicium']);
    });

    it('preserves canonical order even when phases are out of order', () => {
      const config = makeConfig({ phases: ['iudicium', 'propositio', 'canonizatio'] });
      const seq = getPhaseSequence(config);
      expect(seq).toEqual(['propositio', 'iudicium', 'canonizatio']);
    });

    it('handles empty phases array as default', () => {
      const config = makeConfig({ phases: [] });
      const seq = getPhaseSequence(config);
      expect(seq).toHaveLength(8);
    });

    it('includes publication when specified in custom phases', () => {
      const config = makeConfig({ phases: ['propositio', 'publication'] });
      const seq = getPhaseSequence(config);
      expect(seq).toEqual(['propositio', 'publication']);
    });
  });

  describe('buildOfficeBrief', () => {
    it('includes cycleId, officeId, phase', () => {
      const brief = buildOfficeBrief({
        cycleId: 'cycle-42',
        phase: 'propositio',
        config: makeConfig(),
        priorArtifacts: [],
      });
      expect(brief.cycleId).toBe('cycle-42');
      expect(brief.officeId).toBe('speculator');
      expect(brief.phase).toBe('propositio');
    });

    it('includes trigger from config', () => {
      const brief = buildOfficeBrief({
        cycleId: 'c1',
        phase: 'observatio',
        config: makeConfig({ trigger: 'Security alert' }),
        priorArtifacts: [],
      });
      expect(brief.trigger).toBe('Security alert');
    });

    it('includes prior artifacts', () => {
      const priors = [makeMockArtifact('rector')];
      const brief = buildOfficeBrief({
        cycleId: 'c1',
        phase: 'propositio',
        config: makeConfig(),
        priorArtifacts: priors,
      });
      expect(brief.priorArtifacts).toHaveLength(1);
      expect(brief.priorArtifacts[0].producedBy).toBe('rector');
    });

    it('includes context from config', () => {
      const brief = buildOfficeBrief({
        cycleId: 'c1',
        phase: 'observatio',
        config: makeConfig({ context: { severity: 'high' } }),
        priorArtifacts: [],
      });
      expect(brief.context).toEqual({ severity: 'high' });
    });

    it('uses default Office instructions', () => {
      const brief = buildOfficeBrief({
        cycleId: 'c1',
        phase: 'propositio',
        config: makeConfig(),
        priorArtifacts: [],
      });
      expect(brief.instructions).toBe(OFFICE_INSTRUCTIONS.speculator);
    });

    it('appends per-phase instructions from config', () => {
      const config = makeConfig({
        phaseInstructions: { propositio: 'Focus on security implications.' },
      });
      const brief = buildOfficeBrief({
        cycleId: 'c1',
        phase: 'propositio',
        config,
        priorArtifacts: [],
      });
      expect(brief.instructions).toContain(OFFICE_INSTRUCTIONS.speculator);
      expect(brief.instructions).toContain('Focus on security implications.');
    });

    it('maps publication phase to illuminatio office', () => {
      const brief = buildOfficeBrief({
        cycleId: 'c1',
        phase: 'publication',
        config: makeConfig(),
        priorArtifacts: [],
      });
      expect(brief.officeId).toBe('illuminatio');
    });
  });
});
