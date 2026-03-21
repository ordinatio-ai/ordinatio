// ===========================================
// @ordinatio/security — Nonce Store (Replay Protection)
// ===========================================
// LRU + TTL nonce tracking for replay attack prevention.
// Adapted from @ordinatio/email NonceTracker pattern.
// Shared infrastructure for auth tokens, workflow approvals,
// migration actions, and email capsules.
// ===========================================

export interface NonceCheckResult {
  valid: boolean;
  reason: 'ok' | 'duplicate' | 'expired';
}

export interface NonceStore {
  checkAndSet(nonce: string, issuer?: string, expiresAt?: Date): NonceCheckResult;
  has(nonce: string): boolean;
  clear(): void;
  readonly size: number;
}

/**
 * In-memory nonce store with LRU eviction and TTL expiration.
 * Map preserves insertion order for efficient FIFO eviction.
 */
export class InMemoryNonceStore implements NonceStore {
  private seen: Map<string, { timestamp: number; expiresAt?: number }>;
  private maxSize: number;
  private ttlMs: number;

  constructor(maxSize = 10_000, ttlMs = 24 * 60 * 60 * 1000) {
    this.seen = new Map();
    this.maxSize = maxSize;
    this.ttlMs = ttlMs;
  }

  checkAndSet(nonce: string, _issuer?: string, expiresAt?: Date): NonceCheckResult {
    this.evictExpired();

    const existing = this.seen.get(nonce);
    if (existing) {
      return { valid: false, reason: 'duplicate' };
    }

    // Check if the nonce has a custom expiry that's already passed
    if (expiresAt && expiresAt.getTime() < Date.now()) {
      return { valid: false, reason: 'expired' };
    }

    // Evict oldest if at capacity
    if (this.seen.size >= this.maxSize) {
      const oldest = this.seen.keys().next().value;
      if (oldest !== undefined) {
        this.seen.delete(oldest);
      }
    }

    this.seen.set(nonce, {
      timestamp: Date.now(),
      expiresAt: expiresAt?.getTime(),
    });

    return { valid: true, reason: 'ok' };
  }

  has(nonce: string): boolean {
    this.evictExpired();
    return this.seen.has(nonce);
  }

  clear(): void {
    this.seen.clear();
  }

  get size(): number {
    return this.seen.size;
  }

  private evictExpired(): void {
    const now = Date.now();
    const defaultCutoff = now - this.ttlMs;

    for (const [nonce, entry] of this.seen) {
      const expiry = entry.expiresAt ?? (entry.timestamp + this.ttlMs);
      if (expiry < now || entry.timestamp < defaultCutoff) {
        this.seen.delete(nonce);
      } else {
        break; // Map preserves insertion order — stop at first non-expired
      }
    }
  }
}
