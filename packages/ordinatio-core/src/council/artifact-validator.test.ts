// IHS
import { describe, it, expect } from 'vitest';
import {
  validateArtifactContent,
  hasValidType,
  getExpectedArtifactType,
} from './artifact-validator';
import type {
  PropositioContent,
  ObjectionesContent,
  VerdictContent,
  TrialReportContent,
  PurificationRecordContent,
  CanonRecordContent,
  PublicationContent,
  CycleOrchestrationContent,
  ArtifactContent,
  OfficeId,
} from './types';

// ---------------------------------------------------------------------------
// Valid Content Factories
// ---------------------------------------------------------------------------

function validPropositio(): PropositioContent {
  return {
    type: 'propositio',
    signal: 'Dependency out of date',
    proposal: 'Upgrade lodash to v5',
    benefit: 'Security patch',
    affectedModules: ['mod-a'],
    risk: 'Low',
    implementation: 'Run pnpm update',
  };
}

function validObjectiones(): ObjectionesContent {
  return {
    type: 'objectiones',
    propositionId: 'art-1',
    objections: [
      { argument: 'Breaking change', severity: 'major', evidence: 'Changelog says so' },
    ],
    recommendation: 'modify',
  };
}

function validVerdict(): VerdictContent {
  return {
    type: 'verdict',
    propositionId: 'art-1',
    objectionesId: 'art-2',
    judgment: 'approved',
    reasoning: {
      verum: 'Correct upgrade path',
      bonum: 'Fixes vulnerability',
      pulchrum: 'No added complexity',
    },
  };
}

function validTrialReport(): TrialReportContent {
  return {
    type: 'trial_report',
    subject: 'lodash upgrade',
    tests: [
      { name: 'unit tests pass', type: 'unit', passed: true, details: '1000/1000' },
    ],
    assessment: 'passed',
    issues: [],
  };
}

function validPurificationRecord(): PurificationRecordContent {
  return {
    type: 'purification_record',
    subject: 'lodash usage',
    complexityBefore: { lines: 200, cyclomaticComplexity: 15, dependencies: 5, exportedSymbols: 10 },
    complexityAfter: { lines: 180, cyclomaticComplexity: 12, dependencies: 4, exportedSymbols: 10 },
    beautyDelta: 3,
    changes: ['Removed unused imports'],
    behaviorPreserved: true,
  };
}

function validCanonRecord(): CanonRecordContent {
  return {
    type: 'canon_record',
    decision: 'Upgrade lodash approved',
    adrNumber: 'ADR-042',
    stateHash: 'abc123def456',
    filesAffected: ['package.json', 'pnpm-lock.yaml'],
  };
}

function validPublication(): PublicationContent {
  return {
    type: 'publication',
    title: 'Lodash v5 Upgrade Complete',
    summary: 'Security vulnerability patched via lodash upgrade',
    audience: 'developers',
    body: 'Full details of the upgrade...',
  };
}

