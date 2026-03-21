import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { createInMemoryIdempotencyStore, checkIdempotency } from '../idempotency';
import type { IdempotencyStore } from '../idempotency';

describe('Idempotency', () => {
  let store: IdempotencyStore;

  beforeEach(() => {
    store = createInMemoryIdempotencyStore();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ---- Store ----

  describe('InMemoryIdempotencyStore', () => {
    it('starts empty', () => {
      expect(store.size()).toBe(0);
      expect(store.has('key')).toBe(false);
    });

    it('records and retrieves entries', () => {
      store.record('key1', 60_000);
      expect(store.has('key1')).toBe(true);
      expect(store.get('key1')).toBeDefined();
      expect(store.size()).toBe(1);
    });

    it('expires entries after TTL', () => {
      vi.setSystemTime(new Date('2026-03-19T10:00:00Z'));
      store.record('key1', 60_000);
      expect(store.has('key1')).toBe(true);

      vi.setSystemTime(new Date('2026-03-19T10:01:01Z')); // +61s
      expect(store.has('key1')).toBe(false);
      expect(store.get('key1')).toBeUndefined();
    });

    it('removes entries manually', () => {
      store.record('key1', 60_000);
      store.remove('key1');
      expect(store.has('key1')).toBe(false);
    });

    it('clears all entries', () => {
      store.record('a', 60_000);
      store.record('b', 60_000);
      store.clear();
      expect(store.size()).toBe(0);
    });

    it('cleans up expired entries on size()', () => {
      vi.setSystemTime(new Date('2026-03-19T10:00:00Z'));
      store.record('old', 10_000);
      store.record('new', 60_000);

      vi.setSystemTime(new Date('2026-03-19T10:00:15Z')); // old expired
      expect(store.size()).toBe(1); // Only 'new' remains
    });

    it('stores result with entry', () => {
      const result = { jobId: '1', type: 'X', intent: 'sync_data' as const, status: 'completed' as const, attemptsMade: 1 };
      store.record('key1', 60_000, result);
      expect(store.get('key1')?.result).toEqual(result);
    });
  });

  // ---- checkIdempotency ----

  describe('checkIdempotency', () => {
    it('allows first execution and records key', () => {
      const check = checkIdempotency(store, 'job-1', 60_000, 'deny');
      expect(check.allowed).toBe(true);
      expect(store.has('job-1')).toBe(true);
    });

    it('allows execution with empty key', () => {
      const check = checkIdempotency(store, '', 60_000, 'deny');
      expect(check.allowed).toBe(true);
    });

    // ---- DENY policy ----

    it('deny: blocks same key within window', () => {
      checkIdempotency(store, 'job-1', 60_000, 'deny');
      const check2 = checkIdempotency(store, 'job-1', 60_000, 'deny');
      expect(check2.allowed).toBe(false);
      expect(check2.reason).toContain('Duplicate');
    });

    it('deny: allows same key after window expires', () => {
      vi.setSystemTime(new Date('2026-03-19T10:00:00Z'));
      checkIdempotency(store, 'job-1', 60_000, 'deny');

      vi.setSystemTime(new Date('2026-03-19T10:01:01Z'));
      const check2 = checkIdempotency(store, 'job-1', 60_000, 'deny');
      expect(check2.allowed).toBe(true);
    });

    it('deny: allows different keys', () => {
      checkIdempotency(store, 'job-1', 60_000, 'deny');
      const check2 = checkIdempotency(store, 'job-2', 60_000, 'deny');
      expect(check2.allowed).toBe(true);
    });

    // ---- ALLOW policy ----

    it('allow: always allows same key', () => {
      checkIdempotency(store, 'job-1', 60_000, 'allow');
      const check2 = checkIdempotency(store, 'job-1', 60_000, 'allow');
      expect(check2.allowed).toBe(true);
    });

    // ---- MERGE policy ----

    it('merge: returns previous result when key exists', () => {
      const prevResult = { jobId: '1', type: 'X', intent: 'sync_data' as const, status: 'completed' as const, attemptsMade: 1 };
      store.record('job-1', 60_000, prevResult);

      const check = checkIdempotency(store, 'job-1', 60_000, 'merge');
      expect(check.allowed).toBe(false);
      expect(check.reason).toContain('Merge');
      expect(check.previousResult).toEqual(prevResult);
    });

    it('merge: allows first execution', () => {
      const check = checkIdempotency(store, 'job-new', 60_000, 'merge');
      expect(check.allowed).toBe(true);
    });

    // ---- Edge cases ----

    it('handles very short dedupe window', () => {
      vi.setSystemTime(new Date('2026-03-19T10:00:00.000Z'));
      checkIdempotency(store, 'fast', 100, 'deny');

      vi.setSystemTime(new Date('2026-03-19T10:00:00.200Z'));
      const check2 = checkIdempotency(store, 'fast', 100, 'deny');
      expect(check2.allowed).toBe(true); // 200ms > 100ms window
    });

    it('handles very long dedupe window', () => {
      vi.setSystemTime(new Date('2026-03-19T10:00:00Z'));
      checkIdempotency(store, 'long', 86_400_000, 'deny'); // 24 hours

      vi.setSystemTime(new Date('2026-03-19T22:00:00Z')); // +12 hours
      const check2 = checkIdempotency(store, 'long', 86_400_000, 'deny');
      expect(check2.allowed).toBe(false); // Still within 24h
    });
  });
});
