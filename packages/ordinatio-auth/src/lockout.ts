// ===========================================
// @ordinatio/auth — Login Attempt Tracking & Account Lockout
// ===========================================
// Brute-force protection with exponential backoff.
// In-memory storage (replace with Redis in production).
// ===========================================

import type { AuthCallbacks, LoginAttempt, AccountLockoutStatus } from './types';
import { buildManifest } from './manifest';
import { InMemoryStore } from './store';
import type { SecurityStore } from './store';

// ===========================================
// CONFIGURATION CONSTANTS
// ===========================================

export const AUTH_LOCKOUT_CONFIG = {
  /** Number of failed attempts before lockout */
  maxAttempts: 5,
  /** Window for counting failed attempts (15 minutes) */
  attemptWindowMs: 15 * 60 * 1000,
  /** Lockout durations by level (exponential backoff) */
  lockoutDurationsMs: [
    5 * 60 * 1000,      // Level 1: 5 minutes
    15 * 60 * 1000,     // Level 2: 15 minutes
    60 * 60 * 1000,     // Level 3: 1 hour
    24 * 60 * 60 * 1000 // Level 4: 24 hours
  ],
  /** Maximum lockout level */
  maxLockoutLevel: 4,
  /** Time after which lockout level resets to 0 (7 days) */
  levelResetMs: 7 * 24 * 60 * 60 * 1000,
  /** Maximum entries in the lockout store before LRU eviction */
  maxStoreEntries: 10_000,
} as const;

// ===========================================
// PLUGGABLE STORES
// ===========================================

interface LoginAttemptRecord {
  attempts: LoginAttempt[];
  lockoutLevel: number;
  lockoutUntil?: Date;
  lastLockoutAt?: Date;
}

// Store: email -> login attempt record
let loginAttemptStore: SecurityStore<LoginAttemptRecord> = new InMemoryStore<LoginAttemptRecord>({
  maxEntries: AUTH_LOCKOUT_CONFIG.maxStoreEntries,
});

// Idempotency store: key -> true (seen)
let idempotencyStore: SecurityStore<boolean> = new InMemoryStore<boolean>({
  maxEntries: 100_000,
});

/**
 * Inject a custom store for login attempt tracking.
 * Use this to replace the default InMemoryStore with Redis, etc.
 */
export function setLockoutStore(store: SecurityStore<LoginAttemptRecord>): void {
  loginAttemptStore = store;
}

// Cleanup interval
let loginCleanupInterval: NodeJS.Timeout | null = null;

function startLoginCleanup() {
  if (loginCleanupInterval) return;
  loginCleanupInterval = setInterval(() => {
    const now = Date.now();
    const config = AUTH_LOCKOUT_CONFIG;

    const toDelete: string[] = [];
    for (const [email, record] of loginAttemptStore.entries()) {
      // Remove old attempts
      record.attempts = record.attempts.filter(
        a => now - a.timestamp.getTime() < config.attemptWindowMs
      );

      // Reset lockout level if no lockout recently
      if (record.lastLockoutAt &&
          now - record.lastLockoutAt.getTime() > config.levelResetMs) {
        record.lockoutLevel = 0;
      }

      // Mark empty records for deletion
      if (record.attempts.length === 0 && !record.lockoutUntil) {
        toDelete.push(email);
      }
    }

    for (const email of toDelete) {
      loginAttemptStore.delete(email);
    }
  }, 5 * 60 * 1000); // Every 5 minutes
  loginCleanupInterval.unref?.();
}

// ===========================================
// LOGIN ATTEMPT TRACKING
// ===========================================

/**
 * Record a login attempt for tracking purposes.
 * Call this after every login attempt, successful or not.
 */
export function recordLoginAttempt(attempt: LoginAttempt, callbacks?: AuthCallbacks): void {
  startLoginCleanup();

  // Idempotency: skip duplicate attempts
  if (attempt.idempotencyKey) {
    if (idempotencyStore.has(attempt.idempotencyKey)) {
      callbacks?.log?.('debug', 'Duplicate login attempt skipped (idempotency key)', {
        idempotencyKey: attempt.idempotencyKey,
        email: attempt.email,
      });
      return;
    }
    idempotencyStore.set(attempt.idempotencyKey, true);
  }

  const normalizedEmail = attempt.email.toLowerCase().trim();
  let record = loginAttemptStore.get(normalizedEmail);

  if (!record) {
    record = {
      attempts: [],
      lockoutLevel: 0,
    };
    loginAttemptStore.set(normalizedEmail, record);
  }

  record.attempts.push(attempt);

  // Log for security monitoring
  if (!attempt.success) {
    callbacks?.log?.('warn', 'Failed login attempt', {
      email: normalizedEmail,
      ip: attempt.ip,
      userAgent: attempt.userAgent,
      attemptCount: record.attempts.filter(a => !a.success).length,
    });
  } else {
    callbacks?.log?.('info', 'Successful login', {
      email: normalizedEmail,
      ip: attempt.ip,
    });

    // Clear failed attempts on successful login
    record.attempts = record.attempts.filter(a => a.success);
  }
}

