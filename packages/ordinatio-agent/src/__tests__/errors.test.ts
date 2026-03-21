import { describe, it, expect } from 'vitest';
import { agentError } from '../errors/errors';
import { AGENT_ERRORS } from '../errors/error-registry';

describe('Agent Error Registry', () => {
  describe('agentError builder', () => {
    it('returns v2 diagnostic object', () => {
      const err = agentError('AGENT_800', { role: 'coo' });
      expect(err.code).toBe('AGENT_800');
      expect(err.ref).toMatch(/^AGENT_800-\d{8}T\d{6}$/);
      expect(err.timestamp).toBeTruthy();
      expect(err.module).toBe('AGENT');
      expect(err.description).toBeTruthy();
      expect(err.severity).toBeTruthy();
      expect(typeof err.recoverable).toBe('boolean');
      expect(Array.isArray(err.diagnosis)).toBe(true);
      expect(err.context).toEqual({ role: 'coo' });
    });

    it('handles unknown codes gracefully', () => {
      const err = agentError('AGENT_999');
      expect(err.code).toBe('AGENT_999');
      expect(err.module).toBe('AGENT');
      expect(err.description).toContain('Unknown');
      expect(err.recoverable).toBe(false);
      expect(err.context).toBeUndefined();
    });

    it('returns undefined context when none provided', () => {
      const err = agentError('AGENT_800');
      expect(err.context).toBeUndefined();
    });
  });

  describe('AGENT_ERRORS registry', () => {
    it('has error codes', () => {
      expect(Object.keys(AGENT_ERRORS).length).toBeGreaterThan(0);
    });

    it('every entry has required fields', () => {
      for (const [key, entry] of Object.entries(AGENT_ERRORS)) {
        expect(entry.code, `${key} missing code`).toBe(key);
        expect(entry.file, `${key} missing file`).toBeTruthy();
        expect(entry.function, `${key} missing function`).toBeTruthy();
        expect(entry.severity, `${key} missing severity`).toBeTruthy();
        expect(typeof entry.recoverable, `${key} missing recoverable`).toBe('boolean');
        expect(entry.description, `${key} missing description`).toBeTruthy();
        expect(Array.isArray(entry.diagnosis), `${key} missing diagnosis`).toBe(true);
      }
    });

    it('has unique codes', () => {
      const codes = Object.values(AGENT_ERRORS).map(e => e.code);
      expect(new Set(codes).size).toBe(codes.length);
    });
  });
});
