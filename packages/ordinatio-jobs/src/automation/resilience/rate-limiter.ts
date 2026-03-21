// ===========================================
// AUTOMATION RATE LIMITER
// ===========================================
// In-memory rate limiting for automation executions.
// Tracks per-automation execution counts and cooldowns.
//
// For production multi-instance deployments, this should be
// replaced with Redis-backed rate limiting (see state-store.ts).
// ===========================================
// DEPENDS ON: None (pure logic)
// USED BY: trigger-registry.ts
// ===========================================

/**
 * Rate limit tracking state (in-memory for simplicity, use Redis in production)
 */
const executionCounts = new Map<string, { count: number; resetAt: number }>();
const lastExecutionTimes = new Map<string, number>();

export interface RateLimitedAutomation {
  id: string;
  maxExecutionsPerHour: number | null;
  cooldownSeconds: number;
}

/**
 * Check if automation is within rate limits
 */
export function checkRateLimits(automation: RateLimitedAutomation): boolean {
  const now = Date.now();

  // Check cooldown
  if (automation.cooldownSeconds > 0) {
    const lastExec = lastExecutionTimes.get(automation.id);
    if (lastExec) {
      const cooldownMs = automation.cooldownSeconds * 1000;
      if (now - lastExec < cooldownMs) {
        return false;
      }
    }
  }

  // Check hourly rate limit
  if (automation.maxExecutionsPerHour !== null) {
    const tracking = executionCounts.get(automation.id);

    if (tracking) {
      // Reset if the hour has passed
      if (tracking.resetAt < now) {
        executionCounts.set(automation.id, {
          count: 0,
          resetAt: now + 3600000,
        });
      } else if (tracking.count >= automation.maxExecutionsPerHour) {
        return false;
      }
    }
  }

  return true;
}

/**
 * Update rate limit tracking after execution
 */
export function updateRateLimitTracking(automationId: string): void {
  const now = Date.now();

  // Update last execution time
  lastExecutionTimes.set(automationId, now);

  // Update hourly count
  const tracking = executionCounts.get(automationId);
  if (tracking && tracking.resetAt > now) {
    tracking.count++;
  } else {
    executionCounts.set(automationId, {
      count: 1,
      resetAt: now + 3600000,
    });
  }
}

/**
 * Clear rate limit tracking (useful for testing)
 */
export function clearRateLimitTracking(): void {
  executionCounts.clear();
  lastExecutionTimes.clear();
}
