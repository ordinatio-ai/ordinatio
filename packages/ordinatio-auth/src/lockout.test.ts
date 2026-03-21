import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  recordLoginAttempt,
  checkAccountLockout,
  unlockAccount,
  AUTH_LOCKOUT_CONFIG,
  _resetLoginAttemptStore,
  _getLoginAttempts,
} from './lockout';
import type { LoginAttempt } from './types';

describe('lockout', () => {
  beforeEach(() => {
    _resetLoginAttemptStore();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-02-07T10:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('recordLoginAttempt', () => {
    it('records a successful login attempt', () => {
      const attempt: LoginAttempt = {
        email: 'user@example.com',
        ip: '192.168.1.1',
        timestamp: new Date(),
        success: true,
      };

      recordLoginAttempt(attempt);

      const attempts = _getLoginAttempts('user@example.com');
      expect(attempts).toHaveLength(1);
      expect(attempts[0].success).toBe(true);
    });

    it('records a failed login attempt', () => {
      const attempt: LoginAttempt = {
        email: 'user@example.com',
        ip: '192.168.1.1',
        timestamp: new Date(),
        success: false,
        userAgent: 'Mozilla/5.0',
      };

      recordLoginAttempt(attempt);

      const attempts = _getLoginAttempts('user@example.com');
      expect(attempts).toHaveLength(1);
      expect(attempts[0].success).toBe(false);
    });

    it('normalizes email to lowercase', () => {
      recordLoginAttempt({
        email: 'USER@EXAMPLE.COM',
        ip: '192.168.1.1',
        timestamp: new Date(),
        success: false,
      });

      const attempts = _getLoginAttempts('user@example.com');
      expect(attempts).toHaveLength(1);
    });

    it('clears failed attempts on successful login', () => {
      for (let i = 0; i < 3; i++) {
        recordLoginAttempt({
          email: 'user@example.com',
          ip: '192.168.1.1',
          timestamp: new Date(),
          success: false,
        });
      }

      expect(_getLoginAttempts('user@example.com').filter(a => !a.success)).toHaveLength(3);

      recordLoginAttempt({
        email: 'user@example.com',
        ip: '192.168.1.1',
        timestamp: new Date(),
        success: true,
      });

      const attempts = _getLoginAttempts('user@example.com');
      expect(attempts.filter(a => !a.success)).toHaveLength(0);
      expect(attempts.filter(a => a.success)).toHaveLength(1);
    });

    it('invokes log callback on failed attempt', () => {
      const log = vi.fn();
      recordLoginAttempt(
        { email: 'user@example.com', ip: '1.2.3.4', timestamp: new Date(), success: false },
        { log },
      );
      expect(log).toHaveBeenCalledWith('warn', 'Failed login attempt', expect.objectContaining({ email: 'user@example.com' }));
    });

    it('invokes log callback on successful attempt', () => {
      const log = vi.fn();
      recordLoginAttempt(
        { email: 'user@example.com', ip: '1.2.3.4', timestamp: new Date(), success: true },
        { log },
      );
      expect(log).toHaveBeenCalledWith('info', 'Successful login', expect.objectContaining({ email: 'user@example.com' }));
    });
  });

  describe('checkAccountLockout', () => {
    it('returns unlocked for new account', () => {
      const status = checkAccountLockout('newuser@example.com');
      expect(status.locked).toBe(false);
      expect(status.failedAttempts).toBe(0);
      expect(status.lockoutLevel).toBe(0);
    });

    it('returns unlocked with failed attempt count', () => {
      for (let i = 0; i < 3; i++) {
        recordLoginAttempt({
          email: 'user@example.com',
          ip: '192.168.1.1',
          timestamp: new Date(),
          success: false,
        });
      }

      const status = checkAccountLockout('user@example.com');
      expect(status.locked).toBe(false);
      expect(status.failedAttempts).toBe(3);
      expect(status.lockoutLevel).toBe(0);
    });

    it('locks account after 5 failed attempts', () => {
      for (let i = 0; i < AUTH_LOCKOUT_CONFIG.maxAttempts; i++) {
        recordLoginAttempt({
          email: 'user@example.com',
          ip: '192.168.1.1',
          timestamp: new Date(),
          success: false,
        });
      }

      const status = checkAccountLockout('user@example.com');
      expect(status.locked).toBe(true);
      expect(status.lockoutLevel).toBe(1);
      expect(status.unlockAt).toBeDefined();
      expect(status.reason).toContain('Too many failed login attempts');
    });

    it('applies exponential backoff for repeated lockouts', () => {
      // First lockout (5 min)
      for (let i = 0; i < AUTH_LOCKOUT_CONFIG.maxAttempts; i++) {
        recordLoginAttempt({ email: 'user@example.com', ip: '192.168.1.1', timestamp: new Date(), success: false });
      }
      let status = checkAccountLockout('user@example.com');
      expect(status.lockoutLevel).toBe(1);

      // Wait for lockout to expire
      vi.advanceTimersByTime(AUTH_LOCKOUT_CONFIG.lockoutDurationsMs[0] + 1000);

      // Second lockout (15 min)
      for (let i = 0; i < AUTH_LOCKOUT_CONFIG.maxAttempts; i++) {
        recordLoginAttempt({ email: 'user@example.com', ip: '192.168.1.1', timestamp: new Date(), success: false });
      }
      status = checkAccountLockout('user@example.com');
      expect(status.lockoutLevel).toBe(2);

      // Third lockout (1 hour)
      vi.advanceTimersByTime(AUTH_LOCKOUT_CONFIG.lockoutDurationsMs[1] + 1000);
      for (let i = 0; i < AUTH_LOCKOUT_CONFIG.maxAttempts; i++) {
        recordLoginAttempt({ email: 'user@example.com', ip: '192.168.1.1', timestamp: new Date(), success: false });
      }
      status = checkAccountLockout('user@example.com');
      expect(status.lockoutLevel).toBe(3);

      // Fourth lockout (24 hours - max)
      vi.advanceTimersByTime(AUTH_LOCKOUT_CONFIG.lockoutDurationsMs[2] + 1000);
      for (let i = 0; i < AUTH_LOCKOUT_CONFIG.maxAttempts; i++) {
        recordLoginAttempt({ email: 'user@example.com', ip: '192.168.1.1', timestamp: new Date(), success: false });
      }
      status = checkAccountLockout('user@example.com');
      expect(status.lockoutLevel).toBe(4);

      // Fifth lockout stays at level 4
      vi.advanceTimersByTime(AUTH_LOCKOUT_CONFIG.lockoutDurationsMs[3] + 1000);
      for (let i = 0; i < AUTH_LOCKOUT_CONFIG.maxAttempts; i++) {
        recordLoginAttempt({ email: 'user@example.com', ip: '192.168.1.1', timestamp: new Date(), success: false });
      }
      status = checkAccountLockout('user@example.com');
      expect(status.lockoutLevel).toBe(4);
    });

    it('unlocks after lockout duration expires', () => {
      for (let i = 0; i < AUTH_LOCKOUT_CONFIG.maxAttempts; i++) {
        recordLoginAttempt({ email: 'user@example.com', ip: '192.168.1.1', timestamp: new Date(), success: false });
      }
      let status = checkAccountLockout('user@example.com');
      expect(status.locked).toBe(true);

      vi.advanceTimersByTime(AUTH_LOCKOUT_CONFIG.attemptWindowMs + 1000);
      status = checkAccountLockout('user@example.com');
      expect(status.locked).toBe(false);
    });

    it('only counts attempts within the window', () => {
      for (let i = 0; i < 3; i++) {
        recordLoginAttempt({ email: 'user@example.com', ip: '192.168.1.1', timestamp: new Date(), success: false });
      }

      vi.advanceTimersByTime(AUTH_LOCKOUT_CONFIG.attemptWindowMs + 1000);

      for (let i = 0; i < 2; i++) {
        recordLoginAttempt({ email: 'user@example.com', ip: '192.168.1.1', timestamp: new Date(), success: false });
      }

      const status = checkAccountLockout('user@example.com');
      expect(status.locked).toBe(false);
      expect(status.failedAttempts).toBe(2);
    });
  });

  describe('idempotency keys', () => {
    it('skips duplicate attempts with same idempotency key', () => {
      recordLoginAttempt({
        email: 'user@example.com',
        ip: '192.168.1.1',
        timestamp: new Date(),
        success: false,
        idempotencyKey: 'key-1',
      });
      recordLoginAttempt({
        email: 'user@example.com',
        ip: '192.168.1.1',
        timestamp: new Date(),
        success: false,
        idempotencyKey: 'key-1',
      });

      const attempts = _getLoginAttempts('user@example.com');
      expect(attempts).toHaveLength(1);
    });

    it('records attempts with different idempotency keys', () => {
      recordLoginAttempt({
        email: 'user@example.com',
        ip: '192.168.1.1',
        timestamp: new Date(),
        success: false,
        idempotencyKey: 'key-1',
      });
      recordLoginAttempt({
        email: 'user@example.com',
        ip: '192.168.1.1',
        timestamp: new Date(),
        success: false,
        idempotencyKey: 'key-2',
      });

      const attempts = _getLoginAttempts('user@example.com');
      expect(attempts).toHaveLength(2);
    });

    it('records attempts without idempotency key normally', () => {
      recordLoginAttempt({
        email: 'user@example.com',
        ip: '192.168.1.1',
        timestamp: new Date(),
        success: false,
      });
      recordLoginAttempt({
        email: 'user@example.com',
        ip: '192.168.1.1',
        timestamp: new Date(),
        success: false,
      });

      const attempts = _getLoginAttempts('user@example.com');
      expect(attempts).toHaveLength(2);
    });

    it('logs debug when duplicate key is skipped', () => {
      const log = vi.fn();
      recordLoginAttempt({
        email: 'user@example.com',
        ip: '192.168.1.1',
        timestamp: new Date(),
        success: false,
        idempotencyKey: 'dup-key',
      }, { log });

      recordLoginAttempt({
        email: 'user@example.com',
        ip: '192.168.1.1',
        timestamp: new Date(),
        success: false,
        idempotencyKey: 'dup-key',
      }, { log });

      expect(log).toHaveBeenCalledWith('debug', expect.stringContaining('idempotency'), expect.any(Object));
    });

    it('idempotency store is cleared by _resetLoginAttemptStore', () => {
      recordLoginAttempt({
        email: 'user@example.com',
        ip: '192.168.1.1',
        timestamp: new Date(),
        success: false,
        idempotencyKey: 'key-1',
      });

      _resetLoginAttemptStore();

      // After reset, the same key should work again
      recordLoginAttempt({
        email: 'user@example.com',
        ip: '192.168.1.1',
        timestamp: new Date(),
        success: false,
        idempotencyKey: 'key-1',
      });

      const attempts = _getLoginAttempts('user@example.com');
      expect(attempts).toHaveLength(1);
    });

    it('mixed idempotent and non-idempotent attempts', () => {
      recordLoginAttempt({
        email: 'user@example.com',
        ip: '192.168.1.1',
        timestamp: new Date(),
        success: false,
        idempotencyKey: 'key-1',
      });
      recordLoginAttempt({
        email: 'user@example.com',
        ip: '192.168.1.1',
        timestamp: new Date(),
        success: false,
      });
      recordLoginAttempt({
        email: 'user@example.com',
        ip: '192.168.1.1',
        timestamp: new Date(),
        success: false,
        idempotencyKey: 'key-1', // Duplicate — skipped
      });

      const attempts = _getLoginAttempts('user@example.com');
      expect(attempts).toHaveLength(2);
    });
  });

  describe('manifests', () => {
    it('returns ALLOW manifest for new account', () => {
      const status = checkAccountLockout('newuser@example.com');
      expect(status.manifest).toBeDefined();
      expect(status.manifest!.suggestedAction).toBe('ALLOW');
      expect(status.manifest!.confidence).toBe(1.0);
    });

    it('returns ALLOW manifest with reduced confidence for failed attempts', () => {
      for (let i = 0; i < 3; i++) {
        recordLoginAttempt({
          email: 'user@example.com',
          ip: '192.168.1.1',
          timestamp: new Date(),
          success: false,
        });
      }
      const status = checkAccountLockout('user@example.com');
      expect(status.manifest!.suggestedAction).toBe('ALLOW');
      expect(status.manifest!.confidence).toBe(0.8);
    });

    it('returns RETRY_WITH_BACKOFF manifest for low lockout levels', () => {
      for (let i = 0; i < AUTH_LOCKOUT_CONFIG.maxAttempts; i++) {
        recordLoginAttempt({
          email: 'user@example.com',
          ip: '192.168.1.1',
          timestamp: new Date(),
          success: false,
        });
      }
      const status = checkAccountLockout('user@example.com');
      expect(status.manifest!.suggestedAction).toBe('RETRY_WITH_BACKOFF');
      expect(status.manifest!.requiresHumanReview).toBe(false);
    });

    it('returns BLOCK_AND_NOTIFY_ADMIN manifest for high lockout levels', () => {
      // Get to level 3
      for (let level = 0; level < 3; level++) {
        for (let i = 0; i < AUTH_LOCKOUT_CONFIG.maxAttempts; i++) {
          recordLoginAttempt({
            email: 'user@example.com',
            ip: '192.168.1.1',
            timestamp: new Date(),
            success: false,
          });
        }
        checkAccountLockout('user@example.com');
        vi.advanceTimersByTime(AUTH_LOCKOUT_CONFIG.lockoutDurationsMs[level] + 1000);
      }

      for (let i = 0; i < AUTH_LOCKOUT_CONFIG.maxAttempts; i++) {
        recordLoginAttempt({
          email: 'user@example.com',
          ip: '192.168.1.1',
          timestamp: new Date(),
          success: false,
        });
      }
      const status = checkAccountLockout('user@example.com');
      expect(status.manifest!.suggestedAction).toBe('BLOCK_AND_NOTIFY_ADMIN');
      expect(status.manifest!.requiresHumanReview).toBe(true);
    });
  });

  describe('unlockAccount', () => {
    it('unlocks a locked account', () => {
      for (let i = 0; i < AUTH_LOCKOUT_CONFIG.maxAttempts; i++) {
        recordLoginAttempt({ email: 'user@example.com', ip: '192.168.1.1', timestamp: new Date(), success: false });
      }
      let status = checkAccountLockout('user@example.com');
      expect(status.locked).toBe(true);

      vi.advanceTimersByTime(AUTH_LOCKOUT_CONFIG.attemptWindowMs + 1000);
      unlockAccount('user@example.com');
      status = checkAccountLockout('user@example.com');
      expect(status.locked).toBe(false);
      expect(status.lockoutLevel).toBe(1); // Level preserved
    });

    it('resets lockout level when requested', () => {
      for (let level = 0; level < 3; level++) {
        for (let i = 0; i < AUTH_LOCKOUT_CONFIG.maxAttempts; i++) {
          recordLoginAttempt({ email: 'user@example.com', ip: '192.168.1.1', timestamp: new Date(), success: false });
        }
        checkAccountLockout('user@example.com');
        vi.advanceTimersByTime(AUTH_LOCKOUT_CONFIG.lockoutDurationsMs[level] + 1000);
      }

      unlockAccount('user@example.com', true);
      const status = checkAccountLockout('user@example.com');
      expect(status.lockoutLevel).toBe(0);
    });

    it('handles unlocking non-existent account', () => {
      expect(() => unlockAccount('nonexistent@example.com')).not.toThrow();
    });
  });
});
