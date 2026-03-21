// IHS
import { describe, it, expect } from 'vitest';
import { measureComplexity, computeBeautyDelta, toComplexityMetrics } from './complexity-meter';
import {
  EMAIL_ENGINE_COVENANT,
  SETTINGS_ENGINE_COVENANT,
} from '../covenants';
import type { ModuleCovenant } from '../covenant/types';

// ---------------------------------------------------------------------------
// Helper: minimal covenant for controlled testing
// ---------------------------------------------------------------------------

function makeMinimalCovenant(overrides: Partial<ModuleCovenant> = {}): ModuleCovenant {
  return {
    identity: {
      id: 'test-module',
      canonicalId: 'X-01',
      version: '0.1.0',
      description: 'A minimal test module',
      status: 'experimental',
      tier: 'being',
      dedication: 'IHS',
    },
    domain: {
      entities: [{ name: 'TestEntity', description: 'Test', hasContextLayer: false }],
      events: [{ id: 'test.created', description: 'Created', payloadShape: '{}' }],
      subscriptions: [],
    },
    capabilities: [
      {
        id: 'test.read',
        description: 'Read test data',
        type: 'query',
        risk: 'observe',
        dataSensitivity: 'none',
        inputs: [],
        output: '{ data: object }',
        whenToUse: 'When you need to read test data.',
      },
    ],
    dependencies: [],
    invariants: {
      alwaysTrue: ['Data is consistent'],
      neverHappens: ['Corruption does not occur'],
    },
    healthCheck: async () => ({ healthy: true, message: 'OK', checkedAt: new Date() }),
    ...overrides,
  };
}

