// ===========================================
// EXECUTION TIMEOUT
// ===========================================
// Wraps async operations with a timeout to prevent hangs.
// ===========================================
// DEPENDS ON: None (pure logic)
// USED BY: resilience.ts, trigger-registry.ts
// ===========================================

/**
 * Execute with timeout
 */
export async function executeWithTimeout<T>(
  fn: () => Promise<T>,
  timeoutMs: number,
  context?: string
): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(
        new Error(`Execution timed out after ${timeoutMs}ms${context ? ` (${context})` : ''}`)
      );
    }, timeoutMs);

    fn()
      .then((result) => {
        clearTimeout(timer);
        resolve(result);
      })
      .catch((err) => {
        clearTimeout(timer);
        reject(err);
      });
  });
}
