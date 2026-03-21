// ===========================================
// AUTOMATION MONITORING
// ===========================================
// Monitoring hooks and health checks for the automation system.
// Allows external systems to observe automation execution.
// ===========================================
// DEPENDS ON: None (uses console fallback for logging)
// USED BY: resilience.ts, trigger-registry.ts
// ===========================================

// Logger fallback
const logger = {
  warn(message: string, meta?: Record<string, unknown>): void {
    console.warn(`[automation/monitoring] ${message}`, meta ?? '');
  },
};

export interface MonitoringEvent {
  type:
    | 'EXECUTION_STARTED'
    | 'EXECUTION_COMPLETED'
    | 'EXECUTION_FAILED'
    | 'CIRCUIT_OPENED'
    | 'DEAD_LETTER';
  automationId?: string;
  executionId?: string;
  duration?: number;
  error?: string;
  metadata?: Record<string, unknown>;
}

type MonitoringHandler = (event: MonitoringEvent) => void | Promise<void>;

const monitoringHandlers: MonitoringHandler[] = [];

/**
 * Register a monitoring handler
 */
export function registerMonitoringHandler(handler: MonitoringHandler): void {
  monitoringHandlers.push(handler);
}

/**
 * Emit monitoring event
 */
export async function emitMonitoringEvent(event: MonitoringEvent): Promise<void> {
  for (const handler of monitoringHandlers) {
    try {
      await handler(event);
    } catch (err) {
      // Don't let monitoring failures affect execution
      logger.warn('Monitoring handler failed', {
        error: err instanceof Error ? err.message : 'Unknown',
      });
    }
  }
}

/**
 * Clear monitoring handlers (for testing)
 */
export function clearMonitoringHandlers(): void {
  monitoringHandlers.length = 0;
}
