import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  recordLoginAttempt,
  checkAccountLockout,
  _resetLoginAttemptStore,
  _resetSessionActivityStore,
  _getLoginAttempts,
  detectSuspiciousActivity,
  checkSessionValidity,
  generateCsrfToken,
  validateCsrfTokens,
  createCapabilityToken,
  verifyCapabilityToken,
  validatePasswordStrength,
  validatePasswordStrengthAsync,
  AUTH_LOCKOUT_CONFIG,
  InMemoryStore,
} from './index';
import type { Session } from './types';

const SECRET = 'concurrency-test-secret-abc';

describe('high-concurrency & race condition tests', () => {
  beforeEach(() => {
    _resetLoginAttemptStore();
    _resetSessionActivityStore();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-02-07T10:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('idempotency under concurrent fire', () => {
    it('500 simultaneous login attempts with same idempotency key record only 1', async () => {
      const KEY = 'concurrent-idem-key-001';

      const promises = Array.from({ length: 500 }, () =>
        Promise.resolve().then(() => {
          recordLoginAttempt({
            email: 'concurrent@test.com',
            ip: '1.1.1.1',
            timestamp: new Date(),
            success: false,
            idempotencyKey: KEY,
          });
        }),
      );

      await Promise.all(promises);

      const status = checkAccountLockout('concurrent@test.com');
      expect(status.failedAttempts).toBe(1);
    });

    it('500 simultaneous attempts with unique keys all record', async () => {
      const promises = Array.from({ length: 500 }, (_, i) =>
        Promise.resolve().then(() => {
          recordLoginAttempt({
            email: 'unique@test.com',
            ip: '1.1.1.1',
            timestamp: new Date(),
            success: false,
            idempotencyKey: `unique-key-${i}`,
          });
        }),
      );

      await Promise.all(promises);

      const attempts = _getLoginAttempts('unique@test.com');
      expect(attempts.length).toBe(500);
    });

    it('mixed idempotent and non-idempotent attempts', async () => {
      const promises: Promise<void>[] = [];

      // 100 with same key
      for (let i = 0; i < 100; i++) {
        promises.push(
          Promise.resolve().then(() => {
            recordLoginAttempt({
              email: 'mixed@test.com',
              ip: '1.1.1.1',
              timestamp: new Date(),
              success: false,
              idempotencyKey: 'shared-key',
            });
          }),
        );
      }

      // 50 with no key
      for (let i = 0; i < 50; i++) {
        promises.push(
          Promise.resolve().then(() => {
            recordLoginAttempt({
              email: 'mixed@test.com',
              ip: '1.1.1.1',
              timestamp: new Date(),
              success: false,
            });
          }),
        );
      }

      await Promise.all(promises);

      const attempts = _getLoginAttempts('mixed@test.com');
      // 1 from shared key + 50 without key = 51
      expect(attempts.length).toBe(51);
    });
  });

  describe('concurrent lockout checks', () => {
    it('200 concurrent lockout checks return consistent state', async () => {
      // Record 4 failed attempts (just below lockout threshold)
      for (let i = 0; i < AUTH_LOCKOUT_CONFIG.maxAttempts - 1; i++) {
        recordLoginAttempt({
          email: 'edge@test.com',
          ip: '1.1.1.1',
          timestamp: new Date(),
          success: false,
        });
      }

      const results = await Promise.all(
        Array.from({ length: 200 }, () =>
          Promise.resolve().then(() => checkAccountLockout('edge@test.com')),
        ),
      );

      // All should have the same state
      const lockedCount = results.filter(r => r.locked).length;
      const unlockedCount = results.filter(r => !r.locked).length;
      // Either all locked or all unlocked (no mixed state)
      expect(lockedCount === 0 || unlockedCount === 0).toBe(true);
    });

    it('concurrent lockout checks dont corrupt failed attempt count', async () => {
      for (let i = 0; i < 3; i++) {
        recordLoginAttempt({
          email: 'count@test.com',
          ip: '1.1.1.1',
          timestamp: new Date(),
          success: false,
        });
      }

      const results = await Promise.all(
        Array.from({ length: 100 }, () =>
          Promise.resolve().then(() => checkAccountLockout('count@test.com')),
        ),
      );

      // All should report 3 failed attempts
      for (const result of results) {
        expect(result.failedAttempts).toBe(3);
      }
    });
  });

  describe('concurrent suspicious activity detection', () => {
    it('100 concurrent detections from different IPs', async () => {
      const session: Session = {
        id: 'concurrent-session',
        userId: 'user-1',
        createdAt: new Date(),
        lastActiveAt: new Date(),
        ip: '1.1.1.1',
      };

      const results = await Promise.all(
        Array.from({ length: 100 }, (_, i) =>
          Promise.resolve().then(() =>
            detectSuspiciousActivity(session, `10.0.0.${i % 256}`),
          ),
        ),
      );

      // All should have completed without error
      expect(results.length).toBe(100);
      for (const result of results) {
        expect(typeof result.suspicious).toBe('boolean');
        expect(result.manifest).toBeDefined();
      }
    });

    it('concurrent activity + validity checks dont interfere', async () => {
      const session: Session = {
        id: 'mixed-concurrent',
        userId: 'user-2',
        createdAt: new Date(),
        lastActiveAt: new Date(),
        ip: '1.1.1.1',
      };

      const promises = [
        ...Array.from({ length: 50 }, () =>
          Promise.resolve().then(() => detectSuspiciousActivity(session, '1.1.1.1')),
        ),
        ...Array.from({ length: 50 }, () =>
          Promise.resolve().then(() => checkSessionValidity(session)),
        ),
      ];

      const results = await Promise.all(promises);
      expect(results.length).toBe(100);
    });
  });

  describe('concurrent CSRF operations', () => {
    it('100 concurrent token generations produce unique tokens', async () => {
      const tokens = await Promise.all(
        Array.from({ length: 100 }, () =>
          Promise.resolve().then(() => generateCsrfToken(SECRET)),
        ),
      );

      const uniqueTokens = new Set(tokens);
      expect(uniqueTokens.size).toBe(100);
    });

    it('100 concurrent validations of same token all succeed', async () => {
      const token = generateCsrfToken(SECRET);

      const results = await Promise.all(
        Array.from({ length: 100 }, () =>
          Promise.resolve().then(() => validateCsrfTokens(token, token, SECRET)),
        ),
      );

      for (const result of results) {
        expect(result.valid).toBe(true);
      }
    });
  });

  describe('concurrent capability token operations', () => {
    it('100 concurrent token verifications of same token', async () => {
      const token = createCapabilityToken(['read', 'write'], 60_000, SECRET);

      const results = await Promise.all(
        Array.from({ length: 100 }, () =>
          Promise.resolve().then(() => verifyCapabilityToken(token, 'read', SECRET)),
        ),
      );

      for (const result of results) {
        expect(result.valid).toBe(true);
      }
    });

    it('mixed create + verify doesnt corrupt state', async () => {
      const promises = Array.from({ length: 100 }, (_, i) =>
        Promise.resolve().then(() => {
          const token = createCapabilityToken([`cap-${i}`], 60_000, SECRET);
          return verifyCapabilityToken(token, `cap-${i}`, SECRET);
        }),
      );

      const results = await Promise.all(promises);
      for (const result of results) {
        expect(result.valid).toBe(true);
      }
    });
  });

  describe('concurrent password validation', () => {
    it('200 concurrent password validations dont interfere', async () => {
      const passwords = [
        'weak', 'ValidPass1!abcdef', 'Xk9$mNpQ2vWz!a', '123456', 'Password1!abcd',
      ];

      const results = await Promise.all(
        Array.from({ length: 200 }, (_, i) =>
          Promise.resolve().then(() => validatePasswordStrength(passwords[i % passwords.length])),
        ),
      );

      expect(results.length).toBe(200);
      for (const result of results) {
        expect(typeof result.valid).toBe('boolean');
        expect(typeof result.score).toBe('number');
      }
    });

    it('100 concurrent async password validations with breach check', async () => {
      let callCount = 0;
      const results = await Promise.all(
        Array.from({ length: 100 }, () =>
          validatePasswordStrengthAsync('Xk9$mNpQ2vWz!a', undefined, {
            checkBreached: async () => {
              callCount++;
              return false;
            },
          }),
        ),
      );

      expect(results.length).toBe(100);
      expect(callCount).toBe(100);
      for (const result of results) {
        expect(result.valid).toBe(true);
      }
    });
  });

  describe('InMemoryStore under concurrent access', () => {
    it('1000 concurrent sets dont exceed maxEntries', async () => {
      const store = new InMemoryStore<number>({ maxEntries: 100 });

      await Promise.all(
        Array.from({ length: 1000 }, (_, i) =>
          Promise.resolve().then(() => store.set(`key-${i}`, i)),
        ),
      );

      expect(store.size).toBeLessThanOrEqual(100);
    });

    it('concurrent get + set doesnt lose data for existing keys', async () => {
      const store = new InMemoryStore<number>({ maxEntries: 10_000 });
      store.set('shared', 42);

      await Promise.all(
        Array.from({ length: 100 }, () =>
          Promise.resolve().then(() => {
            const val = store.get('shared');
            expect(val).toBe(42);
          }),
        ),
      );
    });

    it('concurrent set + delete + has returns consistent state', async () => {
      const store = new InMemoryStore<string>({ maxEntries: 10_000 });

      // Pre-populate
      for (let i = 0; i < 50; i++) {
        store.set(`k-${i}`, `v-${i}`);
      }

      await Promise.all([
        // Delete half
        ...Array.from({ length: 25 }, (_, i) =>
          Promise.resolve().then(() => store.delete(`k-${i}`)),
        ),
        // Check half
        ...Array.from({ length: 25 }, (_, i) =>
          Promise.resolve().then(() => {
            // This might be true or false depending on race
            const exists = store.has(`k-${i + 25}`);
            expect(typeof exists).toBe('boolean');
          }),
        ),
      ]);

      // Store should not be corrupted
      expect(store.size).toBeLessThanOrEqual(50);
    });
  });

  describe('multi-user concurrent lockouts', () => {
    it('100 different users fail simultaneously without cross-contamination', async () => {
      await Promise.all(
        Array.from({ length: 100 }, (_, i) =>
          Promise.resolve().then(() => {
            recordLoginAttempt({
              email: `user-${i}@test.com`,
              ip: '1.1.1.1',
              timestamp: new Date(),
              success: false,
            });
          }),
        ),
      );

      // Each user should have exactly 1 failed attempt
      for (let i = 0; i < 100; i++) {
        const status = checkAccountLockout(`user-${i}@test.com`);
        expect(status.failedAttempts).toBe(1);
        expect(status.locked).toBe(false);
      }
    });
  });
});
