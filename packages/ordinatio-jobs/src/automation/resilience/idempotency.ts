// ===========================================
// IDEMPOTENCY MANAGER
// ===========================================
// Prevents duplicate automation executions within a time window.
// Uses in-memory cache for simplicity.
//
// For production multi-instance deployments, use the Redis-backed
// checkIdempotency() from state-store.ts instead.
// ===========================================
// DEPENDS ON: None (pure logic)
// USED BY: trigger-registry.ts, resilience.ts
// ===========================================

// In-memory cache for idempotency (use Redis in production)
const idempotencyCache = new Map<string, number>();
const IDEMPOTENCY_TTL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Generate idempotency key for a trigger event
 * Prevents duplicate executions within a time window
 */
export function generateIdempotencyKey(
  automationId: string,
  entityType: string,
  entityId: string,
  timestamp: Date
): string {
  // Round to nearest minute to allow some timing variance
  const minuteTimestamp = Math.floor(timestamp.getTime() / 60000);
  return `${automationId}:${entityType}:${entityId}:${minuteTimestamp}`;
}

/**
 * Check if execution is duplicate (idempotent check)
 */
export function isDuplicateExecution(idempotencyKey: string): boolean {
  const now = Date.now();

  // Clean expired entries
  for (const [key, expiry] of idempotencyCache.entries()) {
    if (expiry < now) {
      idempotencyCache.delete(key);
    }
  }

  if (idempotencyCache.has(idempotencyKey)) {
    return true;
  }

  // Mark as seen
  idempotencyCache.set(idempotencyKey, now + IDEMPOTENCY_TTL_MS);
  return false;
}

/**
 * Clear idempotency cache (for testing)
 */
export function clearIdempotencyCache(): void {
  idempotencyCache.clear();
}