describe('Complexity Meter', () => {
  describe('measureComplexity', () => {
    it('measures a minimal covenant as simple', () => {
      const report = measureComplexity(makeMinimalCovenant());

      expect(report.moduleId).toBe('test-module');
      expect(report.assessment).toBe('simple');
      expect(report.complexityScore).toBeLessThanOrEqual(25);
      expect(report.capabilityCount).toBe(1);
      expect(report.entityCount).toBe(1);
      expect(report.eventCount).toBe(1);
      expect(report.dependencyCount).toBe(0);
      expect(report.invariantCount).toBe(2);
    });

    it('measures email-engine as the most complex covenant (highest score)', () => {
      const report = measureComplexity(EMAIL_ENGINE_COVENANT);

      expect(report.moduleId).toBe('email-engine');
      expect(report.complexityScore).toBeGreaterThan(50); // complex or excessive
      expect(report.capabilityCount).toBeGreaterThanOrEqual(10);
      expect(report.entityCount).toBeGreaterThanOrEqual(3);
      expect(['complex', 'excessive']).toContain(report.assessment);
    });

    it('measures settings-engine as moderate (smaller than email-engine)', () => {
      const report = measureComplexity(SETTINGS_ENGINE_COVENANT);
      const emailReport = measureComplexity(EMAIL_ENGINE_COVENANT);

      expect(report.moduleId).toBe('settings-engine');
      expect(report.complexityScore).toBeLessThan(emailReport.complexityScore);
      expect(['simple', 'moderate']).toContain(report.assessment);
    });

    it('estimates lines from covenant structure', () => {
      const report = measureComplexity(makeMinimalCovenant());

      // 50 (baseline) + 1×50 (capabilities) + 1×30 (entities) + 0×10 (deps) = 130
      expect(report.metrics.lines).toBe(130);
    });

    it('computes cyclomatic complexity from capability type weights', () => {
      const covenant = makeMinimalCovenant({
        capabilities: [
          { id: 'test.read', description: 'Read', type: 'query', risk: 'observe', dataSensitivity: 'none', inputs: [], output: '{}', whenToUse: 'Read data from the system.' },
          { id: 'test.write', description: 'Write', type: 'mutation', risk: 'act', dataSensitivity: 'internal', inputs: [], output: '{}', whenToUse: 'Write data to the system.' },
          { id: 'test.process', description: 'Process', type: 'action', risk: 'act', dataSensitivity: 'internal', inputs: [], output: '{}', whenToUse: 'Process data in the system.' },
          { id: 'test.orchestrate', description: 'Orchestrate', type: 'composite', risk: 'govern', dataSensitivity: 'sensitive', inputs: [], output: '{}', whenToUse: 'Orchestrate across multiple systems.' },
        ],
      });

      const report = measureComplexity(covenant);
      // query=1 + mutation=2 + action=3 + composite=4 = 10
      expect(report.metrics.cyclomaticComplexity).toBe(10);
    });

    it('counts exported symbols as capabilities + entities + events', () => {
      const covenant = makeMinimalCovenant({
        domain: {
          entities: [
            { name: 'EntityA', description: 'A', hasContextLayer: false },
            { name: 'EntityB', description: 'B', hasContextLayer: false },
          ],
          events: [
            { id: 'test.created', description: 'Created', payloadShape: '{}' },
            { id: 'test.updated', description: 'Updated', payloadShape: '{}' },
            { id: 'test.deleted', description: 'Deleted', payloadShape: '{}' },
          ],
          subscriptions: [],
        },
      });

      const report = measureComplexity(covenant);
      // 1 capability + 2 entities + 3 events = 6
      expect(report.metrics.exportedSymbols).toBe(6);
    });

    it('returns a valid measuredAt timestamp', () => {
      const before = new Date();
      const report = measureComplexity(makeMinimalCovenant());
      const after = new Date();

      expect(report.measuredAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(report.measuredAt.getTime()).toBeLessThanOrEqual(after.getTime());
    });

    it('flags excessive complexity for an oversized covenant', () => {
      // Create a covenant with many capabilities, entities, dependencies, and events
      const capabilities = Array.from({ length: 25 }, (_, i) => ({
        id: `test.action_${i}`,
        description: `Action ${i}`,
        type: 'composite' as const,
        risk: 'govern' as const,
        dataSensitivity: 'critical' as const,
        inputs: [],
        output: '{}',
        whenToUse: `When you need to run complex action ${i}.`,
      }));

      const entities = Array.from({ length: 10 }, (_, i) => ({
        name: `Entity${i}`,
        description: `Entity ${i}`,
        hasContextLayer: true,
      }));

      const events = Array.from({ length: 15 }, (_, i) => ({
        id: `test.event_${i}`,
        description: `Event ${i}`,
        payloadShape: '{}',
      }));

      const dependencies = Array.from({ length: 8 }, (_, i) => ({
        moduleId: `dep-module-${i}`,
        required: true,
        capabilities: [`dep.cap_${i}`],
      }));

      const covenant = makeMinimalCovenant({
        capabilities,
        domain: { entities, events, subscriptions: [] },
        dependencies,
      });

      const report = measureComplexity(covenant);
      expect(report.assessment).toBe('excessive');
      expect(report.complexityScore).toBeGreaterThan(75);
    });

    it('scores monotonically with increasing capabilities', () => {
      const scores: number[] = [];
      for (let count = 1; count <= 5; count++) {
        const caps = Array.from({ length: count }, (_, i) => ({
          id: `test.cap_${i}`,
          description: `Cap ${i}`,
          type: 'mutation' as const,
          risk: 'act' as const,
          dataSensitivity: 'internal' as const,
          inputs: [],
          output: '{}',
          whenToUse: `Use capability ${i} when needed.`,
        }));
        const report = measureComplexity(makeMinimalCovenant({ capabilities: caps }));
        scores.push(report.complexityScore);
      }

      // Each additional capability should increase the score
      for (let i = 1; i < scores.length; i++) {
        expect(scores[i]).toBeGreaterThanOrEqual(scores[i - 1]);
      }
    });
  });

  describe('computeBeautyDelta', () => {
    it('returns positive when complexity decreased (improvement)', () => {
      const before = measureComplexity(EMAIL_ENGINE_COVENANT);
      const after = measureComplexity(SETTINGS_ENGINE_COVENANT);

      const delta = computeBeautyDelta(before, after);
      expect(delta).toBeGreaterThan(0);
    });

    it('returns negative when complexity increased (regression)', () => {
      const before = measureComplexity(SETTINGS_ENGINE_COVENANT);
      const after = measureComplexity(EMAIL_ENGINE_COVENANT);

      const delta = computeBeautyDelta(before, after);
      expect(delta).toBeLessThan(0);
    });

    it('returns zero when no change', () => {
      const report = measureComplexity(makeMinimalCovenant());
      const delta = computeBeautyDelta(report, report);
      expect(delta).toBe(0);
    });
  });

  describe('toComplexityMetrics', () => {
    it('extracts ComplexityMetrics from a report', () => {
      const report = measureComplexity(makeMinimalCovenant());
      const metrics = toComplexityMetrics(report);

      expect(metrics).toEqual(report.metrics);
      expect(metrics).toHaveProperty('lines');
      expect(metrics).toHaveProperty('cyclomaticComplexity');
      expect(metrics).toHaveProperty('dependencies');
      expect(metrics).toHaveProperty('exportedSymbols');
    });
  });
});
