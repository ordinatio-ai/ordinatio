// ===========================================
// CIRCUIT BREAKER
// ===========================================
// Circuit breaker pattern for external service protection.
// Prevents cascading failures by temporarily blocking calls
// to failing services.
//
// States:
// - CLOSED: Normal operation, requests pass through
// - OPEN: Failures exceeded threshold, requests blocked
// - HALF_OPEN: Testing if service recovered
// ===========================================
// DEPENDS ON: None (uses console fallback for logging)
// USED BY: resilience.ts
// ===========================================

// Logger is optional — uses console as fallback
const logger = {
  warn(message: string, meta?: Record<string, unknown>): void {
    console.warn(`[automation/circuit-breaker] ${message}`, meta ?? '');
  },
};

interface CircuitState {
  failures: number;
  lastFailure: number;
  state: 'CLOSED' | 'OPEN' | 'HALF_OPEN';
  halfOpenAttempts: number;
}

export interface CircuitBreakerConfig {
  failureThreshold: number;
  resetTimeoutMs: number;
  halfOpenMaxAttempts: number;
}

export const DEFAULT_CIRCUIT_CONFIG: CircuitBreakerConfig = {
  failureThreshold: 5,
  resetTimeoutMs: 60000, // 1 minute
  halfOpenMaxAttempts: 3,
};

// Circuit breakers by service name
const circuitBreakers = new Map<string, CircuitState>();

/**
 * Get or create circuit breaker state
 */
function getCircuitState(serviceName: string): CircuitState {
  let state = circuitBreakers.get(serviceName);
  if (!state) {
    state = {
      failures: 0,
      lastFailure: 0,
      state: 'CLOSED',
      halfOpenAttempts: 0,
    };
    circuitBreakers.set(serviceName, state);
  }
  return state;
}

/**
 * Check if circuit is open (should skip execution)
 */
export function isCircuitOpen(
  serviceName: string,
  config: CircuitBreakerConfig = DEFAULT_CIRCUIT_CONFIG
): boolean {
  const circuit = getCircuitState(serviceName);
  const now = Date.now();

  if (circuit.state === 'OPEN') {
    // Check if we should transition to half-open
    if (now - circuit.lastFailure >= config.resetTimeoutMs) {
      circuit.state = 'HALF_OPEN';
      circuit.halfOpenAttempts = 0;
      return false;
    }
    return true;
  }

  if (circuit.state === 'HALF_OPEN') {
    // Allow limited attempts in half-open state
    if (circuit.halfOpenAttempts >= config.halfOpenMaxAttempts) {
      return true;
    }
    circuit.halfOpenAttempts++;
  }

  return false;
}

/**
 * Record successful execution
 */
export function recordCircuitSuccess(serviceName: string): void {
  const circuit = getCircuitState(serviceName);
  circuit.failures = 0;
  circuit.state = 'CLOSED';
  circuit.halfOpenAttempts = 0;
}

/**
 * Record failed execution
 */
export function recordCircuitFailure(
  serviceName: string,
  config: CircuitBreakerConfig = DEFAULT_CIRCUIT_CONFIG
): void {
  const circuit = getCircuitState(serviceName);
  circuit.failures++;
  circuit.lastFailure = Date.now();

  if (circuit.state === 'HALF_OPEN' || circuit.failures >= config.failureThreshold) {
    circuit.state = 'OPEN';
    logger.warn(`Circuit breaker opened for ${serviceName}`, {
      failures: circuit.failures,
      threshold: config.failureThreshold,
    });
  }
}

/**
 * Execute with circuit breaker protection
 */
export async function executeWithCircuitBreaker<T>(
  serviceName: string,
  fn: () => Promise<T>,
  config: CircuitBreakerConfig = DEFAULT_CIRCUIT_CONFIG
): Promise<T> {
  if (isCircuitOpen(serviceName, config)) {
    throw new Error(`Circuit breaker open for ${serviceName}`);
  }

  try {
    const result = await fn();
    recordCircuitSuccess(serviceName);
    return result;
  } catch (err) {
    recordCircuitFailure(serviceName, config);
    throw err;
  }
}

/**
 * Reset circuit breaker (for testing)
 */
export function resetCircuitBreaker(serviceName: string): void {
  circuitBreakers.delete(serviceName);
}

/**
 * Reset all circuit breakers (for testing)
 */
export function resetAllCircuitBreakers(): void {
  circuitBreakers.clear();
}
