// ===========================================
// NONCE TRACKER — Replay Protection
// ===========================================

/**
 * In-memory LRU-style nonce tracker to prevent replay attacks.
 * Tracks seen nonces with configurable TTL and max size.
 */
export class NonceTracker {
  private seen: Map<string, number>; // nonce → timestamp
  private maxSize: number;
  private ttlMs: number;

  constructor(maxSize = 10000, ttlMs = 24 * 60 * 60 * 1000) {
    this.seen = new Map();
    this.maxSize = maxSize;
    this.ttlMs = ttlMs;
  }

  /**
   * Check if a nonce has already been seen (replay detection).
   */
  hasBeenSeen(nonce: string): boolean {
    this.evictExpired();
    return this.seen.has(nonce);
  }

  /**
   * Record a nonce as seen.
   */
  record(nonce: string): void {
    this.evictExpired();

    // Evict oldest if at capacity
    if (this.seen.size >= this.maxSize) {
      const oldest = this.seen.keys().next().value;
      if (oldest !== undefined) {
        this.seen.delete(oldest);
      }
    }

    this.seen.set(nonce, Date.now());
  }

  /**
   * Clear all tracked nonces.
   */
  clear(): void {
    this.seen.clear();
  }

  /**
   * Current number of tracked nonces.
   */
  get size(): number {
    return this.seen.size;
  }

  private evictExpired(): void {
    const cutoff = Date.now() - this.ttlMs;
    for (const [nonce, ts] of this.seen) {
      if (ts < cutoff) {
        this.seen.delete(nonce);
      } else {
        break; // Map preserves insertion order — stop at first non-expired
      }
    }
  }
}
