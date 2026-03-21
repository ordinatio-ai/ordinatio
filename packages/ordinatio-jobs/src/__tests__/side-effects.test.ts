import { describe, it, expect } from 'vitest';
import { validateSideEffects, isIrreversiblePartialFailure } from '../side-effects';

describe('Side Effects Validator', () => {
  describe('validateSideEffects', () => {
    it('passes when actual is subset of declared writes', () => {
      const result = validateSideEffects(
        { writes: ['orders', 'placements'], externalCalls: [], irreversible: false },
        ['orders'],
      );
      expect(result.valid).toBe(true);
      expect(result.undeclared).toEqual([]);
    });

    it('passes when actual matches externalCalls', () => {
      const result = validateSideEffects(
        { writes: [], externalCalls: ['gocreate', 'gmail'], irreversible: false },
        ['gmail'],
      );
      expect(result.valid).toBe(true);
    });

    it('passes when actual is empty', () => {
      const result = validateSideEffects(
        { writes: ['orders'], externalCalls: ['gocreate'], irreversible: false },
        [],
      );
      expect(result.valid).toBe(true);
    });

    it('fails when actual includes undeclared writes', () => {
      const result = validateSideEffects(
        { writes: ['orders'], externalCalls: [], irreversible: false },
        ['orders', 'clients'],
      );
      expect(result.valid).toBe(false);
      expect(result.undeclared).toEqual(['clients']);
    });

    it('fails when actual includes undeclared external call', () => {
      const result = validateSideEffects(
        { writes: [], externalCalls: ['gmail'], irreversible: false },
        ['stripe'],
      );
      expect(result.valid).toBe(false);
      expect(result.undeclared).toEqual(['stripe']);
    });

    it('reports multiple undeclared effects', () => {
      const result = validateSideEffects(
        { writes: [], externalCalls: [], irreversible: false },
        ['orders', 'emails', 'stripe'],
      );
      expect(result.undeclared).toHaveLength(3);
    });

    it('passes when actual matches mix of writes and externalCalls', () => {
      const result = validateSideEffects(
        { writes: ['orders'], externalCalls: ['gocreate'], irreversible: false },
        ['orders', 'gocreate'],
      );
      expect(result.valid).toBe(true);
    });
  });

  describe('isIrreversiblePartialFailure', () => {
    it('returns true for irreversible job that failed with side effects', () => {
      expect(isIrreversiblePartialFailure(
        { writes: ['orders'], externalCalls: ['gocreate'], irreversible: true },
        ['orders'],
        true,
      )).toBe(true);
    });

    it('returns false for reversible job', () => {
      expect(isIrreversiblePartialFailure(
        { writes: ['orders'], externalCalls: [], irreversible: false },
        ['orders'],
        true,
      )).toBe(false);
    });

    it('returns false when no side effects occurred', () => {
      expect(isIrreversiblePartialFailure(
        { writes: ['orders'], externalCalls: [], irreversible: true },
        [],
        true,
      )).toBe(false);
    });

    it('returns false when job succeeded', () => {
      expect(isIrreversiblePartialFailure(
        { writes: ['orders'], externalCalls: [], irreversible: true },
        ['orders'],
        false,
      )).toBe(false);
    });
  });
});
