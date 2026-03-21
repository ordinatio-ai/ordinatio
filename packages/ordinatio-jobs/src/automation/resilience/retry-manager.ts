// ===========================================
// RETRY MANAGER
// ===========================================
// Retry logic with exponential backoff for automation actions.
// Handles transient failures gracefully.
// ===========================================
// DEPENDS ON: None (uses console fallback for logging)
// USED BY: resilience.ts, trigger-registry.ts
// ===========================================

// Logger fallback
const logger = {
  warn(message: string, meta?: Record<string, unknown>): void {
    console.warn(`[automation/retry-manager] ${message}`, meta ?? '');
  },
};

export interface RetryConfig {
  maxAttempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
  retryableErrors?: string[];
}

export const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxAttempts: 3,
  baseDelayMs: 1000,
  maxDelayMs: 30000,
  backoffMultiplier: 2,
  retryableErrors: [
    'ECONNRESET',
    'ETIMEDOUT',
    'ECONNREFUSED',
    'Network error',
    'fetch failed',
    'Token expired',
  ],
};

/**
 * Calculate delay for retry attempt using exponential backoff with jitter
 */
export function calculateRetryDelay(
  attempt: number,
  config: RetryConfig = DEFAULT_RETRY_CONFIG
): number {
  const exponentialDelay = config.baseDelayMs * Math.pow(config.backoffMultiplier, attempt - 1);
  const cappedDelay = Math.min(exponentialDelay, config.maxDelayMs);

  // Add jitter (±25%) to prevent thundering herd
  const jitter = cappedDelay * 0.25 * (Math.random() * 2 - 1);
  return Math.floor(cappedDelay + jitter);
}

/**
 * Check if error is retryable
 */
export function isRetryableError(
  error: Error,
  config: RetryConfig = DEFAULT_RETRY_CONFIG
): boolean {
  const errorMessage = error.message.toLowerCase();

  // Always retry on specific patterns
  if (config.retryableErrors) {
    return config.retryableErrors.some((pattern) =>
      errorMessage.includes(pattern.toLowerCase())
    );
  }

  return false;
}

/**
 * Sleep for specified milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Execute with retry
 */
export async function executeWithRetry<T>(
  fn: () => Promise<T>,
  config: RetryConfig = DEFAULT_RETRY_CONFIG,
  context?: string
): Promise<T> {
  let lastError: Error | undefined;

  for (let attempt = 1; attempt <= config.maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));

      if (attempt < config.maxAttempts && isRetryableError(lastError, config)) {
        const delay = calculateRetryDelay(attempt, config);
        logger.warn(
          `Retrying after error (attempt ${attempt}/${config.maxAttempts})`,
          { context, error: lastError.message, delayMs: delay }
        );
        await sleep(delay);
      } else {
        break;
      }
    }
  }

  throw lastError;
}