function validCycleOrchestration(): CycleOrchestrationContent {
  return {
    type: 'cycle_orchestration',
    phase: 'in_progress',
    currentOffice: 'speculator',
    artifactIds: ['art-1'],
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Artifact Validator', () => {
  describe('validateArtifactContent — valid content', () => {
    const validCases: [string, ArtifactContent][] = [
      ['propositio', validPropositio()],
      ['objectiones', validObjectiones()],
      ['verdict', validVerdict()],
      ['trial_report', validTrialReport()],
      ['purification_record', validPurificationRecord()],
      ['canon_record', validCanonRecord()],
      ['publication', validPublication()],
      ['cycle_orchestration', validCycleOrchestration()],
    ];

    it.each(validCases)('validates %s as valid', (_name, content) => {
      const result = validateArtifactContent(content);
      expect(result.valid).toBe(true);
      expect(result.issues).toHaveLength(0);
    });
  });

  describe('validateArtifactContent — missing required fields', () => {
    it('rejects propositio missing signal', () => {
      const content = { ...validPropositio(), signal: '' };
      const result = validateArtifactContent(content);
      expect(result.valid).toBe(false);
      expect(result.issues.some(i => i.field === 'signal')).toBe(true);
    });

    it('rejects objectiones missing propositionId', () => {
      const content = { ...validObjectiones(), propositionId: '' };
      const result = validateArtifactContent(content);
      expect(result.valid).toBe(false);
      expect(result.issues.some(i => i.field === 'propositionId')).toBe(true);
    });

    it('rejects verdict missing reasoning', () => {
      const { reasoning: _, ...rest } = validVerdict();
      const content = rest as unknown as VerdictContent;
      const result = validateArtifactContent(content);
      expect(result.valid).toBe(false);
      expect(result.issues.some(i => i.field === 'reasoning')).toBe(true);
    });

    it('rejects verdict with empty reasoning fields', () => {
      const content = { ...validVerdict(), reasoning: { verum: '', bonum: 'ok', pulchrum: 'ok' } };
      const result = validateArtifactContent(content);
      expect(result.valid).toBe(false);
      expect(result.issues.some(i => i.field === 'reasoning.verum')).toBe(true);
    });

    it('rejects trial_report missing subject', () => {
      const content = { ...validTrialReport(), subject: '' };
      const result = validateArtifactContent(content);
      expect(result.valid).toBe(false);
    });

    it('rejects purification_record missing complexityBefore', () => {
      const { complexityBefore: _, ...rest } = validPurificationRecord();
      const content = rest as unknown as PurificationRecordContent;
      const result = validateArtifactContent(content);
      expect(result.valid).toBe(false);
      expect(result.issues.some(i => i.field === 'complexityBefore')).toBe(true);
    });

    it('rejects canon_record missing filesAffected', () => {
      const { filesAffected: _, ...rest } = validCanonRecord();
      const content = rest as unknown as CanonRecordContent;
      const result = validateArtifactContent(content);
      expect(result.valid).toBe(false);
    });

    it('rejects publication missing body', () => {
      const content = { ...validPublication(), body: '' };
      const result = validateArtifactContent(content);
      expect(result.valid).toBe(false);
    });
  });

  describe('validateArtifactContent — invalid enum values', () => {
    it('rejects objectiones with invalid recommendation', () => {
      const content = { ...validObjectiones(), recommendation: 'maybe' as 'proceed' };
      const result = validateArtifactContent(content);
      expect(result.valid).toBe(false);
      expect(result.issues.some(i => i.field === 'recommendation')).toBe(true);
    });

    it('rejects verdict with invalid judgment', () => {
      const content = { ...validVerdict(), judgment: 'undecided' as 'approved' };
      const result = validateArtifactContent(content);
      expect(result.valid).toBe(false);
      expect(result.issues.some(i => i.field === 'judgment')).toBe(true);
    });

    it('rejects trial_report with invalid assessment', () => {
      const content = { ...validTrialReport(), assessment: 'maybe' as 'passed' };
      const result = validateArtifactContent(content);
      expect(result.valid).toBe(false);
    });

    it('rejects publication with invalid audience', () => {
      const content = { ...validPublication(), audience: 'nobody' as 'developers' };
      const result = validateArtifactContent(content);
      expect(result.valid).toBe(false);
    });

    it('rejects cycle_orchestration with invalid phase', () => {
      const content = { ...validCycleOrchestration(), phase: 'unknown' as 'in_progress' };
      const result = validateArtifactContent(content);
      expect(result.valid).toBe(false);
    });
  });

  describe('hasValidType', () => {
    it('accepts valid ArtifactContent objects', () => {
      expect(hasValidType(validPropositio())).toBe(true);
      expect(hasValidType(validVerdict())).toBe(true);
    });

    it('rejects null', () => {
      expect(hasValidType(null)).toBe(false);
    });

    it('rejects non-objects', () => {
      expect(hasValidType('string')).toBe(false);
      expect(hasValidType(42)).toBe(false);
    });

    it('rejects objects without type field', () => {
      expect(hasValidType({ signal: 'test' })).toBe(false);
    });

    it('rejects objects with unknown type', () => {
      expect(hasValidType({ type: 'unknown_type' })).toBe(false);
    });
  });

  describe('getExpectedArtifactType', () => {
    const cases: [OfficeId, string][] = [
      ['rector', 'cycle_orchestration'],
      ['speculator', 'propositio'],
      ['contrarius', 'objectiones'],
      ['vindex', 'verdict'],
      ['pugil', 'trial_report'],
      ['nitor', 'purification_record'],
      ['archivist', 'canon_record'],
      ['illuminatio', 'publication'],
    ];

    it.each(cases)('maps %s to %s', (officeId, expectedType) => {
      expect(getExpectedArtifactType(officeId)).toBe(expectedType);
    });
  });
});
