// ===========================================
// AUTOMATION RESILIENCE LAYER
// ===========================================
// Battle-hardened infrastructure for reliable automation execution.
// Designed for 10+ year reliability.
//
// This file re-exports from specialized modules:
// - idempotency.ts - Duplicate execution prevention
// - retry-manager.ts - Retry with exponential backoff
// - circuit-breaker.ts - Circuit breaker pattern
// - timeout.ts - Execution timeouts
// - dead-letter.ts - Failed execution storage
// - monitoring.ts - Monitoring hooks
// - graceful-shutdown.ts - Graceful shutdown support
//
// DEPLOYMENT NOTE:
// These modules use in-memory state for simplicity. For multi-instance
// deployments (horizontal scaling), use the state-store.ts functions
// which support Redis.
// ===========================================
// DEPENDS ON: All extracted modules
// USED BY: trigger-registry.ts
// ===========================================

// Re-export idempotency
export {
  generateIdempotencyKey,
  isDuplicateExecution,
  clearIdempotencyCache,
} from './idempotency';

// Re-export retry manager
export {
  type RetryConfig,
  DEFAULT_RETRY_CONFIG,
  calculateRetryDelay,
  isRetryableError,
  executeWithRetry,
} from './retry-manager';

// Re-export circuit breaker
export {
  type CircuitBreakerConfig,
  DEFAULT_CIRCUIT_CONFIG,
  isCircuitOpen,
  recordCircuitSuccess,
  recordCircuitFailure,
  executeWithCircuitBreaker,
  resetCircuitBreaker,
  resetAllCircuitBreakers,
} from './circuit-breaker';

// Re-export timeout
export { executeWithTimeout } from './timeout';

// Re-export dead letter
export {
  type DeadLetterEntry,
  moveToDeadLetter,
  getDeadLetterEntries,
  retryDeadLetterEntry,
} from './dead-letter';

// Re-export monitoring
export {
  type MonitoringEvent,
  registerMonitoringHandler,
  emitMonitoringEvent,
  clearMonitoringHandlers,
} from './monitoring';

// Re-export graceful shutdown
export {
  isSystemShuttingDown,
  registerActiveExecution,
  unregisterActiveExecution,
  getActiveExecutionCount,
  initiateGracefulShutdown,
  resetShutdownState,
} from './graceful-shutdown';