/**
 * Check if an account is currently locked out.
 * Call this BEFORE attempting authentication.
 */
export function checkAccountLockout(email: string, callbacks?: AuthCallbacks): AccountLockoutStatus {
  startLoginCleanup();

  const normalizedEmail = email.toLowerCase().trim();
  const record = loginAttemptStore.get(normalizedEmail);
  const config = AUTH_LOCKOUT_CONFIG;
  const now = new Date();

  if (!record) {
    return {
      locked: false,
      failedAttempts: 0,
      lockoutLevel: 0,
      manifest: buildManifest('ALLOW', 1.0),
    };
  }

  // Check if currently in lockout period
  if (record.lockoutUntil && record.lockoutUntil > now) {
    const isHighLevel = record.lockoutLevel >= 3;
    return {
      locked: true,
      unlockAt: record.lockoutUntil,
      reason: `Account temporarily locked. Try again at ${record.lockoutUntil.toISOString()}`,
      failedAttempts: record.attempts.filter(a => !a.success).length,
      lockoutLevel: record.lockoutLevel,
      manifest: buildManifest(
        isHighLevel ? 'BLOCK_AND_NOTIFY_ADMIN' : 'RETRY_WITH_BACKOFF',
        0.95,
        isHighLevel,
        { lockoutLevel: record.lockoutLevel, unlockAt: record.lockoutUntil.toISOString() },
      ),
    };
  }

  // Clear expired lockout
  if (record.lockoutUntil && record.lockoutUntil <= now) {
    record.lockoutUntil = undefined;
  }

  // Count recent failed attempts
  const windowStart = now.getTime() - config.attemptWindowMs;
  const recentFailedAttempts = record.attempts.filter(
    a => !a.success && a.timestamp.getTime() > windowStart
  );

  // Check if we should trigger a new lockout
  if (recentFailedAttempts.length >= config.maxAttempts) {
    // Increase lockout level (max 4)
    record.lockoutLevel = Math.min(
      record.lockoutLevel + 1,
      config.maxLockoutLevel
    );

    // Calculate lockout duration
    const lockoutDuration = config.lockoutDurationsMs[record.lockoutLevel - 1];
    record.lockoutUntil = new Date(now.getTime() + lockoutDuration);
    record.lastLockoutAt = now;

    callbacks?.log?.('warn', 'Account locked', {
      email: normalizedEmail,
      lockoutLevel: record.lockoutLevel,
      unlockAt: record.lockoutUntil.toISOString(),
      failedAttempts: recentFailedAttempts.length,
    });

    const isHighLevel = record.lockoutLevel >= 3;
    return {
      locked: true,
      unlockAt: record.lockoutUntil,
      reason: `Too many failed login attempts. Account locked until ${record.lockoutUntil.toISOString()}`,
      failedAttempts: recentFailedAttempts.length,
      lockoutLevel: record.lockoutLevel,
      manifest: buildManifest(
        isHighLevel ? 'BLOCK_AND_NOTIFY_ADMIN' : 'RETRY_WITH_BACKOFF',
        0.95,
        isHighLevel,
        { lockoutLevel: record.lockoutLevel, unlockAt: record.lockoutUntil.toISOString() },
      ),
    };
  }

  return {
    locked: false,
    failedAttempts: recentFailedAttempts.length,
    lockoutLevel: record.lockoutLevel,
    manifest: buildManifest(
      'ALLOW',
      recentFailedAttempts.length === 0 ? 1.0 : 0.8,
      false,
      recentFailedAttempts.length > 0 ? { failedAttempts: recentFailedAttempts.length } : undefined,
    ),
  };
}

/**
 * Manually unlock an account (admin action).
 */
export function unlockAccount(email: string, resetLevel = false, callbacks?: AuthCallbacks): void {
  const normalizedEmail = email.toLowerCase().trim();
  const record = loginAttemptStore.get(normalizedEmail);

  if (record) {
    record.lockoutUntil = undefined;
    if (resetLevel) {
      record.lockoutLevel = 0;
      record.lastLockoutAt = undefined;
    }

    callbacks?.log?.('info', 'Account unlocked', {
      email: normalizedEmail,
      resetLevel,
    });
  }
}

// ===========================================
// UTILITY FUNCTIONS
// ===========================================

/**
 * Reset login attempt store for testing purposes.
 * @internal
 */
export function _resetLoginAttemptStore(): void {
  loginAttemptStore.clear();
  idempotencyStore.clear();
}

/**
 * Get login attempts for an email (for admin/debugging).
 * @internal
 */
export function _getLoginAttempts(email: string): LoginAttempt[] {
  const record = loginAttemptStore.get(email.toLowerCase().trim());
  return record?.attempts ?? [];
}
