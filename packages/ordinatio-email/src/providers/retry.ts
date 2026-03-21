// ===========================================
// RETRY UTILITY (self-contained)
// ===========================================
// Exponential backoff retry logic for provider API calls.
// Copied from apps/web/src/lib/retry.ts to avoid external dep.
// ===========================================

export interface RetryOptions {
  maxAttempts?: number;
  initialDelayMs?: number;
  maxDelayMs?: number;
  backoffMultiplier?: number;
  jitter?: boolean;
  isRetryable?: (error: unknown) => boolean;
  onRetry?: (attempt: number, error: unknown, delayMs: number) => void;
  timeoutMs?: number;
}

const DEFAULT_OPTIONS: Required<Omit<RetryOptions, 'timeoutMs'>> & { timeoutMs?: number } = {
  maxAttempts: 3,
  initialDelayMs: 1000,
  maxDelayMs: 30000,
  backoffMultiplier: 2,
  jitter: true,
  isRetryable: () => true,
  onRetry: () => {},
  timeoutMs: undefined,
};

export class RetryExhaustedError extends Error {
  public readonly attempts: number;
  public readonly lastError: unknown;

  constructor(attempts: number, lastError: unknown) {
    const message = lastError instanceof Error
      ? `All ${attempts} retry attempts failed. Last error: ${lastError.message}`
      : `All ${attempts} retry attempts failed`;
    super(message);
    this.name = 'RetryExhaustedError';
    this.attempts = attempts;
    this.lastError = lastError;
  }
}

export class TimeoutError extends Error {
  public readonly timeoutMs: number;

  constructor(timeoutMs: number) {
    super(`Operation timed out after ${timeoutMs}ms`);
    this.name = 'TimeoutError';
    this.timeoutMs = timeoutMs;
  }
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new TimeoutError(timeoutMs));
    }, timeoutMs);

    promise
      .then((result) => { clearTimeout(timer); resolve(result); })
      .catch((error) => { clearTimeout(timer); reject(error); });
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  options?: RetryOptions
): Promise<T> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  let lastError: unknown;
  let delayMs = opts.initialDelayMs;

  for (let attempt = 1; attempt <= opts.maxAttempts; attempt++) {
    try {
      const promise = fn();
      const result = opts.timeoutMs
        ? await withTimeout(promise, opts.timeoutMs)
        : await promise;
      return result;
    } catch (error) {
      lastError = error;

      if (!opts.isRetryable(error)) {
        throw error;
      }

      if (attempt === opts.maxAttempts) {
        throw new RetryExhaustedError(attempt, error);
      }

      let actualDelay = Math.min(delayMs, opts.maxDelayMs);
      if (opts.jitter) {
        const jitterRange = actualDelay * 0.25;
        actualDelay += (Math.random() - 0.5) * 2 * jitterRange;
      }

      opts.onRetry(attempt, error, actualDelay);
      await sleep(actualDelay);
      delayMs *= opts.backoffMultiplier;
    }
  }

  throw new RetryExhaustedError(opts.maxAttempts, lastError);
}

export function isGoogleApiRetryable(error: unknown): boolean {
  if (error instanceof TimeoutError) return true;
  if (error instanceof TypeError && error.message.includes('fetch')) return true;

  if (error && typeof error === 'object' && 'code' in error) {
    const code = (error as { code: number }).code;
    if (code === 429) return true;
    if (code >= 500 && code < 600) return true;
  }

  if (error && typeof error === 'object' && 'response' in error) {
    const response = (error as { response: { status: number } }).response;
    if (response && typeof response.status === 'number') {
      const status = response.status;
      if (status === 429 || (status >= 500 && status < 600)) return true;
    }
  }

  return false;
}
