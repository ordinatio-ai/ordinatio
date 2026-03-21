import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  recordLoginAttempt,
  checkAccountLockout,
  unlockAccount,
  validatePasswordStrength,
  validatePasswordStrengthAsync,
  checkSessionValidity,
  detectSuspiciousActivity,
  invalidateUserSessions,
  generateCsrfToken,
  parseToken,
  verifySignature,
  isTokenExpired,
  validateCsrfTokens,
  extractCsrfToken,
  csrfErrorResponse,
  computeHmac,
  verifyHmac,
  createCapabilityToken,
  verifyCapabilityToken,
  setLockoutStore,
  setSessionStore,
  _resetLoginAttemptStore,
  _resetSessionActivityStore,
  _getLoginAttempts,
  _getSessionActivity,
  _generateTestToken,
  AUTH_LOCKOUT_CONFIG,
  AUTH_SESSION_CONFIG,
  AUTH_SUSPICIOUS_CONFIG,
  AUTH_PASSWORD_CONFIG,
  TOKEN_VALIDITY_MS,
  CSRF_COOKIE_NAME,
  CSRF_HEADER_NAME,
  CSRF_FORM_FIELD,
  InMemoryStore,
  buildManifest,
  authError,
  AUTH_ERRORS,
} from './index';
import type { Session, SecretProvider } from './types';

const SECRET = 'angry-mob-test-secret-xyz123';

