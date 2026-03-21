// IHS
import { describe, it, expect } from 'vitest';
import { checkModuleBoundary } from './boundary-checker';
import type { BoundaryCheckInput } from './types';

// ---------------------------------------------------------------------------
// Helper: build a full input with overrides
// ---------------------------------------------------------------------------

function makeInput(overrides: Partial<BoundaryCheckInput> = {}): BoundaryCheckInput {
  return {
    moduleId: 'test-module',
    appearsRepeatedly: true,
    existingModulesInsufficient: true,
    absenceCreatesDistortion: true,
    canBeSolvedByComposition: false,   // anti-check: passes when false
    unrelatedOrgsNeed: true,
    dependsOnIndustryAssumptions: false, // anti-check: passes when false
    brandingRemovableWithoutLoss: true,
    removableWithoutSystemicCollapse: true,
    hasClearBoundary: true,
    reducesTotalComplexity: true,
    ...overrides,
  };
}

describe('Module Boundary Checker', () => {
  describe('perfect candidate', () => {
    it('recommends proceed with all checks passing', () => {
      const result = checkModuleBoundary(makeInput());

      expect(result.overallPass).toBe(true);
      expect(result.recommendation).toBe('proceed');
      expect(result.rejectionReasons).toHaveLength(0);
      expect(result.moduleId).toBe('test-module');
    });

    it('returns 10 checked items across 4 categories', () => {
      const result = checkModuleBoundary(makeInput());

      expect(result.items).toHaveLength(10);

      const categories = new Set(result.items.map(i => i.category));
      expect(categories).toEqual(new Set(['necessity', 'universality', 'isolation', 'simplification']));
    });

    it('has perfect category scores', () => {
      const result = checkModuleBoundary(makeInput());

      expect(result.categoryScores.necessity).toEqual({ passed: 4, total: 4 });
      expect(result.categoryScores.universality).toEqual({ passed: 3, total: 3 });
      expect(result.categoryScores.isolation).toEqual({ passed: 2, total: 2 });
      expect(result.categoryScores.simplification).toEqual({ passed: 1, total: 1 });
    });
  });

  describe('necessity failures → reject', () => {
    it('rejects when module can be solved by composition', () => {
      const result = checkModuleBoundary(makeInput({
        canBeSolvedByComposition: true, // anti-check: true = fail
      }));

      expect(result.overallPass).toBe(false);
      expect(result.recommendation).toBe('reject');
      expect(result.rejectionReasons.length).toBeGreaterThan(0);
      expect(result.rejectionReasons.some(r => r.includes('Necessity'))).toBe(true);
    });

    it('rejects when module does not appear repeatedly', () => {
      const result = checkModuleBoundary(makeInput({
        appearsRepeatedly: false,
      }));

      expect(result.recommendation).toBe('reject');
    });

    it('rejects when existing modules are sufficient', () => {
      const result = checkModuleBoundary(makeInput({
        existingModulesInsufficient: false,
      }));

      expect(result.recommendation).toBe('reject');
    });

    it('rejects when absence does not create distortion', () => {
      const result = checkModuleBoundary(makeInput({
        absenceCreatesDistortion: false,
      }));

      expect(result.recommendation).toBe('reject');
    });
  });

  describe('universality failures → revise', () => {
    it('recommends revise when depends on industry assumptions', () => {
      const result = checkModuleBoundary(makeInput({
        dependsOnIndustryAssumptions: true, // anti-check: true = fail
      }));

      expect(result.overallPass).toBe(false);
      expect(result.recommendation).toBe('revise');
      expect(result.rejectionReasons.some(r => r.includes('Universality'))).toBe(true);
    });

    it('recommends revise when branding cannot be removed', () => {
      const result = checkModuleBoundary(makeInput({
        brandingRemovableWithoutLoss: false,
      }));

      expect(result.recommendation).toBe('revise');
    });

    it('recommends revise when unrelated orgs do not need it', () => {
      const result = checkModuleBoundary(makeInput({
        unrelatedOrgsNeed: false,
      }));

      expect(result.recommendation).toBe('revise');
    });
  });

  describe('necessity + universality both fail → reject (necessity dominates)', () => {
    it('rejects when both categories fail', () => {
      const result = checkModuleBoundary(makeInput({
        appearsRepeatedly: false,
        unrelatedOrgsNeed: false,
      }));

      expect(result.recommendation).toBe('reject');
      expect(result.rejectionReasons.some(r => r.includes('Necessity'))).toBe(true);
      expect(result.rejectionReasons.some(r => r.includes('Universality'))).toBe(true);
    });
  });

  describe('isolation and simplification failures are non-blocking', () => {
    it('still proceeds when isolation fails but necessity+universality pass', () => {
      const result = checkModuleBoundary(makeInput({
        removableWithoutSystemicCollapse: false,
        hasClearBoundary: false,
      }));

      // Isolation and simplification don't affect the recommendation
      expect(result.recommendation).toBe('proceed');
      expect(result.categoryScores.isolation.passed).toBe(0);
    });

    it('still proceeds when simplification fails', () => {
      const result = checkModuleBoundary(makeInput({
        reducesTotalComplexity: false,
      }));

      expect(result.recommendation).toBe('proceed');
      expect(result.categoryScores.simplification.passed).toBe(0);
    });
  });

  describe('all false → reject with all reasons', () => {
    it('rejects comprehensively when everything fails', () => {
      const result = checkModuleBoundary({
        moduleId: 'bad-module',
        appearsRepeatedly: false,
        existingModulesInsufficient: false,
        absenceCreatesDistortion: false,
        canBeSolvedByComposition: true,
        unrelatedOrgsNeed: false,
        dependsOnIndustryAssumptions: true,
        brandingRemovableWithoutLoss: false,
        removableWithoutSystemicCollapse: false,
        hasClearBoundary: false,
        reducesTotalComplexity: false,
      });

      expect(result.overallPass).toBe(false);
      expect(result.recommendation).toBe('reject');
      expect(result.rejectionReasons.length).toBeGreaterThanOrEqual(4); // 4 necessity + 3 universality
      expect(result.items.every(i => !i.passed)).toBe(true);
    });
  });

  describe('evidence strings', () => {
    it('produces evidence for each item', () => {
      const result = checkModuleBoundary(makeInput());

      for (const item of result.items) {
        expect(item.evidence).toBeTruthy();
        expect(typeof item.evidence).toBe('string');
        expect(item.evidence.length).toBeGreaterThan(5);
      }
    });
  });
});
