// ===========================================
// ORDINATIO JOBS v1.1 — Dependency Resolver Tests
// ===========================================

import { describe, it, expect } from 'vitest';
import {
  validateDependencies,
  areDependenciesSatisfied,
  getUnsatisfiedDependencies,
  detectAllCycles,
} from '../dependency-resolver';
import type { JobTypeDefinition } from '../types';
import { DEFAULT_RETRY_POLICY } from '../job-registry';

function makeDef(type: string, dependsOn?: string[]): JobTypeDefinition {
  return {
    type,
    description: `Test job ${type}`,
    spec: 'job-v1',
    retry: DEFAULT_RETRY_POLICY,
    defaultPriority: 5,
    intent: 'update_state',
    definitionOfDone: { checks: ['done'] },
    sideEffects: { writes: [], externalCalls: [], irreversible: false },
    safeToRetry: true,
    idempotent: true,
    requiresHumanApproval: false,
    riskLevel: 'low',
    replayPolicy: 'allow',
    dependsOn,
  };
}

function buildRegistry(...defs: JobTypeDefinition[]): ReadonlyMap<string, JobTypeDefinition> {
  return new Map(defs.map(d => [d.type, d]));
}

describe('Dependency Resolver', () => {

  // ---- validateDependencies ----

  describe('validateDependencies', () => {
    it('returns valid for job with no dependencies', () => {
      const reg = buildRegistry(makeDef('A'));
      const result = validateDependencies('A', reg);
      expect(result.valid).toBe(true);
      expect(result.missing).toEqual([]);
      expect(result.circular).toBe(false);
    });

    it('returns valid for job with satisfied dependencies', () => {
      const reg = buildRegistry(makeDef('A'), makeDef('B', ['A']));
      const result = validateDependencies('B', reg);
      expect(result.valid).toBe(true);
      expect(result.missing).toEqual([]);
    });

    it('detects missing dependencies', () => {
      const reg = buildRegistry(makeDef('B', ['A', 'C']));
      const result = validateDependencies('B', reg);
      expect(result.valid).toBe(false);
      expect(result.missing).toContain('A');
      expect(result.missing).toContain('C');
    });

    it('detects self-reference cycle', () => {
      const reg = buildRegistry(makeDef('A', ['A']));
      const result = validateDependencies('A', reg);
      expect(result.valid).toBe(false);
      expect(result.circular).toBe(true);
      expect(result.cyclePath).toBeDefined();
    });

    it('detects simple A→B→A cycle', () => {
      const reg = buildRegistry(makeDef('A', ['B']), makeDef('B', ['A']));
      const result = validateDependencies('A', reg);
      expect(result.circular).toBe(true);
      expect(result.cyclePath).toContain('A');
      expect(result.cyclePath).toContain('B');
    });

    it('detects transitive A→B→C→A cycle', () => {
      const reg = buildRegistry(
        makeDef('A', ['B']),
        makeDef('B', ['C']),
        makeDef('C', ['A']),
      );
      const result = validateDependencies('A', reg);
      expect(result.circular).toBe(true);
    });

    it('handles diamond dependency (A→B, A→C, B→D, C→D) without false cycle', () => {
      const reg = buildRegistry(
        makeDef('D'),
        makeDef('B', ['D']),
        makeDef('C', ['D']),
        makeDef('A', ['B', 'C']),
      );
      const result = validateDependencies('A', reg);
      expect(result.valid).toBe(true);
      expect(result.circular).toBe(false);
    });

    it('returns valid for unregistered type', () => {
      const reg = buildRegistry(makeDef('A'));
      const result = validateDependencies('UNKNOWN', reg);
      expect(result.valid).toBe(true); // No deps to validate
    });

    it('reports both missing and circular', () => {
      const reg = buildRegistry(
        makeDef('A', ['B', 'MISSING']),
        makeDef('B', ['A']),
      );
      const result = validateDependencies('A', reg);
      expect(result.valid).toBe(false);
      expect(result.missing).toContain('MISSING');
      expect(result.circular).toBe(true);
    });
  });

  // ---- areDependenciesSatisfied ----

  describe('areDependenciesSatisfied', () => {
    it('returns true when no dependencies', () => {
      const reg = buildRegistry(makeDef('A'));
      expect(areDependenciesSatisfied('A', reg, new Set())).toBe(true);
    });

    it('returns true when all deps completed', () => {
      const reg = buildRegistry(makeDef('A'), makeDef('B', ['A']));
      expect(areDependenciesSatisfied('B', reg, new Set(['A']))).toBe(true);
    });

    it('returns false when deps not completed', () => {
      const reg = buildRegistry(makeDef('A'), makeDef('B', ['A']));
      expect(areDependenciesSatisfied('B', reg, new Set())).toBe(false);
    });

    it('returns false when only some deps completed', () => {
      const reg = buildRegistry(makeDef('A'), makeDef('C'), makeDef('B', ['A', 'C']));
      expect(areDependenciesSatisfied('B', reg, new Set(['A']))).toBe(false);
    });

    it('returns true for unregistered type', () => {
      const reg = buildRegistry(makeDef('A'));
      expect(areDependenciesSatisfied('UNKNOWN', reg, new Set())).toBe(true);
    });
  });

  // ---- getUnsatisfiedDependencies ----

  describe('getUnsatisfiedDependencies', () => {
    it('returns empty for satisfied deps', () => {
      const reg = buildRegistry(makeDef('A'), makeDef('B', ['A']));
      expect(getUnsatisfiedDependencies('B', reg, new Set(['A']))).toEqual([]);
    });

    it('returns unsatisfied dep names', () => {
      const reg = buildRegistry(makeDef('A'), makeDef('C'), makeDef('B', ['A', 'C']));
      const unsatisfied = getUnsatisfiedDependencies('B', reg, new Set(['A']));
      expect(unsatisfied).toEqual(['C']);
    });

    it('returns all deps when none satisfied', () => {
      const reg = buildRegistry(makeDef('A'), makeDef('C'), makeDef('B', ['A', 'C']));
      expect(getUnsatisfiedDependencies('B', reg, new Set())).toEqual(['A', 'C']);
    });
  });

  // ---- detectAllCycles ----

  describe('detectAllCycles', () => {
    it('returns empty for acyclic graph', () => {
      const reg = buildRegistry(makeDef('A'), makeDef('B', ['A']), makeDef('C', ['B']));
      expect(detectAllCycles(reg)).toEqual([]);
    });

    it('detects a single cycle', () => {
      const reg = buildRegistry(makeDef('A', ['B']), makeDef('B', ['A']));
      const cycles = detectAllCycles(reg);
      expect(cycles.length).toBeGreaterThan(0);
    });

    it('detects self-reference', () => {
      const reg = buildRegistry(makeDef('A', ['A']));
      const cycles = detectAllCycles(reg);
      expect(cycles.length).toBeGreaterThan(0);
    });

    it('finds cycle in complex graph', () => {
      const reg = buildRegistry(
        makeDef('A', ['B']),
        makeDef('B', ['C']),
        makeDef('C', ['D']),
        makeDef('D', ['B']),  // cycle: B→C→D→B
        makeDef('E'),         // isolated, no cycle
      );
      const cycles = detectAllCycles(reg);
      expect(cycles.length).toBeGreaterThan(0);
    });
  });
});
