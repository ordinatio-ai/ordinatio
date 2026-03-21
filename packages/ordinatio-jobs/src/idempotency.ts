// ===========================================
// ORDINATIO JOBS v1.1 — Idempotency Store
// ===========================================
// In-memory deduplication with TTL. Prevents
// double execution within a time window.
// Respects replay policy (allow/deny/merge).
// ===========================================

import type { ReplayPolicy, JobResult } from './types';

/** Result of an idempotency check. */
export interface IdempotencyCheck {
  /** Whether this execution is allowed to proceed. */
  allowed: boolean;
  /** Reason if blocked. */
  reason?: string;
  /** Previous result if available (for merge policy). */
  previousResult?: JobResult;
}

/** Stored entry in the idempotency store. */
interface StoreEntry {
  key: string;
  recordedAt: number;
  expiresAt: number;
  result?: JobResult;
}

/** Interface for idempotency stores (in-memory, Redis, etc.). */
export interface IdempotencyStore {
  /** Check if a key exists within its window. */
  has(key: string): boolean;
  /** Get a stored entry. */
  get(key: string): StoreEntry | undefined;
  /** Record a key with TTL. */
  record(key: string, dedupeWindowMs: number, result?: JobResult): void;
  /** Remove a key. */
  remove(key: string): void;
  /** Clear all entries. */
  clear(): void;
  /** Get the number of active entries. */
  size(): number;
}

/**
 * In-memory idempotency store with TTL-based expiry.
 * Cleans up expired entries on access.
 */
export function createInMemoryIdempotencyStore(): IdempotencyStore {
  const entries = new Map<string, StoreEntry>();

  function cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of entries) {
      if (entry.expiresAt <= now) {
        entries.delete(key);
      }
    }
  }

  return {
    has(key: string): boolean {
      cleanup();
      const entry = entries.get(key);
      return !!entry && entry.expiresAt > Date.now();
    },

    get(key: string): StoreEntry | undefined {
      cleanup();
      const entry = entries.get(key);
      if (!entry || entry.expiresAt <= Date.now()) return undefined;
      return entry;
    },

    record(key: string, dedupeWindowMs: number, result?: JobResult): void {
      const now = Date.now();
      entries.set(key, {
        key,
        recordedAt: now,
        expiresAt: now + dedupeWindowMs,
        result,
      });
    },

    remove(key: string): void {
      entries.delete(key);
    },

    clear(): void {
      entries.clear();
    },

    size(): number {
      cleanup();
      return entries.size;
    },
  };
}

/**
 * Check if a job execution is allowed based on idempotency.
 *
 * - `allow`: always proceeds (idempotent jobs)
 * - `deny`: blocks if key exists within window
 * - `merge`: returns previous result if available
 */
export function checkIdempotency(
  store: IdempotencyStore,
  key: string,
  dedupeWindowMs: number,
  replayPolicy: ReplayPolicy,
): IdempotencyCheck {
  // No key provided — always allow
  if (!key) {
    return { allowed: true };
  }

  const existing = store.get(key);

  if (!existing) {
    // First time — always allow, record the key
    store.record(key, dedupeWindowMs);
    return { allowed: true };
  }

  // Key exists within window — apply policy
  switch (replayPolicy) {
    case 'allow':
      return { allowed: true };

    case 'deny':
      return {
        allowed: false,
        reason: `Duplicate job within dedupe window (${dedupeWindowMs}ms). Key: ${key}`,
      };

    case 'merge':
      return {
        allowed: false,
        reason: 'Merge: returning previous result',
        previousResult: existing.result,
      };

    default:
      return {
        allowed: false,
        reason: `Unknown replay policy: ${replayPolicy}`,
      };
  }
}
