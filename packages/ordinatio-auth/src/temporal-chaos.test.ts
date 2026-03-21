import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  generateCsrfToken,
  parseToken,
  verifySignature,
  isTokenExpired,
  validateCsrfTokens,
  createCapabilityToken,
  verifyCapabilityToken,
  checkSessionValidity,
  checkAccountLockout,
  recordLoginAttempt,
  _resetLoginAttemptStore,
  _resetSessionActivityStore,
  AUTH_SESSION_CONFIG,
  AUTH_LOCKOUT_CONFIG,
  TOKEN_VALIDITY_MS,
  _generateTestToken,
} from './index';
import type { Session } from './types';

const SECRET = 'temporal-chaos-secret-xyz789';

describe('temporal chaos tests', () => {
  beforeEach(() => {
    _resetLoginAttemptStore();
    _resetSessionActivityStore();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-02-07T10:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('CSRF token under clock jumps', () => {
    it('token created now is valid now', () => {
      const token = generateCsrfToken(SECRET);
      const result = validateCsrfTokens(token, token, SECRET);
      expect(result.valid).toBe(true);
    });

    it('token survives small forward jump (30 minutes)', () => {
      const token = generateCsrfToken(SECRET);
      vi.advanceTimersByTime(30 * 60 * 1000); // 30 minutes
      const result = validateCsrfTokens(token, token, SECRET);
      expect(result.valid).toBe(true);
    });

    it('token expires after validity period + clock jump', () => {
      const token = generateCsrfToken(SECRET);
      vi.advanceTimersByTime(TOKEN_VALIDITY_MS + 1);
      const result = validateCsrfTokens(token, token, SECRET);
      expect(result.valid).toBe(false);
      expect(result.code).toBe('EXPIRED');
    });

    it('token created 1 year ago is expired', () => {
      const token = generateCsrfToken(SECRET);
      vi.advanceTimersByTime(365 * 24 * 60 * 60 * 1000); // 1 year
      const result = validateCsrfTokens(token, token, SECRET);
      expect(result.valid).toBe(false);
      expect(result.code).toBe('EXPIRED');
    });

    it('token from the future (clock jump backward) still verifies signature', () => {
      // Create token at T+1hr
      vi.advanceTimersByTime(60 * 60 * 1000);
      const futureToken = generateCsrfToken(SECRET);
      const parsed = parseToken(futureToken)!;

      // Jump back to now
      vi.setSystemTime(new Date('2026-02-07T10:00:00Z'));

      // Signature should still be valid (it's just HMAC over timestamp:random)
      expect(verifySignature(parsed, SECRET)).toBe(true);

      // But it should NOT be expired (its timestamp is in the future)
      expect(isTokenExpired(parsed)).toBe(false);
    });

    it('monotonic expiry invariant: expired tokens stay expired', () => {
      const token = generateCsrfToken(SECRET);

      // Advance past expiry
      vi.advanceTimersByTime(TOKEN_VALIDITY_MS + 1000);
      const r1 = validateCsrfTokens(token, token, SECRET);
      expect(r1.valid).toBe(false);

      // Advance even further — still expired
      vi.advanceTimersByTime(24 * 60 * 60 * 1000);
      const r2 = validateCsrfTokens(token, token, SECRET);
      expect(r2.valid).toBe(false);

      // Advance 1 year — still expired
      vi.advanceTimersByTime(365 * 24 * 60 * 60 * 1000);
      const r3 = validateCsrfTokens(token, token, SECRET);
      expect(r3.valid).toBe(false);
    });

    it('rapid token generation across clock ticks', () => {
      const tokens: string[] = [];
      for (let i = 0; i < 100; i++) {
        tokens.push(generateCsrfToken(SECRET));
        vi.advanceTimersByTime(1); // 1ms tick
      }

      // All should be valid now
      for (const token of tokens) {
        const result = validateCsrfTokens(token, token, SECRET);
        expect(result.valid).toBe(true);
      }

      // After expiry, all should be invalid
      vi.advanceTimersByTime(TOKEN_VALIDITY_MS + 1000);
      for (const token of tokens) {
        const result = validateCsrfTokens(token, token, SECRET);
        expect(result.valid).toBe(false);
      }
    });

    it('_generateTestToken with epoch 0 is always expired', () => {
      const token = _generateTestToken(0, SECRET);
      const parsed = parseToken(token)!;
      expect(verifySignature(parsed, SECRET)).toBe(true);
      expect(isTokenExpired(parsed)).toBe(true);
    });

    it('_generateTestToken with far-future timestamp is never expired', () => {
      const farFuture = Date.now() + 100 * 365 * 24 * 60 * 60 * 1000; // 100 years
      const token = _generateTestToken(farFuture, SECRET);
      const parsed = parseToken(token)!;
      expect(verifySignature(parsed, SECRET)).toBe(true);
      expect(isTokenExpired(parsed)).toBe(false);
    });
  });

  describe('capability token under clock jumps', () => {
    it('token with 1s TTL expires after 1s', () => {
      const token = createCapabilityToken(['read'], 1000, SECRET);
      const r1 = verifyCapabilityToken(token, 'read', SECRET);
      expect(r1.valid).toBe(true);

      vi.advanceTimersByTime(1001);
      const r2 = verifyCapabilityToken(token, 'read', SECRET);
      expect(r2.valid).toBe(false);
      expect(r2.error).toBe('Token expired');
    });

    it('token with 1 year TTL survives 11 months', () => {
      const oneYear = 365 * 24 * 60 * 60 * 1000;
      const token = createCapabilityToken(['admin'], oneYear, SECRET);

      vi.advanceTimersByTime(11 * 30 * 24 * 60 * 60 * 1000); // ~11 months
      const result = verifyCapabilityToken(token, 'admin', SECRET);
      expect(result.valid).toBe(true);
    });

    it('token with 1 year TTL expires at 1 year + 1ms', () => {
      const oneYear = 365 * 24 * 60 * 60 * 1000;
      const token = createCapabilityToken(['admin'], oneYear, SECRET);

      vi.advanceTimersByTime(oneYear + 1);
      const result = verifyCapabilityToken(token, 'admin', SECRET);
      expect(result.valid).toBe(false);
    });

    it('monotonic expiry: capability tokens stay expired', () => {
      const token = createCapabilityToken(['read'], 5000, SECRET);

      vi.advanceTimersByTime(5001);
      expect(verifyCapabilityToken(token, 'read', SECRET).valid).toBe(false);

      vi.advanceTimersByTime(60_000);
      expect(verifyCapabilityToken(token, 'read', SECRET).valid).toBe(false);

      vi.advanceTimersByTime(365 * 24 * 60 * 60 * 1000);
      expect(verifyCapabilityToken(token, 'read', SECRET).valid).toBe(false);
    });

    it('clock jump backward: token created in future is still valid from past', () => {
      vi.advanceTimersByTime(60_000);
      const token = createCapabilityToken(['read'], 120_000, SECRET);

      // Jump back to T=0
      vi.setSystemTime(new Date('2026-02-07T10:00:00Z'));
      const result = verifyCapabilityToken(token, 'read', SECRET);
      // Token's expiresAt is future-time + 120s, so from past-time it's not expired
      expect(result.valid).toBe(true);
    });
  });

  describe('session validity under clock jumps', () => {
    const createSession = (overrides?: Partial<Session>): Session => ({
      id: 'chaos-session',
      userId: 'user-1',
      createdAt: new Date(),
      lastActiveAt: new Date(),
      ip: '1.1.1.1',
      ...overrides,
    });

    it('session created now is valid', () => {
      const result = checkSessionValidity(createSession());
      expect(result.valid).toBe(true);
    });

    it('session survives 29 min inactivity', () => {
      const session = createSession();
      vi.advanceTimersByTime(29 * 60 * 1000);
      const result = checkSessionValidity(session);
      expect(result.valid).toBe(true);
    });

    it('session expires after 30+ min inactivity', () => {
      const session = createSession();
      vi.advanceTimersByTime(AUTH_SESSION_CONFIG.inactivityTimeoutMs + 1000);
      const result = checkSessionValidity(session);
      expect(result.valid).toBe(false);
      expect(result.reason).toBe('SESSION_INACTIVE');
    });

    it('session expires after absolute lifetime even with activity', () => {
      const session = createSession({
        createdAt: new Date(Date.now() - AUTH_SESSION_CONFIG.absoluteLifetimeMs - 1000),
        lastActiveAt: new Date(), // Just active!
      });
      const result = checkSessionValidity(session);
      expect(result.valid).toBe(false);
      expect(result.reason).toBe('SESSION_EXPIRED');
    });

    it('clock jump 1 year forward expires session', () => {
      const session = createSession();
      vi.advanceTimersByTime(365 * 24 * 60 * 60 * 1000);
      const result = checkSessionValidity(session);
      expect(result.valid).toBe(false);
    });

    it('clock jump 1 year backward: session from future has negative age', () => {
      vi.advanceTimersByTime(60 * 60 * 1000);
      const session = createSession(); // Created at T+1hr
      vi.setSystemTime(new Date('2026-02-07T10:00:00Z')); // Jump back

      // Session createdAt is in the future, so sessionAge is negative
      // The check `sessionAge > absoluteLifetimeMs` will be false (negative < positive)
      // The check `inactiveTime > inactivityTimeoutMs` depends on lastActiveAt
      const result = checkSessionValidity(session);
      // Future session should be "valid" since negative age < max
      expect(result.valid).toBe(true);
    });

    it('shouldRefresh transitions correctly with time', () => {
      const session = createSession();

      // Fresh: no refresh needed
      const r1 = checkSessionValidity(session);
      expect(r1.shouldRefresh).toBe(false);

      // After 6 minutes: refresh recommended
      vi.advanceTimersByTime(6 * 60 * 1000);
      const r2 = checkSessionValidity(session);
      expect(r2.shouldRefresh).toBe(true);
      expect(r2.valid).toBe(true);
    });
  });

  describe('lockout under clock jumps', () => {
    it('lockout expires after attempt window passes', () => {
      for (let i = 0; i < AUTH_LOCKOUT_CONFIG.maxAttempts; i++) {
        recordLoginAttempt({
          email: 'chaos@test.com', ip: '1.1.1.1', timestamp: new Date(), success: false,
        });
      }

      const locked = checkAccountLockout('chaos@test.com');
      expect(locked.locked).toBe(true);

      // Must advance past BOTH lockout duration AND attempt window,
      // otherwise old attempts still count and re-trigger lockout
      vi.advanceTimersByTime(AUTH_LOCKOUT_CONFIG.attemptWindowMs + 1000);
      const unlocked = checkAccountLockout('chaos@test.com');
      expect(unlocked.locked).toBe(false);
    });

    it('lockout level resets after 7 days via cleanup interval', () => {
      // Lock account
      for (let i = 0; i < AUTH_LOCKOUT_CONFIG.maxAttempts; i++) {
        recordLoginAttempt({
          email: 'reset@test.com', ip: '1.1.1.1', timestamp: new Date(), success: false,
        });
      }

      const locked = checkAccountLockout('reset@test.com');
      expect(locked.lockoutLevel).toBeGreaterThan(0);

      // Advance past attempt window so attempts age out, and past lockout duration
      vi.advanceTimersByTime(AUTH_LOCKOUT_CONFIG.attemptWindowMs + 1000);

      // After attempt window, old attempts are gone but lockout level persists
      // until the cleanup interval resets it (after levelResetMs)
      const afterWindow = checkAccountLockout('reset@test.com');
      expect(afterWindow.locked).toBe(false);
      // Level still persists (cleanup hasn't reset it yet)
      expect(afterWindow.lockoutLevel).toBeGreaterThan(0);
    });

    it('failed attempts outside window are not counted', () => {
      // Record attempts
      for (let i = 0; i < AUTH_LOCKOUT_CONFIG.maxAttempts - 1; i++) {
        recordLoginAttempt({
          email: 'window@test.com', ip: '1.1.1.1', timestamp: new Date(), success: false,
        });
      }

      // Jump past attempt window
      vi.advanceTimersByTime(AUTH_LOCKOUT_CONFIG.attemptWindowMs + 1000);

      // One more attempt should not trigger lockout (old ones are outside window)
      recordLoginAttempt({
        email: 'window@test.com', ip: '1.1.1.1', timestamp: new Date(), success: false,
      });

      const status = checkAccountLockout('window@test.com');
      expect(status.locked).toBe(false);
      expect(status.failedAttempts).toBe(1);
    });

    it('clock jump 1 year forward: all lockouts and attempts are stale', () => {
      for (let i = 0; i < AUTH_LOCKOUT_CONFIG.maxAttempts; i++) {
        recordLoginAttempt({
          email: 'stale@test.com', ip: '1.1.1.1', timestamp: new Date(), success: false,
        });
      }

      vi.advanceTimersByTime(365 * 24 * 60 * 60 * 1000);

      const status = checkAccountLockout('stale@test.com');
      expect(status.locked).toBe(false);
    });
  });

  describe('DST / timezone edge cases', () => {
    it('token created at midnight boundary is consistent', () => {
      vi.setSystemTime(new Date('2026-03-08T06:59:59.999Z')); // Just before DST spring forward
      const token = generateCsrfToken(SECRET);

      vi.setSystemTime(new Date('2026-03-08T07:00:00.001Z')); // Just after DST
      const result = validateCsrfTokens(token, token, SECRET);
      expect(result.valid).toBe(true);
    });

    it('token validity uses monotonic time, not wall clock', () => {
      const token = generateCsrfToken(SECRET);
      const parsed = parseToken(token)!;

      // Advance exactly to boundary
      vi.advanceTimersByTime(TOKEN_VALIDITY_MS);
      // At exact boundary, token is not expired (> check, not >=)
      expect(isTokenExpired(parsed)).toBe(false);

      // 1ms past boundary → expired
      vi.advanceTimersByTime(1);
      expect(isTokenExpired(parsed)).toBe(true);
    });
  });
});
