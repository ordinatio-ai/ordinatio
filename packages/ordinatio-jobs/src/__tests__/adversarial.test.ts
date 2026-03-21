import { describe, it, expect, beforeEach } from 'vitest';
import { registerJobType, validateJobData, planJob, clearRegistry, DEFAULT_RETRY_POLICY } from '../job-registry';
import type { JobTypeDefinition } from '../types';

function makeDef(overrides: Partial<JobTypeDefinition> = {}): JobTypeDefinition {
  return {
    type: 'TEST', description: 'test', spec: 'job-v1',
    retry: DEFAULT_RETRY_POLICY, defaultPriority: 5,
    intent: 'update_state', definitionOfDone: { checks: ['done'] },
    sideEffects: { writes: [], externalCalls: [], irreversible: false },
    safeToRetry: true, idempotent: true,
    requiresHumanApproval: false, riskLevel: 'low', replayPolicy: 'allow',
    ...overrides,
  };
}

describe('Adversarial Payload Tests', () => {
  beforeEach(() => clearRegistry());

  describe('enormous payloads', () => {
    it('handles very large string in payload', () => {
      registerJobType(makeDef({ type: 'BIG', validate: (d) => d }));
      const bigPayload = { data: 'x'.repeat(100_000) };
      expect(() => validateJobData('BIG', bigPayload)).not.toThrow();
    });

    it('handles large array in payload', () => {
      registerJobType(makeDef({ type: 'ARR', validate: (d) => d }));
      const bigArray = { items: Array.from({ length: 10_000 }, (_, i) => i) };
      expect(() => validateJobData('ARR', bigArray)).not.toThrow();
    });
  });

  describe('deeply nested objects', () => {
    it('handles 50-level nesting', () => {
      let obj: any = { value: 'leaf' };
      for (let i = 0; i < 50; i++) obj = { nested: obj };
      registerJobType(makeDef({ type: 'DEEP', validate: (d) => d }));
      expect(() => validateJobData('DEEP', obj)).not.toThrow();
    });
  });

  describe('malicious strings', () => {
    const malicious = [
      '<script>alert("xss")</script>',
      "'; DROP TABLE orders; --",
      '\x00\x01\x02null bytes',
      '{{template injection}}',
      '${process.exit(1)}',
      '__proto__',
      'constructor.prototype',
    ];

    for (const payload of malicious) {
      it(`safely handles: ${payload.slice(0, 30)}...`, () => {
        registerJobType(makeDef({ type: `MAL_${Math.random()}`, validate: (d) => d }));
        // Should not crash or execute anything
        expect(() => planJob(Object.keys(makeDef())[0] || 'TEST', { input: payload })).not.toThrow();
      });
    }
  });

  describe('numeric extremes', () => {
    it('handles Infinity', () => {
      registerJobType(makeDef({ type: 'INF', validate: (d) => d }));
      expect(() => validateJobData('INF', { value: Infinity })).not.toThrow();
    });

    it('handles NaN', () => {
      registerJobType(makeDef({ type: 'NAN', validate: (d) => d }));
      expect(() => validateJobData('NAN', { value: NaN })).not.toThrow();
    });

    it('handles MAX_SAFE_INTEGER + 1', () => {
      registerJobType(makeDef({ type: 'BIGINT', validate: (d) => d }));
      expect(() => validateJobData('BIGINT', { value: Number.MAX_SAFE_INTEGER + 1 })).not.toThrow();
    });

    it('handles negative zero', () => {
      registerJobType(makeDef({ type: 'NEGZERO', validate: (d) => d }));
      expect(() => validateJobData('NEGZERO', { value: -0 })).not.toThrow();
    });
  });

  describe('prototype pollution', () => {
    it('__proto__ in payload does not corrupt registry', () => {
      const registryBefore = JSON.stringify(Array.from(makeDef().type));
      registerJobType(makeDef({ type: 'PROTO' }));
      const payload = JSON.parse('{"__proto__": {"polluted": true}}');
      planJob('PROTO', payload);
      expect((Object.prototype as any).polluted).toBeUndefined();
    });

    it('constructor in payload does not cause issues', () => {
      registerJobType(makeDef({ type: 'CTOR' }));
      expect(() => planJob('CTOR', { constructor: { prototype: { bad: true } } })).not.toThrow();
    });
  });

  describe('unexpected types', () => {
    it('handles null payload', () => {
      registerJobType(makeDef({ type: 'NULL' }));
      expect(() => planJob('NULL', null as any)).not.toThrow();
    });

    it('handles undefined payload', () => {
      registerJobType(makeDef({ type: 'UNDEF' }));
      expect(() => planJob('UNDEF', undefined as any)).not.toThrow();
    });

    it('handles array as payload', () => {
      registerJobType(makeDef({ type: 'ARRAY' }));
      expect(() => planJob('ARRAY', [1, 2, 3] as any)).not.toThrow();
    });

    it('handles string as payload', () => {
      registerJobType(makeDef({ type: 'STRING' }));
      expect(() => planJob('STRING', 'not an object' as any)).not.toThrow();
    });

    it('handles number as payload', () => {
      registerJobType(makeDef({ type: 'NUM' }));
      expect(() => planJob('NUM', 42 as any)).not.toThrow();
    });
  });

  describe('type field injection', () => {
    it('cannot register with empty type name', () => {
      expect(() => registerJobType(makeDef({ type: '' }))).toThrow();
    });

    it('cannot inject whitespace-only type name', () => {
      expect(() => registerJobType(makeDef({ type: '   ' }))).toThrow('JOBS_132');
    });
  });
});