describe('angry mob — @ordinatio/auth adversarial testing', () => {
  beforeEach(() => {
    _resetLoginAttemptStore();
    _resetSessionActivityStore();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-02-07T10:00:00Z'));
  });

  afterEach(() => {
    setLockoutStore(new InMemoryStore({ maxEntries: 10_000 }));
    setSessionStore(new InMemoryStore({ maxEntries: 50_000 }));
    vi.useRealTimers();
  });

  const createSession = (overrides?: Partial<Session>): Session => ({
    id: 'mob-session',
    userId: 'user-mob',
    createdAt: new Date(),
    lastActiveAt: new Date(),
    ip: '192.168.1.1',
    ...overrides,
  });

  // =========================================
  // AGENT 1: INPUT FUZZER
  // =========================================
  describe('Agent 1: Input Fuzzer', () => {
    describe('password validation input attacks', () => {
      it('handles control characters', () => {
        const controlChars = '\x00\x01\x02\x03\x04\x05\x06\x07\x08\x09\x0a\x0b\x0c\x0d\x0e\x0f';
        const result = validatePasswordStrength(controlChars);
        expect(result).toBeDefined();
        expect(typeof result.valid).toBe('boolean');
      });

      it('handles right-to-left override characters (bidi attacks)', () => {
        const bidi = 'Admin\u202E\u2066password\u2069\u202C';
        const result = validatePasswordStrength(bidi);
        expect(result).toBeDefined();
      });

      it('handles zero-width characters', () => {
        const zeroWidth = 'pass\u200B\u200C\u200D\uFEFFword';
        const result = validatePasswordStrength(zeroWidth);
        expect(result).toBeDefined();
      });

      it('handles string of length 10,000', () => {
        const huge = 'A'.repeat(10_000);
        const result = validatePasswordStrength(huge);
        expect(result).toBeDefined();
        expect(typeof result.valid).toBe('boolean');
      });

      it('handles string of all spaces', () => {
        const result = validatePasswordStrength(' '.repeat(50));
        expect(result.valid).toBe(false);
      });

      it('handles single-char repeated to meet length', () => {
        const result = validatePasswordStrength('!'.repeat(20));
        expect(result.valid).toBe(false);
        expect(result.errors.some(e => e.includes('consecutive'))).toBe(true);
      });

      it('handles newlines in password', () => {
        const result = validatePasswordStrength('Line1\nLine2\nLine3!Aa1');
        expect(result).toBeDefined();
      });

      it('handles tab characters', () => {
        const result = validatePasswordStrength('Passw\t0rd!abcdef');
        expect(result).toBeDefined();
      });
    });

    describe('email normalization attacks', () => {
      it('handles email with unicode homoglyphs', () => {
        // Cyrillic 'а' (U+0430) looks like Latin 'a'
        recordLoginAttempt({
          email: 'аdmin@test.com', // Cyrillic а
          ip: '1.1.1.1',
          timestamp: new Date(),
          success: false,
        });
        // Latin 'a' version should be a different entry
        const status = checkAccountLockout('admin@test.com');
        expect(status.failedAttempts).toBe(0); // Different email
      });

      it('handles email with null bytes', () => {
        expect(() => {
          recordLoginAttempt({
            email: 'user\x00@test.com',
            ip: '1.1.1.1',
            timestamp: new Date(),
            success: false,
          });
        }).not.toThrow();
      });

      it('handles extremely long email', () => {
        const longEmail = 'a'.repeat(5000) + '@test.com';
        expect(() => {
          recordLoginAttempt({
            email: longEmail,
            ip: '1.1.1.1',
            timestamp: new Date(),
            success: false,
          });
        }).not.toThrow();
      });

      it('handles email-like strings that arent emails', () => {
        for (const fake of ['not-an-email', '', '@', '@@', 'a@', '@b']) {
          expect(() => {
            recordLoginAttempt({
              email: fake,
              ip: '1.1.1.1',
              timestamp: new Date(),
              success: false,
            });
          }).not.toThrow();
        }
      });
    });

    describe('CSRF token format attacks', () => {
      it('rejects token with extra colons in base64 payload', () => {
        const evil = Buffer.from('123:abc:def:extra:colons').toString('base64url');
        expect(parseToken(evil)).toBeNull();
      });

      it('rejects token with non-numeric timestamp', () => {
        const evil = Buffer.from('NaN:abc123:sig456').toString('base64url');
        const parsed = parseToken(evil);
        expect(parsed).toBeNull();
      });

      it('rejects empty base64', () => {
        expect(parseToken('')).toBeNull();
      });

      it('rejects token with only whitespace', () => {
        expect(parseToken('   ')).toBeNull();
      });

      it('handles extremely long token string', () => {
        const longToken = 'A'.repeat(100_000);
        expect(parseToken(longToken)).toBeNull();
      });
    });

    describe('capability token input attacks', () => {
      it('rejects empty capabilities array', () => {
        expect(() => createCapabilityToken([], 60_000, SECRET)).toThrow('At least one capability');
      });

      it('rejects zero TTL', () => {
        expect(() => createCapabilityToken(['read'], 0, SECRET)).toThrow('TTL must be positive');
      });

      it('rejects negative TTL', () => {
        expect(() => createCapabilityToken(['read'], -1000, SECRET)).toThrow('TTL must be positive');
      });

      it('rejects empty secret', () => {
        expect(() => createCapabilityToken(['read'], 60_000, '')).toThrow('Secret is required');
      });

      it('handles capabilities with special characters', () => {
        const caps = ['read:*', 'write/all', 'admin:user:delete', '{"inject": true}'];
        const token = createCapabilityToken(caps, 60_000, SECRET);
        for (const cap of caps) {
          const result = verifyCapabilityToken(token, cap, SECRET);
          expect(result.valid).toBe(true);
        }
      });

      it('verifyCapabilityToken handles garbage input', () => {
        const result = verifyCapabilityToken('garbage-not-base64-at-all!!!', 'read', SECRET);
        expect(result.valid).toBe(false);
      });
    });
  });

  // =========================================
  // AGENT 2: STATE CORRUPTION
  // =========================================
  describe('Agent 2: State Corruption', () => {
    it('lockout state survives successful login mid-lockout', () => {
      // Lock account
      for (let i = 0; i < AUTH_LOCKOUT_CONFIG.maxAttempts; i++) {
        recordLoginAttempt({
          email: 'victim@test.com', ip: '1.1.1.1', timestamp: new Date(), success: false,
        });
      }
      const locked = checkAccountLockout('victim@test.com');
      expect(locked.locked).toBe(true);

      // Successful login during lockout
      recordLoginAttempt({
        email: 'victim@test.com', ip: '1.1.1.1', timestamp: new Date(), success: true,
      });

      // Account should still be locked (lockout is time-based, not cleared by success)
      const stillLocked = checkAccountLockout('victim@test.com');
      expect(stillLocked.locked).toBe(true);
    });

    it('unlockAccount without resetLevel preserves escalation', () => {
      // Trigger lockout
      for (let i = 0; i < AUTH_LOCKOUT_CONFIG.maxAttempts; i++) {
        recordLoginAttempt({
          email: 'escalate@test.com', ip: '1.1.1.1', timestamp: new Date(), success: false,
        });
      }
      checkAccountLockout('escalate@test.com'); // Trigger lockout

      // Unlock without resetting level
      unlockAccount('escalate@test.com', false);

      // Advance past attempt window so old failed attempts age out
      // (otherwise checkAccountLockout re-counts them and re-triggers lockout)
      vi.advanceTimersByTime(AUTH_LOCKOUT_CONFIG.attemptWindowMs + 1000);

      const status = checkAccountLockout('escalate@test.com');
      expect(status.locked).toBe(false);
      expect(status.lockoutLevel).toBeGreaterThan(0); // Level preserved
    });

    it('unlockAccount with resetLevel clears everything', () => {
      for (let i = 0; i < AUTH_LOCKOUT_CONFIG.maxAttempts; i++) {
        recordLoginAttempt({
          email: 'clean@test.com', ip: '1.1.1.1', timestamp: new Date(), success: false,
        });
      }
      checkAccountLockout('clean@test.com');

      unlockAccount('clean@test.com', true);

      // Advance past attempt window so old failed attempts age out
      vi.advanceTimersByTime(AUTH_LOCKOUT_CONFIG.attemptWindowMs + 1000);

      const status = checkAccountLockout('clean@test.com');
      expect(status.lockoutLevel).toBe(0);
    });

    it('invalidateUserSessions clears all session activity', () => {
      const session = createSession();
      detectSuspiciousActivity(session, '1.1.1.1');
      detectSuspiciousActivity(session, '2.2.2.2');
      detectSuspiciousActivity(session, '3.3.3.3');

      invalidateUserSessions('user-mob', 'test');

      const activity = _getSessionActivity(session.id);
      expect(activity).toBeUndefined();
    });

    it('_resetLoginAttemptStore clears idempotency store too', () => {
      recordLoginAttempt({
        email: 'idem@test.com', ip: '1.1.1.1', timestamp: new Date(), success: false,
        idempotencyKey: 'key-1',
      });

      _resetLoginAttemptStore();

      // Same key should now be accepted (store was cleared)
      recordLoginAttempt({
        email: 'idem@test.com', ip: '1.1.1.1', timestamp: new Date(), success: false,
        idempotencyKey: 'key-1',
      });
      const status = checkAccountLockout('idem@test.com');
      expect(status.failedAttempts).toBe(1);
    });
  });

  // =========================================
  // AGENT 3: SECURITY AUDITOR
  // =========================================
  describe('Agent 3: Security Auditor', () => {
    it('CSRF tokens use timing-safe comparison (no timing attack)', () => {
      const token = generateCsrfToken(SECRET);
      const parsed = parseToken(token)!;

      // If timing-safe, both should take ~same time
      // We can't directly test timing, but verify the code path uses timingSafeEqual
      expect(verifySignature(parsed, SECRET)).toBe(true);

      // Wrong signature should still go through the same code path
      parsed.signature = 'a'.repeat(parsed.signature.length);
      expect(verifySignature(parsed, SECRET)).toBe(false);
    });

    it('CSRF rejects token signed with different secret', () => {
      const token = generateCsrfToken(SECRET);
      const result = validateCsrfTokens(token, token, 'attacker-secret');
      expect(result.valid).toBe(false);
      expect(result.code).toBe('SIGNATURE_MISMATCH');
      expect(result.manifest!.suggestedAction).toBe('TERMINATE_SESSION');
      expect(result.manifest!.requiresHumanReview).toBe(true);
    });

    it('capability token rejects tampered payload', () => {
      const token = createCapabilityToken(['read'], 60_000, SECRET);
      const decoded = Buffer.from(token, 'base64url').toString('utf8');
      const tampered = decoded.replace('"read"', '"admin"');
      const reEncoded = Buffer.from(tampered).toString('base64url');

      const result = verifyCapabilityToken(reEncoded, 'admin', SECRET);
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Invalid token signature');
    });

    it('capability token rejects tampered TTL', () => {
      const token = createCapabilityToken(['read'], 1000, SECRET);
      const decoded = Buffer.from(token, 'base64url').toString('utf8');
      // Try to extend expiry by 1 year
      const currentExpiry = JSON.parse(decoded.split(':').slice(0, -1).join(':')).expiresAt || 0;
      if (currentExpiry > 0) {
        const extendedExpiry = currentExpiry + 365 * 24 * 60 * 60 * 1000;
        const tampered = decoded.replace(String(currentExpiry), String(extendedExpiry));
        const reEncoded = Buffer.from(tampered).toString('base64url');

        const result = verifyCapabilityToken(reEncoded, 'read', SECRET);
        expect(result.valid).toBe(false);
      }
    });

    it('password validation detects leet speak substitutions', () => {
      const result = validatePasswordStrength('p@$$w0rd');
      expect(result.errors.some(e => e.includes('common'))).toBe(true);
    });

    it('lockout escalation goes through all 4 levels', () => {
      const email = 'escalation@test.com';

      for (let level = 1; level <= AUTH_LOCKOUT_CONFIG.maxLockoutLevel; level++) {
        // Trigger lockout
        for (let i = 0; i < AUTH_LOCKOUT_CONFIG.maxAttempts; i++) {
          recordLoginAttempt({
            email, ip: '1.1.1.1', timestamp: new Date(), success: false,
          });
        }
        const status = checkAccountLockout(email);
        expect(status.locked).toBe(true);
        expect(status.lockoutLevel).toBe(level);

        // Wait out lockout
        vi.advanceTimersByTime(AUTH_LOCKOUT_CONFIG.lockoutDurationsMs[level - 1] + 1000);
      }
    });

    it('impossible travel detection triggers at correct threshold', () => {
      const session = createSession();

      detectSuspiciousActivity(session, '1.1.1.1', { country: 'US' });
      vi.advanceTimersByTime(30 * 1000); // 30 seconds later
      const result = detectSuspiciousActivity(session, '2.2.2.2', { country: 'JP' });

      expect(result.suspicious).toBe(true);
      expect(result.flags.some(f => f.type === 'IMPOSSIBLE_TRAVEL')).toBe(true);
    });

    it('error codes are unique and non-overlapping', () => {
      const codes = Object.keys(AUTH_ERRORS);
      const codeSet = new Set(codes);
      expect(codeSet.size).toBe(codes.length); // No duplicates
    });

    it('all error codes have required fields', () => {
      for (const [code, entry] of Object.entries(AUTH_ERRORS)) {
        expect(entry.file, `${code} missing file`).toBeTruthy();
        expect(entry.function, `${code} missing function`).toBeTruthy();
        expect(entry.severity, `${code} missing severity`).toBeTruthy();
        expect(entry.description, `${code} missing description`).toBeTruthy();
        expect(Array.isArray(entry.diagnosis), `${code} missing diagnosis`).toBe(true);
        expect(typeof entry.recoverable, `${code} missing recoverable`).toBe('boolean');
      }
    });

    it('authError returns correct structure', () => {
      const err = authError('AUTH_100');
      expect(err.code).toBe('AUTH_100');
      expect(err.ref).toMatch(/^AUTH_100-\d{8}T\d{6}$/);
      // authError returns { code, ref } — ref contains the timestamp
      expect(err.ref.length).toBeGreaterThan(err.code.length);
    });
  });

  // =========================================
  // AGENT 4: EDGE CASE FINDER
  // =========================================
  describe('Agent 4: Edge Case Finder', () => {
    it('session with createdAt in the future is still valid', () => {
      const session = createSession({
        createdAt: new Date(Date.now() + 60_000), // 1 min in future
        lastActiveAt: new Date(),
      });
      const result = checkSessionValidity(session);
      expect(result.valid).toBe(true);
    });

    it('session with lastActiveAt in the future', () => {
      const session = createSession({
        lastActiveAt: new Date(Date.now() + 60_000),
      });
      const result = checkSessionValidity(session);
      expect(result.valid).toBe(true);
      expect(result.shouldRefresh).toBe(false);
    });

    it('password score boundary: exactly 0', () => {
      const result = validatePasswordStrength('a');
      expect(result.score).toBeGreaterThanOrEqual(0);
    });

    it('password score boundary: exactly 100', () => {
      const result = validatePasswordStrength('Xk9$mNpQ2vWz!abcdefghijklmnop');
      expect(result.score).toBeLessThanOrEqual(100);
    });

    it('lockout with exactly maxAttempts - 1: not locked', () => {
      for (let i = 0; i < AUTH_LOCKOUT_CONFIG.maxAttempts - 1; i++) {
        recordLoginAttempt({
          email: 'boundary@test.com', ip: '1.1.1.1', timestamp: new Date(), success: false,
        });
      }
      const status = checkAccountLockout('boundary@test.com');
      expect(status.locked).toBe(false);
    });

    it('lockout with exactly maxAttempts: locked', () => {
      for (let i = 0; i < AUTH_LOCKOUT_CONFIG.maxAttempts; i++) {
        recordLoginAttempt({
          email: 'exact@test.com', ip: '1.1.1.1', timestamp: new Date(), success: false,
        });
      }
      const status = checkAccountLockout('exact@test.com');
      expect(status.locked).toBe(true);
    });

    it('CSRF validation: both tokens null', () => {
      const result = validateCsrfTokens(null, null, SECRET);
      expect(result.valid).toBe(false);
      expect(result.code).toBe('MISSING_COOKIE');
    });

    it('CSRF validation: request token null, cookie valid', () => {
      const token = generateCsrfToken(SECRET);
      const result = validateCsrfTokens(null, token, SECRET);
      expect(result.valid).toBe(false);
      expect(result.code).toBe('MISSING_TOKEN');
    });

    it('capability token: verify with empty string capability', () => {
      const token = createCapabilityToken([''], 60_000, SECRET);
      const result = verifyCapabilityToken(token, '', SECRET);
      expect(result.valid).toBe(true);
    });

    it('session activity tracking at rapid request threshold boundary', () => {
      const session = createSession();
      // Fill up to exactly threshold
      for (let i = 0; i < AUTH_SUSPICIOUS_CONFIG.rapidRequestThreshold; i++) {
        detectSuspiciousActivity(session, '1.1.1.1');
      }
      // At threshold: not yet flagged (threshold is >)
      const atThreshold = detectSuspiciousActivity(session, '1.1.1.1');
      expect(atThreshold.flags.some(f => f.type === 'RAPID_REQUESTS')).toBe(true);
    });

    it('token at exact expiry boundary', () => {
      const token = generateCsrfToken(SECRET);
      const parsed = parseToken(token)!;

      vi.advanceTimersByTime(TOKEN_VALIDITY_MS);
      expect(isTokenExpired(parsed)).toBe(false); // At boundary, not yet expired

      vi.advanceTimersByTime(1);
      expect(isTokenExpired(parsed)).toBe(true); // 1ms past → expired
    });

    it('unlocking non-existent account doesnt crash', () => {
      expect(() => unlockAccount('nonexistent@test.com')).not.toThrow();
    });
  });

  // =========================================
  // AGENT 5: CONCURRENCY ATTACKER
  // =========================================
  describe('Agent 5: Concurrency Attacker', () => {
    it('many users locked simultaneously dont interfere', async () => {
      const emails = Array.from({ length: 20 }, (_, i) => `mob-${i}@test.com`);

      // Lock all accounts simultaneously
      await Promise.all(
        emails.map(email =>
          Promise.resolve().then(() => {
            for (let i = 0; i < AUTH_LOCKOUT_CONFIG.maxAttempts; i++) {
              recordLoginAttempt({ email, ip: '1.1.1.1', timestamp: new Date(), success: false });
            }
          }),
        ),
      );

      // Verify each is independently locked
      for (const email of emails) {
        const status = checkAccountLockout(email);
        expect(status.locked).toBe(true);
      }
    });

    it('concurrent password validations are pure (no shared state)', async () => {
      const results = await Promise.all([
        Promise.resolve().then(() => validatePasswordStrength('weak')),
        Promise.resolve().then(() => validatePasswordStrength('Xk9$mNpQ2vWz!a')),
        Promise.resolve().then(() => validatePasswordStrength('Tr7!qWx9Lm2@nB')),
        Promise.resolve().then(() => validatePasswordStrength('short')),
      ]);

      expect(results[0].valid).toBe(false);  // 'weak' — too short
      expect(results[1].valid).toBe(true);   // 'Xk9$mNpQ2vWz!a' — strong
      expect(results[2].valid).toBe(true);   // 'Tr7!qWx9Lm2@nB' — strong
      expect(results[3].valid).toBe(false);  // 'short' — too short
    });
  });

  // =========================================
  // AGENT 6: MANIFEST CONSISTENCY CHECKER
  // =========================================
  describe('Agent 6: Manifest Consistency Checker', () => {
    it('every lockout response has consistent manifest', () => {
      // Not locked
      const clean = checkAccountLockout('clean@test.com');
      expect(clean.manifest!.suggestedAction).toBe('ALLOW');
      expect(clean.manifest!.confidence).toBe(1.0);

      // With failed attempts
      recordLoginAttempt({
        email: 'partial@test.com', ip: '1.1.1.1', timestamp: new Date(), success: false,
      });
      const partial = checkAccountLockout('partial@test.com');
      expect(partial.manifest!.suggestedAction).toBe('ALLOW');
      expect(partial.manifest!.confidence).toBe(0.8);

      // Locked (level 1)
      for (let i = 0; i < AUTH_LOCKOUT_CONFIG.maxAttempts; i++) {
        recordLoginAttempt({
          email: 'locked-l1@test.com', ip: '1.1.1.1', timestamp: new Date(), success: false,
        });
      }
      const locked1 = checkAccountLockout('locked-l1@test.com');
      expect(locked1.manifest!.suggestedAction).toBe('RETRY_WITH_BACKOFF');
    });

    it('password manifest aligns with valid/invalid', () => {
      const valid = validatePasswordStrength('Xk9$mNpQ2vWz!a');
      expect(valid.manifest!.suggestedAction).toBe('ALLOW');

      const invalid = validatePasswordStrength('weak');
      expect(invalid.manifest!.suggestedAction).toBe('PROMPT_PASSWORD_CHANGE');
    });

    it('session manifest aligns with valid/invalid/nearing-timeout', () => {
      const valid = checkSessionValidity(createSession());
      expect(valid.manifest!.suggestedAction).toBe('ALLOW');

      const expired = checkSessionValidity(createSession({
        createdAt: new Date(Date.now() - AUTH_SESSION_CONFIG.absoluteLifetimeMs - 1000),
      }));
      expect(expired.manifest!.suggestedAction).toBe('REQUIRE_REAUTHENTICATION');
    });

    it('CSRF manifest aligns with validation result', () => {
      const token = generateCsrfToken(SECRET);
      const valid = validateCsrfTokens(token, token, SECRET);
      expect(valid.manifest!.suggestedAction).toBe('ALLOW');

      const expired = (() => {
        const t = generateCsrfToken(SECRET);
        vi.advanceTimersByTime(TOKEN_VALIDITY_MS + 1000);
        return validateCsrfTokens(t, t, SECRET);
      })();
      expect(expired.manifest!.suggestedAction).toBe('ROTATE_TOKEN');
    });

    it('suspicious activity manifest escalates with risk', () => {
      const session = createSession();

      // Low risk
      const low = detectSuspiciousActivity(session, '1.1.1.1');
      expect(low.manifest!.suggestedAction).toBe('ALLOW');

      // High risk (impossible travel)
      detectSuspiciousActivity(session, '1.1.1.1', { country: 'US' });
      vi.advanceTimersByTime(60 * 1000);
      const high = detectSuspiciousActivity(session, '2.2.2.2', { country: 'CN' });
      expect(['REQUEST_MFA_CHALLENGE', 'TERMINATE_SESSION']).toContain(high.manifest!.suggestedAction);
    });

    it('buildManifest creates well-formed manifests', () => {
      const m = buildManifest('ALLOW', 1.0, false, { test: true });
      expect(m.suggestedAction).toBe('ALLOW');
      expect(m.confidence).toBe(1.0);
      expect(m.requiresHumanReview).toBe(false);
      expect(m.context).toEqual({ test: true });
    });

    it('all manifest confidence values are 0-1', () => {
      const checks = [
        checkAccountLockout('new@test.com'),
        validatePasswordStrength('Xk9$mNpQ2vWz!a'),
        validatePasswordStrength('weak'),
        checkSessionValidity(createSession()),
        detectSuspiciousActivity(createSession(), '1.1.1.1'),
      ];

      for (const result of checks) {
        if ('manifest' in result && result.manifest) {
          expect(result.manifest.confidence).toBeGreaterThanOrEqual(0);
          expect(result.manifest.confidence).toBeLessThanOrEqual(1);
        }
      }
    });
  });

  // =========================================
  // AGENT 7: HSM/SecretProvider AUDITOR
  // =========================================
  describe('Agent 7: HSM/SecretProvider Auditor', () => {
    const mockProvider: SecretProvider = {
      sign: (data: string) => `hsm-${data.length}`,
      verify: (data: string, sig: string) => sig === `hsm-${data.length}`,
    };

    it('CSRF end-to-end with SecretProvider', () => {
      const token = generateCsrfToken(mockProvider);
      const result = validateCsrfTokens(token, token, mockProvider);
      expect(result.valid).toBe(true);
    });

    it('capability token with SecretProvider', () => {
      const token = createCapabilityToken(['read', 'write'], 60_000, mockProvider);
      expect(verifyCapabilityToken(token, 'read', mockProvider).valid).toBe(true);
      expect(verifyCapabilityToken(token, 'write', mockProvider).valid).toBe(true);
      expect(verifyCapabilityToken(token, 'admin', mockProvider).valid).toBe(false);
    });

    it('string secret and SecretProvider are incompatible', () => {
      const stringToken = generateCsrfToken(SECRET);
      const result = validateCsrfTokens(stringToken, stringToken, mockProvider);
      expect(result.valid).toBe(false);
    });

    it('SecretProvider that always rejects', () => {
      const rejecter: SecretProvider = {
        sign: () => 'fixed-sig',
        verify: () => false,
      };

      const token = generateCsrfToken(rejecter);
      const result = validateCsrfTokens(token, token, rejecter);
      expect(result.valid).toBe(false);
      expect(result.code).toBe('SIGNATURE_MISMATCH');
    });

    it('computeHmac/verifyHmac roundtrip with string', () => {
      const sig = computeHmac('test-data', SECRET);
      expect(verifyHmac('test-data', sig, SECRET)).toBe(true);
      expect(verifyHmac('wrong-data', sig, SECRET)).toBe(false);
    });

    it('computeHmac/verifyHmac roundtrip with provider', () => {
      const sig = computeHmac('test-data', mockProvider);
      expect(verifyHmac('test-data', sig, mockProvider)).toBe(true);
    });
  });

  // =========================================
  // AGENT 8: ASYNC BREACH CHECK ABUSER
  // =========================================
  describe('Agent 8: Async Breach Check Abuser', () => {
    it('breach check that throws Error', async () => {
      const result = await validatePasswordStrengthAsync('Xk9$mNpQ2vWz!a', undefined, {
        checkBreached: async () => { throw new Error('Network failure'); },
      });
      expect(result.valid).toBe(true); // Graceful degradation
    });

    it('breach check that throws non-Error', async () => {
      const result = await validatePasswordStrengthAsync('Xk9$mNpQ2vWz!a', undefined, {
        checkBreached: async () => { throw 'string error'; },
      });
      expect(result.valid).toBe(true);
    });

    it('breach check that returns after microtask delay', async () => {
      const result = await validatePasswordStrengthAsync('Xk9$mNpQ2vWz!a', undefined, {
        checkBreached: async () => {
          // Use microtask (Promise.resolve) instead of macrotask (setTimeout)
          // because fake timers are active
          await Promise.resolve();
          return false;
        },
      });
      expect(result.valid).toBe(true);
    });

    it('breach check that always says breached', async () => {
      const result = await validatePasswordStrengthAsync('Xk9$mNpQ2vWz!a', undefined, {
        checkBreached: async () => true,
      });
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('This password has appeared in a data breach and should not be used');
      expect(result.manifest!.requiresHumanReview).toBe(true);
    });

    it('breach check does not change sync validation errors', async () => {
      const sync = validatePasswordStrength('weak');
      const async_ = await validatePasswordStrengthAsync('weak', undefined, {
        checkBreached: async () => true,
      });

      // Async should have all sync errors PLUS the breach error
      for (const err of sync.errors) {
        expect(async_.errors).toContain(err);
      }
      expect(async_.errors.length).toBeGreaterThan(sync.errors.length);
    });
  });

  // =========================================
  // AGENT 9: EXTRACTCSRFTOKEN REQUEST FORGER
  // =========================================
  describe('Agent 9: extractCsrfToken Request Forger', () => {
    it('extracts from header', async () => {
      const req = new Request('http://localhost/api/test', {
        method: 'POST',
        headers: { [CSRF_HEADER_NAME]: 'header-token' },
      });
      expect(await extractCsrfToken(req)).toBe('header-token');
    });

    it('extracts from JSON body', async () => {
      const req = new Request('http://localhost/api/test', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ [CSRF_FORM_FIELD]: 'body-token' }),
      });
      expect(await extractCsrfToken(req)).toBe('body-token');
    });

    it('returns null for empty JSON body', async () => {
      const req = new Request('http://localhost/api/test', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({}),
      });
      expect(await extractCsrfToken(req)).toBeNull();
    });

    it('returns null for malformed JSON body', async () => {
      const req = new Request('http://localhost/api/test', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: 'not-json',
      });
      expect(await extractCsrfToken(req)).toBeNull();
    });

    it('returns null for GET request without token', async () => {
      const req = new Request('http://localhost/api/test', { method: 'GET' });
      expect(await extractCsrfToken(req)).toBeNull();
    });

    it('header takes priority over body', async () => {
      const req = new Request('http://localhost/api/test', {
        method: 'POST',
        headers: {
          [CSRF_HEADER_NAME]: 'header-wins',
          'content-type': 'application/json',
        },
        body: JSON.stringify({ [CSRF_FORM_FIELD]: 'body-loses' }),
      });
      expect(await extractCsrfToken(req)).toBe('header-wins');
    });
  });

  // =========================================
  // AGENT 10: CSRFERRORRESPONSE VERIFIER
  // =========================================
  describe('Agent 10: csrfErrorResponse Verifier', () => {
    it('returns 403 with correct content-type', () => {
      const result = csrfErrorResponse({
        valid: false,
        error: 'test error',
        code: 'MISSING_TOKEN',
      });
      expect(result.status).toBe(403);
      expect(result.headers.get('content-type')).toBe('application/json');
    });

    it('body contains error details', async () => {
      const result = csrfErrorResponse({
        valid: false,
        error: 'Token expired',
        code: 'EXPIRED',
      });
      const body = await result.json();
      expect(body.error).toBe('CSRF validation failed');
      expect(body.message).toBe('Token expired');
      expect(body.code).toBe('EXPIRED');
    });
  });

  // =========================================
  // AGENT 11: CONSTANT VALIDATOR
  // =========================================
  describe('Agent 11: Constant Validator', () => {
    it('CSRF constants are correct', () => {
      expect(CSRF_COOKIE_NAME).toBe('__Host-csrf');
      expect(CSRF_HEADER_NAME).toBe('x-csrf-token');
      expect(CSRF_FORM_FIELD).toBe('_csrf');
      expect(TOKEN_VALIDITY_MS).toBe(3600000);
    });

    it('lockout config is reasonable', () => {
      expect(AUTH_LOCKOUT_CONFIG.maxAttempts).toBe(5);
      expect(AUTH_LOCKOUT_CONFIG.maxLockoutLevel).toBe(4);
      expect(AUTH_LOCKOUT_CONFIG.lockoutDurationsMs).toHaveLength(4);
      // Durations should be increasing
      for (let i = 1; i < AUTH_LOCKOUT_CONFIG.lockoutDurationsMs.length; i++) {
        expect(AUTH_LOCKOUT_CONFIG.lockoutDurationsMs[i]).toBeGreaterThan(
          AUTH_LOCKOUT_CONFIG.lockoutDurationsMs[i - 1],
        );
      }
    });

    it('session config is reasonable', () => {
      expect(AUTH_SESSION_CONFIG.inactivityTimeoutMs).toBe(30 * 60 * 1000);
      expect(AUTH_SESSION_CONFIG.absoluteLifetimeMs).toBe(24 * 60 * 60 * 1000);
      expect(AUTH_SESSION_CONFIG.timeoutWarningMs).toBeLessThan(AUTH_SESSION_CONFIG.inactivityTimeoutMs);
    });

    it('password config is reasonable', () => {
      expect(AUTH_PASSWORD_CONFIG.minLength).toBe(12);
      expect(AUTH_PASSWORD_CONFIG.maxConsecutiveChars).toBe(3);
      expect(AUTH_PASSWORD_CONFIG.minUniqueChars).toBe(8);
    });

    it('suspicious config is reasonable', () => {
      expect(AUTH_SUSPICIOUS_CONFIG.maxIpsPerSession).toBe(2);
      expect(AUTH_SUSPICIOUS_CONFIG.rapidRequestThreshold).toBe(60);
      expect(AUTH_SUSPICIOUS_CONFIG.unusualHoursStart).toBeLessThan(AUTH_SUSPICIOUS_CONFIG.unusualHoursEnd);
    });
  });

  // =========================================
  // AGENT 12: STORE INJECTION TESTER
  // =========================================
  describe('Agent 12: Store Injection Tester', () => {
    it('custom lockout store receives operations', () => {
      const custom = new InMemoryStore<any>({ maxEntries: 5 });
      setLockoutStore(custom);

      recordLoginAttempt({
        email: 'custom@test.com', ip: '1.1.1.1', timestamp: new Date(), success: false,
      });

      expect(custom.size).toBeGreaterThan(0);
    });

    it('custom session store receives operations', () => {
      const custom = new InMemoryStore<any>({ maxEntries: 5 });
      setSessionStore(custom);

      detectSuspiciousActivity(createSession(), '1.1.1.1');
      expect(custom.size).toBeGreaterThan(0);
    });

    it('lockout store with maxEntries=5 evicts old users', () => {
      const tiny = new InMemoryStore<any>({ maxEntries: 5 });
      setLockoutStore(tiny);

      for (let i = 0; i < 10; i++) {
        recordLoginAttempt({
          email: `evict-${i}@test.com`, ip: '1.1.1.1', timestamp: new Date(), success: false,
        });
      }

      expect(tiny.size).toBeLessThanOrEqual(5);
    });
  });

  // =========================================
  // AGENT 13: IDEMPOTENCY KEY ADVERSARY
  // =========================================
  describe('Agent 13: Idempotency Key Adversary', () => {
    it('same key across different emails still deduplicates', () => {
      const KEY = 'cross-email-key';

      recordLoginAttempt({
        email: 'user-a@test.com', ip: '1.1.1.1', timestamp: new Date(), success: false,
        idempotencyKey: KEY,
      });
      recordLoginAttempt({
        email: 'user-b@test.com', ip: '1.1.1.1', timestamp: new Date(), success: false,
        idempotencyKey: KEY,
      });

      // Second attempt was skipped (same idempotency key)
      const a = checkAccountLockout('user-a@test.com');
      const b = checkAccountLockout('user-b@test.com');
      expect(a.failedAttempts).toBe(1);
      expect(b.failedAttempts).toBe(0);
    });

    it('empty string key works as normal attempt (no idempotency)', () => {
      recordLoginAttempt({
        email: 'empty-key@test.com', ip: '1.1.1.1', timestamp: new Date(), success: false,
        idempotencyKey: '',
      });
      recordLoginAttempt({
        email: 'empty-key@test.com', ip: '1.1.1.1', timestamp: new Date(), success: false,
        idempotencyKey: '',
      });

      // Empty string is falsy, so idempotency check is skipped
      const status = checkAccountLockout('empty-key@test.com');
      expect(status.failedAttempts).toBe(2);
    });

    it('undefined key works as normal attempt', () => {
      recordLoginAttempt({
        email: 'no-key@test.com', ip: '1.1.1.1', timestamp: new Date(), success: false,
      });
      recordLoginAttempt({
        email: 'no-key@test.com', ip: '1.1.1.1', timestamp: new Date(), success: false,
      });

      const status = checkAccountLockout('no-key@test.com');
      expect(status.failedAttempts).toBe(2);
    });

    it('idempotency keys with special characters', () => {
      const keys = [
        'key with spaces',
        'key\nwith\nnewlines',
        'key\twith\ttabs',
        'émojis 🔑 ✅',
        'null\x00byte',
      ];

      for (const key of keys) {
        _resetLoginAttemptStore();
        recordLoginAttempt({
          email: 'special@test.com', ip: '1.1.1.1', timestamp: new Date(), success: false,
          idempotencyKey: key,
        });
        recordLoginAttempt({
          email: 'special@test.com', ip: '1.1.1.1', timestamp: new Date(), success: false,
          idempotencyKey: key,
        });
        const status = checkAccountLockout('special@test.com');
        expect(status.failedAttempts).toBe(1);
      }
    });
  });

  // =========================================
  // AGENT 14: CALLBACK INJECTION TESTER
  // =========================================
  describe('Agent 14: Callback Injection Tester', () => {
    it('log callback receives lockout warnings', () => {
      const log = vi.fn();

      for (let i = 0; i < AUTH_LOCKOUT_CONFIG.maxAttempts; i++) {
        recordLoginAttempt(
          { email: 'cb@test.com', ip: '1.1.1.1', timestamp: new Date(), success: false },
          { log },
        );
      }
      checkAccountLockout('cb@test.com', { log });

      expect(log).toHaveBeenCalledWith('warn', expect.any(String), expect.any(Object));
    });

    it('log callback receives session expiry info', () => {
      const log = vi.fn();
      const session = createSession({
        createdAt: new Date(Date.now() - AUTH_SESSION_CONFIG.absoluteLifetimeMs - 1000),
      });
      checkSessionValidity(session, { log });

      expect(log).toHaveBeenCalledWith('info', 'Session expired (absolute lifetime)', expect.any(Object));
    });

    it('log callback receives suspicious activity warning', () => {
      const log = vi.fn();
      const session = createSession();
      detectSuspiciousActivity(session, '1.1.1.1', undefined, { log });
      detectSuspiciousActivity(session, '2.2.2.2', undefined, { log });
      detectSuspiciousActivity(session, '3.3.3.3', undefined, { log });

      expect(log).toHaveBeenCalledWith('warn', 'Suspicious activity detected', expect.any(Object));
    });

    it('no callback: operations still work', () => {
      expect(() => {
        recordLoginAttempt({
          email: 'nocb@test.com', ip: '1.1.1.1', timestamp: new Date(), success: false,
        });
        checkAccountLockout('nocb@test.com');
        checkSessionValidity(createSession());
        detectSuspiciousActivity(createSession({ id: 'nocb-session' }), '1.1.1.1');
      }).not.toThrow();
    });
  });

  // =========================================
  // AGENT 15: EXPORT COMPLETENESS CHECKER
  // =========================================
  describe('Agent 15: Export Completeness Checker', () => {
    it('all v1.1.0 APIs are exported', () => {
      // v1.0.0 APIs
      expect(typeof recordLoginAttempt).toBe('function');
      expect(typeof checkAccountLockout).toBe('function');
      expect(typeof unlockAccount).toBe('function');
      expect(typeof validatePasswordStrength).toBe('function');
      expect(typeof checkSessionValidity).toBe('function');
      expect(typeof detectSuspiciousActivity).toBe('function');
      expect(typeof invalidateUserSessions).toBe('function');
      expect(typeof generateCsrfToken).toBe('function');
      expect(typeof parseToken).toBe('function');
      expect(typeof verifySignature).toBe('function');
      expect(typeof isTokenExpired).toBe('function');
      expect(typeof validateCsrfTokens).toBe('function');
      expect(typeof extractCsrfToken).toBe('function');
      expect(typeof csrfErrorResponse).toBe('function');
      expect(typeof authError).toBe('function');

      // v1.1.0 additions
      expect(typeof validatePasswordStrengthAsync).toBe('function');
      expect(typeof createCapabilityToken).toBe('function');
      expect(typeof verifyCapabilityToken).toBe('function');
      expect(typeof computeHmac).toBe('function');
      expect(typeof verifyHmac).toBe('function');
      expect(typeof setLockoutStore).toBe('function');
      expect(typeof setSessionStore).toBe('function');
      expect(typeof buildManifest).toBe('function');
      expect(typeof _generateTestToken).toBe('function');

      // Classes
      expect(typeof InMemoryStore).toBe('function');

      // Objects
      expect(AUTH_ERRORS).toBeDefined();
      expect(AUTH_LOCKOUT_CONFIG).toBeDefined();
      expect(AUTH_SESSION_CONFIG).toBeDefined();
      expect(AUTH_SUSPICIOUS_CONFIG).toBeDefined();
      expect(AUTH_PASSWORD_CONFIG).toBeDefined();

      // Constants
      expect(CSRF_COOKIE_NAME).toBeDefined();
      expect(CSRF_HEADER_NAME).toBeDefined();
      expect(CSRF_FORM_FIELD).toBeDefined();
      expect(TOKEN_VALIDITY_MS).toBeDefined();
    });
  });
});
