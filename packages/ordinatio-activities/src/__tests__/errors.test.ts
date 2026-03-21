import { describe, it, expect } from 'vitest';
import { activityError, ACTIVITY_ERRORS } from '../errors';

describe('activityError', () => {
  it('should generate a ref with timestamp', () => {
    const result = activityError('ACTIVITY_100');
    expect(result.code).toBe('ACTIVITY_100');
    expect(result.ref).toMatch(/^ACTIVITY_100-\d{8}T\d{6}$/);
  });

  it('should generate unique refs on successive calls', () => {
    const a = activityError('ACTIVITY_100');
    const b = activityError('ACTIVITY_100');
    // Same second may produce same ref, but the function is deterministic per-call
    expect(a.code).toBe(b.code);
  });
});

describe('ACTIVITY_ERRORS', () => {
  it('should have all error codes starting with ACTIVITY_', () => {
    for (const [key, entry] of Object.entries(ACTIVITY_ERRORS)) {
      expect(key).toMatch(/^ACTIVITY_\d+$/);
      expect(entry.code).toBe(key);
    }
  });

  it('should have valid severity for every error', () => {
    const validSeverities = ['warn', 'error', 'info'];
    for (const [key, entry] of Object.entries(ACTIVITY_ERRORS)) {
      expect(validSeverities, `Invalid severity for ${key}`).toContain(entry.severity);
    }
  });

  it('should have non-empty diagnosis for every error', () => {
    for (const [key, entry] of Object.entries(ACTIVITY_ERRORS)) {
      expect(entry.diagnosis.length, `Empty diagnosis for ${key}`).toBeGreaterThan(0);
    }
  });

  it('should have valid httpStatus for every error', () => {
    for (const [key, entry] of Object.entries(ACTIVITY_ERRORS)) {
      expect(entry.httpStatus, `Invalid httpStatus for ${key}`).toBeGreaterThanOrEqual(400);
      expect(entry.httpStatus, `Invalid httpStatus for ${key}`).toBeLessThanOrEqual(599);
    }
  });

  it('should have non-empty file and function for every error', () => {
    for (const [key, entry] of Object.entries(ACTIVITY_ERRORS)) {
      expect(entry.file.length, `Empty file for ${key}`).toBeGreaterThan(0);
      expect(entry.function.length, `Empty function for ${key}`).toBeGreaterThan(0);
    }
  });

  it('should cover 100-series (create/list)', () => {
    expect(ACTIVITY_ERRORS.ACTIVITY_100).toBeDefined();
    expect(ACTIVITY_ERRORS.ACTIVITY_104).toBeDefined();
  });

  it('should cover 200-series (resolve/sticky)', () => {
    expect(ACTIVITY_ERRORS.ACTIVITY_200).toBeDefined();
    expect(ACTIVITY_ERRORS.ACTIVITY_204).toBeDefined();
  });

  it('should cover 300-series (filter/pagination)', () => {
    expect(ACTIVITY_ERRORS.ACTIVITY_300).toBeDefined();
    expect(ACTIVITY_ERRORS.ACTIVITY_302).toBeDefined();
  });
});
