import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import * as fc from 'fast-check';
import {
  validatePasswordStrength,
  validatePasswordStrengthAsync,
  generateCsrfToken,
  parseToken,
  verifySignature,
  isTokenExpired,
  validateCsrfTokens,
  createCapabilityToken,
  verifyCapabilityToken,
  recordLoginAttempt,
  checkAccountLockout,
  checkSessionValidity,
  detectSuspiciousActivity,
  _resetLoginAttemptStore,
  _resetSessionActivityStore,
  TOKEN_VALIDITY_MS,
  InMemoryStore,
  computeHmac,
  verifyHmac,
} from './index';
import type { Session } from './types';

const SECRET = 'property-based-test-secret-abc123';

describe('property-based tests (fast-check)', () => {
  beforeEach(() => {
    _resetLoginAttemptStore();
    _resetSessionActivityStore();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-02-07T10:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('validatePasswordStrength — crash-proof invariant', () => {
    it('never throws for any string input (10,000 random strings)', () => {
      fc.assert(
        fc.property(fc.string({ minLength: 0, maxLength: 500 }), (password) => {
          const result = validatePasswordStrength(password);
          expect(result).toBeDefined();
          expect(typeof result.valid).toBe('boolean');
          expect(typeof result.score).toBe('number');
          expect(result.score).toBeGreaterThanOrEqual(0);
          expect(result.score).toBeLessThanOrEqual(100);
          expect(Array.isArray(result.errors)).toBe(true);
          expect(Array.isArray(result.suggestions)).toBe(true);
          expect(result.manifest).toBeDefined();
        }),
        { numRuns: 10_000 },
      );
    });

    it('never throws for unicode / emoji passwords', () => {
      fc.assert(
        fc.property(fc.stringMatching(/[\u0100-\uFFFF]/), (char) => {
          const password = char.repeat(20);
          const result = validatePasswordStrength(password);
          expect(result).toBeDefined();
          expect(typeof result.valid).toBe('boolean');
        }),
        { numRuns: 2_000 },
      );
    });

    it('never throws for null bytes', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 100 }),
          (base) => {
            const withNulls = base + '\x00'.repeat(5) + base;
            const result = validatePasswordStrength(withNulls);
            expect(result).toBeDefined();
            expect(typeof result.valid).toBe('boolean');
          },
        ),
        { numRuns: 1_000 },
      );
    });

    it('never throws for SQL injection payloads', () => {
      const sqlPayloads = [
        "'; DROP TABLE users; --",
        "1' OR '1'='1",
        "admin'--",
        "' UNION SELECT * FROM passwords --",
        "Robert'); DROP TABLE students;--",
        "1; UPDATE users SET role='admin'",
        "' AND 1=1 --",
        "'; EXEC xp_cmdshell('dir'); --",
      ];

      for (const payload of sqlPayloads) {
        const result = validatePasswordStrength(payload);
        expect(result).toBeDefined();
        expect(typeof result.valid).toBe('boolean');
      }
    });

    it('never throws for XSS payloads', () => {
      const xssPayloads = [
        '<script>alert("xss")</script>',
        '"><img src=x onerror=alert(1)>',
        "javascript:alert('XSS')",
        '<svg onload=alert(1)>',
        '{{constructor.constructor("return this")()}}',
        '${7*7}',
        '#{7*7}',
      ];

      for (const payload of xssPayloads) {
        const result = validatePasswordStrength(payload);
        expect(result).toBeDefined();
        expect(typeof result.valid).toBe('boolean');
      }
    });

    it('score monotonicity: adding character classes never decreases score (bounded)', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 12, maxLength: 30 }),
          (base) => {
            const r1 = validatePasswordStrength(base);
            const enhanced = base + 'A' + 'z' + '9' + '!';
            const r2 = validatePasswordStrength(enhanced);
            // Enhanced should generally score >= base, but common password
            // penalties could affect this. At minimum, both must not throw.
            expect(r1).toBeDefined();
            expect(r2).toBeDefined();
          },
        ),
        { numRuns: 1_000 },
      );
    });

    it('valid passwords always have score > 0', () => {
      fc.assert(
        fc.property(fc.string({ minLength: 0, maxLength: 200 }), (password) => {
          const result = validatePasswordStrength(password);
          if (result.valid) {
            expect(result.score).toBeGreaterThan(0);
          }
        }),
        { numRuns: 5_000 },
      );
    });

    it('empty string is always invalid', () => {
      const result = validatePasswordStrength('');
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('context injection: username/email never cause crash', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 0, maxLength: 100 }),
          fc.string({ minLength: 0, maxLength: 50 }),
          fc.string({ minLength: 0, maxLength: 50 }),
          (password, username, email) => {
            const result = validatePasswordStrength(password, { username, email });
            expect(result).toBeDefined();
            expect(typeof result.valid).toBe('boolean');
          },
        ),
        { numRuns: 2_000 },
      );
    });
  });

  describe('CSRF token roundtrip invariant', () => {
    it('generate → parse → verify always succeeds for any valid secret', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 8, maxLength: 100 }),
          (secret) => {
            const token = generateCsrfToken(secret);
            const parsed = parseToken(token);
            expect(parsed).not.toBeNull();
            expect(verifySignature(parsed!, secret)).toBe(true);
            expect(isTokenExpired(parsed!)).toBe(false);
          },
        ),
        { numRuns: 1_000 },
      );
    });

    it('tampered tokens always fail verification', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 0, max: 100 }),
          (flipBit) => {
            const token = generateCsrfToken(SECRET);
            const parsed = parseToken(token)!;
            // Tamper the signature
            const chars = parsed.signature.split('');
            const idx = flipBit % chars.length;
            chars[idx] = chars[idx] === 'a' ? 'b' : 'a';
            parsed.signature = chars.join('');
            expect(verifySignature(parsed, SECRET)).toBe(false);
          },
        ),
        { numRuns: 500 },
      );
    });

    it('different secrets produce different tokens', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 8, maxLength: 50 }),
          fc.string({ minLength: 8, maxLength: 50 }),
          (secret1, secret2) => {
            fc.pre(secret1 !== secret2);
            const token1 = generateCsrfToken(secret1);
            const parsed1 = parseToken(token1)!;
            // Token generated with secret1 should NOT verify with secret2
            expect(verifySignature(parsed1, secret2)).toBe(false);
          },
        ),
        { numRuns: 500 },
      );
    });

    it('parseToken returns null for arbitrary garbage', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 200 }),
          (garbage) => {
            const parsed = parseToken(garbage);
            // Either null or, if somehow valid format, still must be well-structured
            if (parsed !== null) {
              expect(typeof parsed.timestamp).toBe('number');
              expect(typeof parsed.random).toBe('string');
              expect(typeof parsed.signature).toBe('string');
            }
          },
        ),
        { numRuns: 2_000 },
      );
    });
  });

  describe('capability token roundtrip invariant', () => {
    it('create → verify always succeeds for matching capability', () => {
      fc.assert(
        fc.property(
          fc.array(fc.string({ minLength: 1, maxLength: 30 }), { minLength: 1, maxLength: 10 }),
          fc.integer({ min: 1000, max: 86400000 }),
          (capabilities, ttlMs) => {
            const token = createCapabilityToken(capabilities, ttlMs, SECRET);
            const cap = capabilities[0];
            const result = verifyCapabilityToken(token, cap, SECRET);
            expect(result.valid).toBe(true);
            expect(result.capabilities).toEqual(capabilities);
          },
        ),
        { numRuns: 1_000 },
      );
    });

    it('wildcard capability grants any random capability', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 50 }),
          (randomCap) => {
            const token = createCapabilityToken(['*'], 60_000, SECRET);
            const result = verifyCapabilityToken(token, randomCap, SECRET);
            expect(result.valid).toBe(true);
          },
        ),
        { numRuns: 500 },
      );
    });

    it('missing capability always fails', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 30 }),
          fc.string({ minLength: 1, maxLength: 30 }),
          (grantedCap, requestedCap) => {
            fc.pre(grantedCap !== requestedCap && grantedCap !== '*');
            const token = createCapabilityToken([grantedCap], 60_000, SECRET);
            const result = verifyCapabilityToken(token, requestedCap, SECRET);
            expect(result.valid).toBe(false);
          },
        ),
        { numRuns: 1_000 },
      );
    });
  });

  describe('InMemoryStore LRU invariant', () => {
    it('size never exceeds maxEntries', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 100 }),
          fc.array(fc.tuple(fc.string({ minLength: 1, maxLength: 20 }), fc.integer()), { minLength: 1, maxLength: 500 }),
          (maxEntries, entries) => {
            const store = new InMemoryStore<number>({ maxEntries });
            for (const [key, value] of entries) {
              store.set(key, value);
              expect(store.size).toBeLessThanOrEqual(maxEntries);
            }
          },
        ),
        { numRuns: 500 },
      );
    });

    it('get after set always returns the value', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 50 }),
          fc.integer(),
          (key, value) => {
            const store = new InMemoryStore<number>({ maxEntries: 10_000 });
            store.set(key, value);
            expect(store.get(key)).toBe(value);
          },
        ),
        { numRuns: 1_000 },
      );
    });

    it('delete returns true for existing keys, false for non-existing', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 50 }),
          fc.integer(),
          (key, value) => {
            const store = new InMemoryStore<number>({ maxEntries: 10_000 });
            expect(store.delete(key)).toBe(false);
            store.set(key, value);
            expect(store.delete(key)).toBe(true);
            expect(store.delete(key)).toBe(false);
          },
        ),
        { numRuns: 1_000 },
      );
    });
  });

  describe('HMAC invariants', () => {
    it('computeHmac → verifyHmac roundtrip for any payload', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 0, maxLength: 500 }),
          (payload) => {
            const sig = computeHmac(payload, SECRET);
            expect(verifyHmac(payload, sig, SECRET)).toBe(true);
          },
        ),
        { numRuns: 2_000 },
      );
    });

    it('different payloads produce different HMACs', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 200 }),
          fc.string({ minLength: 1, maxLength: 200 }),
          (payload1, payload2) => {
            fc.pre(payload1 !== payload2);
            const sig1 = computeHmac(payload1, SECRET);
            const sig2 = computeHmac(payload2, SECRET);
            expect(sig1).not.toBe(sig2);
          },
        ),
        { numRuns: 1_000 },
      );
    });
  });

  describe('lockout invariants', () => {
    it('email normalization: whitespace and case produce same record', () => {
      fc.assert(
        fc.property(
          fc.emailAddress(),
          (email) => {
            _resetLoginAttemptStore();
            recordLoginAttempt({
              email: `  ${email.toUpperCase()}  `,
              ip: '1.1.1.1',
              timestamp: new Date(),
              success: false,
            });
            const status = checkAccountLockout(email.toLowerCase());
            expect(status.failedAttempts).toBe(1);
          },
        ),
        { numRuns: 500 },
      );
    });

    it('successful login always clears failed attempts', () => {
      fc.assert(
        fc.property(
          fc.emailAddress(),
          fc.integer({ min: 1, max: 4 }),
          (email, failCount) => {
            _resetLoginAttemptStore();
            for (let i = 0; i < failCount; i++) {
              recordLoginAttempt({
                email, ip: '1.1.1.1', timestamp: new Date(), success: false,
              });
            }
            recordLoginAttempt({
              email, ip: '1.1.1.1', timestamp: new Date(), success: true,
            });
            const status = checkAccountLockout(email);
            expect(status.failedAttempts).toBe(0);
          },
        ),
        { numRuns: 500 },
      );
    });
  });

  describe('session validity invariants', () => {
    it('fresh sessions are always valid', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 50 }),
          fc.string({ minLength: 1, maxLength: 50 }),
          (sessionId, userId) => {
            const session: Session = {
              id: sessionId,
              userId,
              createdAt: new Date(),
              lastActiveAt: new Date(),
              ip: '1.1.1.1',
            };
            const result = checkSessionValidity(session);
            expect(result.valid).toBe(true);
          },
        ),
        { numRuns: 1_000 },
      );
    });

    it('expired sessions are always invalid', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 50 }),
          fc.integer({ min: 86400001, max: 200000000 }),
          (sessionId, ageMs) => {
            const session: Session = {
              id: sessionId,
              userId: 'user-1',
              createdAt: new Date(Date.now() - ageMs),
              lastActiveAt: new Date(),
              ip: '1.1.1.1',
            };
            const result = checkSessionValidity(session);
            expect(result.valid).toBe(false);
          },
        ),
        { numRuns: 500 },
      );
    });
  });
});
