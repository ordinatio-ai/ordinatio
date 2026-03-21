// ===========================================
// GRACEFUL SHUTDOWN
// ===========================================
// Manages graceful shutdown of the automation system.
// Tracks active executions and waits for them to complete
// before allowing the process to exit.
// ===========================================
// DEPENDS ON: None (uses console fallback for logging)
// USED BY: resilience.ts, trigger-registry.ts
// ===========================================

// Logger fallback
const logger = {
  warn(message: string, meta?: Record<string, unknown>): void {
    console.warn(`[automation/graceful-shutdown] ${message}`, meta ?? '');
  },
};

let isShuttingDown = false;
const activeExecutions = new Set<string>();

/**
 * Sleep for specified milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Check if system is shutting down
 */
export function isSystemShuttingDown(): boolean {
  return isShuttingDown;
}

/**
 * Register active execution
 */
export function registerActiveExecution(executionId: string): void {
  activeExecutions.add(executionId);
}

/**
 * Unregister active execution
 */
export function unregisterActiveExecution(executionId: string): void {
  activeExecutions.delete(executionId);
}

/**
 * Get count of active executions
 */
export function getActiveExecutionCount(): number {
  return activeExecutions.size;
}

/**
 * Initiate graceful shutdown
 * Waits for active executions to complete
 */
export async function initiateGracefulShutdown(timeoutMs: number = 30000): Promise<void> {
  isShuttingDown = true;
  logger.warn('Initiating graceful shutdown', {
    activeExecutions: activeExecutions.size,
    timeoutMs,
  });

  const startTime = Date.now();

  while (activeExecutions.size > 0) {
    if (Date.now() - startTime >= timeoutMs) {
      logger.warn('Graceful shutdown timeout reached', {
        remainingExecutions: activeExecutions.size,
      });
      break;
    }
    await sleep(100);
  }

  logger.warn('Graceful shutdown complete');
}

/**
 * Reset shutdown state (for testing)
 */
export function resetShutdownState(): void {
  isShuttingDown = false;
  activeExecutions.clear();
}
