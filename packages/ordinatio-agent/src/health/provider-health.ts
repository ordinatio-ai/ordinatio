// ===========================================
// PROVIDER HEALTH TRACKER — Circuit Breaker
// ===========================================
// In-memory health tracking with circuit breaker
// pattern. Routes around failed providers using
// fallback chains. No external dependencies.
// ===========================================

type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

interface ProviderCircuit {
  state: CircuitState;
  failures: number;
  lastFailure: number;
  lastSuccess: number;
  halfOpenAttempts: number;
}

export interface ProviderHealthConfig {
  failureThreshold: number;       // failures before opening circuit (default: 3)
  resetTimeoutMs: number;         // ms before trying half-open (default: 60000)
  halfOpenMaxAttempts: number;     // max attempts in half-open before re-opening (default: 2)
}

const DEFAULT_CONFIG: ProviderHealthConfig = {
  failureThreshold: 3,
  resetTimeoutMs: 60_000,
  halfOpenMaxAttempts: 2,
};

/** In-memory provider health state. */
const circuits = new Map<string, ProviderCircuit>();

function getCircuit(providerId: string): ProviderCircuit {
  let circuit = circuits.get(providerId);
  if (!circuit) {
    circuit = { state: 'CLOSED', failures: 0, lastFailure: 0, lastSuccess: 0, halfOpenAttempts: 0 };
    circuits.set(providerId, circuit);
  }
  return circuit;
}

/**
 * Record a provider call result.
 */
export function recordProviderResult(
  providerId: string,
  success: boolean,
  config: ProviderHealthConfig = DEFAULT_CONFIG,
): void {
  const circuit = getCircuit(providerId);

  if (success) {
    circuit.state = 'CLOSED';
    circuit.failures = 0;
    circuit.halfOpenAttempts = 0;
    circuit.lastSuccess = Date.now();
  } else {
    circuit.failures++;
    circuit.lastFailure = Date.now();

    if (circuit.state === 'HALF_OPEN') {
      circuit.halfOpenAttempts++;
      if (circuit.halfOpenAttempts >= config.halfOpenMaxAttempts) {
        circuit.state = 'OPEN';
      }
    } else if (circuit.failures >= config.failureThreshold) {
      circuit.state = 'OPEN';
    }
  }
}

/**
 * Check if a provider's circuit is currently open (should not be called).
 */
export function isProviderHealthy(
  providerId: string,
  config: ProviderHealthConfig = DEFAULT_CONFIG,
): boolean {
  const circuit = getCircuit(providerId);

  if (circuit.state === 'CLOSED') return true;

  if (circuit.state === 'OPEN') {
    // Check if reset timeout has elapsed -> transition to HALF_OPEN
    if (Date.now() - circuit.lastFailure >= config.resetTimeoutMs) {
      circuit.state = 'HALF_OPEN';
      circuit.halfOpenAttempts = 0;
      return true;
    }
    return false;
  }

  // HALF_OPEN — allow limited attempts
  return circuit.halfOpenAttempts < config.halfOpenMaxAttempts;
}

/**
 * Get the best available provider from a preferred + fallback list.
 * Returns the first healthy provider, or the preferred one if all are unhealthy.
 */
export function getHealthyProvider(
  preferredId: string,
  fallbackIds: string[],
  config: ProviderHealthConfig = DEFAULT_CONFIG,
): string {
  // Try preferred first
  if (isProviderHealthy(preferredId, config)) {
    return preferredId;
  }

  // Try fallbacks in order
  for (const id of fallbackIds) {
    if (id !== preferredId && isProviderHealthy(id, config)) {
      return id;
    }
  }

  // All unhealthy — return preferred anyway (best effort)
  return preferredId;
}

/**
 * Get the current circuit state for a provider (for diagnostics).
 */
export function getProviderHealth(providerId: string): {
  state: CircuitState;
  failures: number;
  lastFailure: number;
  lastSuccess: number;
} {
  const circuit = getCircuit(providerId);
  return {
    state: circuit.state,
    failures: circuit.failures,
    lastFailure: circuit.lastFailure,
    lastSuccess: circuit.lastSuccess,
  };
}

/**
 * Reset a provider's circuit (for testing).
 */
export function resetProviderHealth(providerId: string): void {
  circuits.delete(providerId);
}

/**
 * Reset all provider circuits (for testing).
 */
export function resetAllProviderHealth(): void {
  circuits.clear();
}
