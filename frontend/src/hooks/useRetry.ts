// useRetry.ts
export function useRetry(maxAttempts = 3, baseDelay = 300) {
  function isRetryableError(e: any) {
    // Network error (no response) -> retry
    if (!e || !e.response) return true;

    const status = e.response.status;
    // Only retry on transient gateway / rate-limit statuses.
    // NOTE: 503 is intentionally NOT included (you don't want auto-retry on model overload).
    const transient = [429, 502, 504];
    return transient.includes(status);
  }

  async function runWithRetry<T>(fn: () => Promise<T>): Promise<T> {
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        return await fn();
      } catch (e: any) {
        // If non-retryable -> rethrow immediately
        if (!isRetryableError(e)) {
          throw e;
        }

        // If we've exhausted attempts -> rethrow
        if (attempt === maxAttempts) throw e;

        const delay = baseDelay * 2 ** (attempt - 1);
        await new Promise((r) => setTimeout(r, delay));
      }
    }
    throw new Error('Retry failed');
  }

  return { runWithRetry };
}
