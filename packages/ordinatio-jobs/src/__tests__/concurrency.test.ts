import { describe, it, expect, beforeEach } from 'vitest';
import { registerJobType, clearRegistry, isRegisteredType, DEFAULT_RETRY_POLICY } from '../job-registry';
import { registerCron, triggerCron, clearCrons } from '../cron-scheduler';
import { createInMemoryIdempotencyStore, checkIdempotency } from '../idempotency';
import type { JobTypeDefinition } from '../types';

function makeDef(type: string): JobTypeDefinition {
  return {
    type, description: 'test', spec: 'job-v1',
    retry: DEFAULT_RETRY_POLICY, defaultPriority: 5,
    intent: 'update_state', definitionOfDone: { checks: ['done'] },
    sideEffects: { writes: [], externalCalls: [], irreversible: false },
    safeToRetry: true, idempotent: true,
    requiresHumanApproval: false, riskLevel: 'low', replayPolicy: 'allow',
  };
}

describe('Concurrency Tests', () => {
  beforeEach(() => {
    clearRegistry();
    clearCrons();
  });

  describe('simultaneous job registration', () => {
    it('only one of concurrent identical registrations succeeds', async () => {
      const results = await Promise.allSettled([
        Promise.resolve().then(() => registerJobType(makeDef('RACE'))),
        Promise.resolve().then(() => registerJobType(makeDef('RACE'))),
        Promise.resolve().then(() => registerJobType(makeDef('RACE'))),
      ]);

      const fulfilled = results.filter(r => r.status === 'fulfilled');
      const rejected = results.filter(r => r.status === 'rejected');

      // Exactly one should succeed (synchronous Map prevents true races,
      // but the contract must hold under any execution order)
      expect(fulfilled.length).toBe(1);
      expect(rejected.length).toBe(2);
      expect(isRegisteredType('RACE')).toBe(true);
    });

    it('different types can register concurrently', async () => {
      await Promise.all([
        Promise.resolve().then(() => registerJobType(makeDef('A'))),
        Promise.resolve().then(() => registerJobType(makeDef('B'))),
        Promise.resolve().then(() => registerJobType(makeDef('C'))),
      ]);

      expect(isRegisteredType('A')).toBe(true);
      expect(isRegisteredType('B')).toBe(true);
      expect(isRegisteredType('C')).toBe(true);
    });
  });

  describe('simultaneous cron registration', () => {
    it('only one of concurrent identical crons registers', async () => {
      const handler = async () => {};
      const results = await Promise.allSettled([
        Promise.resolve().then(() => registerCron({ name: 'dup', schedule: '0 6 * * *', handler })),
        Promise.resolve().then(() => registerCron({ name: 'dup', schedule: '0 6 * * *', handler })),
      ]);

      const fulfilled = results.filter(r => r.status === 'fulfilled');
      expect(fulfilled.length).toBe(1);
    });
  });

  describe('simultaneous cron trigger', () => {
    it('second trigger returns false while first is running', async () => {
      let resolveHandler: () => void;
      const handler = () => new Promise<void>(r => { resolveHandler = r; });
      registerCron({ name: 'slow', schedule: '0 6 * * *', handler });

      // Start first trigger (don't await)
      const trigger1 = triggerCron('slow');

      // Immediately try second trigger
      const trigger2Result = await triggerCron('slow');
      expect(trigger2Result).toBe(false); // Blocked — already running

      // Clean up
      resolveHandler!();
      const trigger1Result = await trigger1;
      expect(trigger1Result).toBe(true);
    });
  });

  describe('idempotency under concurrency', () => {
    it('concurrent checks with deny policy — only first allowed', () => {
      const store = createInMemoryIdempotencyStore();

      // Simulate "concurrent" checks (synchronous in JS, but tests the logic)
      const check1 = checkIdempotency(store, 'job-1', 60_000, 'deny');
      const check2 = checkIdempotency(store, 'job-1', 60_000, 'deny');
      const check3 = checkIdempotency(store, 'job-1', 60_000, 'deny');

      expect(check1.allowed).toBe(true);
      expect(check2.allowed).toBe(false);
      expect(check3.allowed).toBe(false);
    });

    it('concurrent checks with allow policy — all allowed', () => {
      const store = createInMemoryIdempotencyStore();

      const check1 = checkIdempotency(store, 'job-1', 60_000, 'allow');
      const check2 = checkIdempotency(store, 'job-1', 60_000, 'allow');

      expect(check1.allowed).toBe(true);
      expect(check2.allowed).toBe(true);
    });

    it('different keys never interfere', () => {
      const store = createInMemoryIdempotencyStore();

      const check1 = checkIdempotency(store, 'job-1', 60_000, 'deny');
      const check2 = checkIdempotency(store, 'job-2', 60_000, 'deny');
      const check3 = checkIdempotency(store, 'job-3', 60_000, 'deny');

      expect(check1.allowed).toBe(true);
      expect(check2.allowed).toBe(true);
      expect(check3.allowed).toBe(true);
    });
  });
});
