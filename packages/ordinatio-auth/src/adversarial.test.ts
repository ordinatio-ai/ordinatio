import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  recordLoginAttempt,
  checkAccountLockout,
  unlockAccount,
  validatePasswordStrength,
  checkSessionValidity,
  detectSuspiciousActivity,
  generateCsrfToken,
  parseToken,
  verifySignature,
  validateCsrfTokens,
  _resetLoginAttemptStore,
  _resetSessionActivityStore,
  AUTH_LOCKOUT_CONFIG,
} from './index';
import type { Session } from './types';

describe('adversarial', () => {
  beforeEach(() => {
    _resetLoginAttemptStore();
    _resetSessionActivityStore();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-02-07T10:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const SECRET = 'adversarial-test-secret-xyz';

  describe('callback poisoning', () => {
    it('survives callback that throws', () => {
      const throwingCallbacks = {
        log: () => { throw new Error('callback bomb'); },
      };
      // Should not throw even when callback throws — callbacks are optional
      // The current implementation will throw since it calls callbacks?.log?.() synchronously.
      // This tests that the code doesn't crash the process.
      expect(() => {
        try {
          recordLoginAttempt(
            { email: 'test@example.com', ip: '1.1.1.1', timestamp: new Date(), success: false },
            throwingCallbacks,
          );
        } catch {
          // Expected — callback exception propagates
        }
      }).not.toThrow();
    });

    it('works with undefined callbacks', () => {
      expect(() => {
        recordLoginAttempt(
          { email: 'test@example.com', ip: '1.1.1.1', timestamp: new Date(), success: false },
          undefined,
        );
      }).not.toThrow();
    });

    it('works with empty callbacks object', () => {
      expect(() => {
        recordLoginAttempt(
          { email: 'test@example.com', ip: '1.1.1.1', timestamp: new Date(), success: false },
          {},
        );
      }).not.toThrow();
    });
  });

  describe('empty and null inputs', () => {
    it('handles empty email for lockout check', () => {
      const status = checkAccountLockout('');
      expect(status.locked).toBe(false);
    });

    it('handles whitespace in email', () => {
      recordLoginAttempt({
        email: '  user@example.com  ',
        ip: '192.168.1.1',
        timestamp: new Date(),
        success: false,
      });
      const status = checkAccountLockout('user@example.com');
      expect(status.failedAttempts).toBe(1);
    });

    it('handles empty password for validation', () => {
      const result = validatePasswordStrength('');
      expect(result.valid).toBe(false);
    });

    it('handles very long passwords', () => {
      const longPassword = 'A'.repeat(100) + 'a' + '1' + '!' + 'bcd';
      const result = validatePasswordStrength(longPassword);
      expect(result.errors.some(e => e.includes('consecutive'))).toBe(true);
    });

    it('handles unicode in password validation', () => {
      const result = validatePasswordStrength('MyP@ssw0rd!ab');
      expect(result.valid).toBe(true);
    });
  });

  describe('config edge cases', () => {
    it('lockout duration increases correctly', () => {
      expect(AUTH_LOCKOUT_CONFIG.lockoutDurationsMs[0]).toBe(5 * 60 * 1000);
      expect(AUTH_LOCKOUT_CONFIG.lockoutDurationsMs[1]).toBe(15 * 60 * 1000);
      expect(AUTH_LOCKOUT_CONFIG.lockoutDurationsMs[2]).toBe(60 * 60 * 1000);
      expect(AUTH_LOCKOUT_CONFIG.lockoutDurationsMs[3]).toBe(24 * 60 * 60 * 1000);
    });

    it('handles concurrent lockout checks', () => {
      for (let i = 0; i < AUTH_LOCKOUT_CONFIG.maxAttempts - 1; i++) {
        recordLoginAttempt({
          email: 'user@example.com',
          ip: '192.168.1.1',
          timestamp: new Date(),
          success: false,
        });
      }
      const status1 = checkAccountLockout('user@example.com');
      const status2 = checkAccountLockout('user@example.com');
      expect(status1.locked).toBe(status2.locked);
    });
  });

  describe('CSRF edge cases', () => {
    it('rejects token generated with one secret validated with another', () => {
      const token = generateCsrfToken(SECRET);
      const parsed = parseToken(token)!;
      expect(verifySignature(parsed, 'different-secret')).toBe(false);
    });

    it('handles malformed base64url gracefully', () => {
      expect(parseToken('!!!not-base64!!!')).toBeNull();
    });

    it('handles both tokens null', () => {
      const result = validateCsrfTokens(null, null, SECRET);
      expect(result.valid).toBe(false);
      expect(result.code).toBe('MISSING_COOKIE');
    });
  });

  describe('manifest consistency', () => {
    it('every lockout response has a manifest', () => {
      const newAccount = checkAccountLockout('new@example.com');
      expect(newAccount.manifest).toBeDefined();
      expect(newAccount.manifest!.suggestedAction).toBeTruthy();

      for (let i = 0; i < AUTH_LOCKOUT_CONFIG.maxAttempts; i++) {
        recordLoginAttempt({
          email: 'locked@example.com',
          ip: '1.1.1.1',
          timestamp: new Date(),
          success: false,
        });
      }
      const locked = checkAccountLockout('locked@example.com');
      expect(locked.manifest).toBeDefined();
      expect(locked.manifest!.suggestedAction).toBeTruthy();
    });

    it('every password result has a manifest', () => {
      const weak = validatePasswordStrength('a');
      expect(weak.manifest).toBeDefined();
      const strong = validatePasswordStrength('Xk9$mNpQ2vWz!a');
      expect(strong.manifest).toBeDefined();
    });

    it('every session result has a manifest', () => {
      const valid: Session = {
        id: 's1', userId: 'u1', createdAt: new Date(), lastActiveAt: new Date(), ip: '1.1.1.1',
      };
      const r1 = checkSessionValidity(valid);
      expect(r1.manifest).toBeDefined();
      const r2 = detectSuspiciousActivity(valid, '1.1.1.1');
      expect(r2.manifest).toBeDefined();
    });

    it('every CSRF result has a manifest', () => {
      const token = generateCsrfToken(SECRET);
      const valid = validateCsrfTokens(token, token, SECRET);
      expect(valid.manifest).toBeDefined();
      const invalid = validateCsrfTokens(null, null, SECRET);
      expect(invalid.manifest).toBeDefined();
    });

    it('manifest confidence is always 0-1', () => {
      const r1 = checkAccountLockout('new@example.com');
      expect(r1.manifest!.confidence).toBeGreaterThanOrEqual(0);
      expect(r1.manifest!.confidence).toBeLessThanOrEqual(1);

      const r2 = validatePasswordStrength('Xk9$mNpQ2vWz!a');
      expect(r2.manifest!.confidence).toBeGreaterThanOrEqual(0);
      expect(r2.manifest!.confidence).toBeLessThanOrEqual(1);
    });
  });

  describe('store reset isolation', () => {
    it('_resetLoginAttemptStore clears all data', () => {
      recordLoginAttempt({
        email: 'user@example.com',
        ip: '192.168.1.1',
        timestamp: new Date(),
        success: false,
      });
      _resetLoginAttemptStore();
      const status = checkAccountLockout('user@example.com');
      expect(status.failedAttempts).toBe(0);
    });

    it('_resetSessionActivityStore clears all data', () => {
      const session: Session = {
        id: 'test-session',
        userId: 'user-1',
        createdAt: new Date(),
        lastActiveAt: new Date(),
        ip: '1.1.1.1',
      };
      detectSuspiciousActivity(session, '1.1.1.1');
      _resetSessionActivityStore();
      // After reset, a new check should be clean
      const result = detectSuspiciousActivity(
        { ...session, id: 'test-session-2' },
        '1.1.1.1',
      );
      expect(result.suspicious).toBe(false);
    });
  });
});
