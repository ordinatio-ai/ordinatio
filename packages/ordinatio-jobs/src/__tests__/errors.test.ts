// ===========================================
// ORDINATIO JOBS v1.1 — Error Registry Tests
// ===========================================

import { describe, it, expect } from 'vitest';
import { jobsError, JOBS_ERRORS } from '../errors';

describe('Jobs Error Registry v1.1', () => {
  describe('jobsError', () => {
    it('generates a timestamped reference', () => {
      const result = jobsError('JOBS_100');
      expect(result.code).toBe('JOBS_100');
      expect(result.ref).toMatch(/^JOBS_100-\d{8}T\d{6}$/);
    });

    it('includes context when provided', () => {
      const result = jobsError('JOBS_110', { host: 'localhost', port: 6379 });
      expect(result.context).toEqual({ host: 'localhost', port: 6379 });
    });

    it('returns empty context when not provided', () => {
      expect(jobsError('JOBS_100').context).toEqual({});
    });

    it('returns full diagnostic object', () => {
      const result = jobsError('JOBS_110', { host: 'localhost' });
      expect(result.timestamp).toBeTruthy();
      expect(result.module).toBe('JOBS');
      expect(result.description).toContain('Redis');
      expect(result.severity).toBe('critical');
      expect(result.recoverable).toBe(true);
      expect(result.diagnosis.length).toBeGreaterThan(0);
      expect(result.context).toEqual({ host: 'localhost' });
    });

    it('handles unknown codes gracefully', () => {
      const result = jobsError('JOBS_999');
      expect(result.code).toBe('JOBS_999');
      expect(result.module).toBe('JOBS');
      expect(result.description).toContain('Unknown');
      expect(result.recoverable).toBe(false);
    });
  });

  describe('JOBS_ERRORS registry', () => {
    it('has all expected error code ranges', () => {
      const codes = Object.keys(JOBS_ERRORS);
      // 100-109: queue ops
      expect(codes).toContain('JOBS_100');
      // 110-119: connection & health
      expect(codes).toContain('JOBS_110');
      // 120-129: cron
      expect(codes).toContain('JOBS_120');
      // 130-139: registry (including v1.1 additions)
      expect(codes).toContain('JOBS_130');
      expect(codes).toContain('JOBS_132'); // incomplete contract
      expect(codes).toContain('JOBS_133'); // plan for unregistered
      expect(codes).toContain('JOBS_134'); // policy denied
      // 140-149: worker lifecycle
      expect(codes).toContain('JOBS_140');
      // 150-159: recovery & safety (v1.1)
      expect(codes).toContain('JOBS_150');
      expect(codes).toContain('JOBS_151'); // idempotency
      expect(codes).toContain('JOBS_152'); // quarantine
    });

    it('every entry has required fields', () => {
      for (const [key, entry] of Object.entries(JOBS_ERRORS)) {
        expect(entry.code, `${key} missing code`).toBe(key);
        expect(entry.file, `${key} missing file`).toBeTruthy();
        expect(entry.function, `${key} missing function`).toBeTruthy();
        expect(entry.severity, `${key} missing severity`).toBeTruthy();
        expect(typeof entry.recoverable, `${key} missing recoverable`).toBe('boolean');
        expect(entry.description, `${key} missing description`).toBeTruthy();
        expect(Array.isArray(entry.diagnosis), `${key} missing diagnosis`).toBe(true);
        expect(entry.diagnosis.length, `${key} empty diagnosis`).toBeGreaterThan(0);
      }
    });

    it('has unique codes', () => {
      const codes = Object.values(JOBS_ERRORS).map(e => e.code);
      expect(new Set(codes).size).toBe(codes.length);
    });

    it('has 20 total error codes', () => {
      expect(Object.keys(JOBS_ERRORS).length).toBe(20);
    });

    it('v1.1 contract error describes missing fields', () => {
      expect(JOBS_ERRORS.JOBS_132.description).toContain('incomplete');
    });

    it('quarantine error is not recoverable', () => {
      expect(JOBS_ERRORS.JOBS_152.recoverable).toBe(false);
      expect(JOBS_ERRORS.JOBS_152.severity).toBe('critical');
    });
  });
});
