export function useRetry(maxAttempts = 3, baseDelay = 300) {
    async function runWithRetry<T>(fn: () => Promise<T>): Promise<T> {
      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
          return await fn();
        } catch (e) {
          if (attempt === maxAttempts) throw e;
          const delay = baseDelay * 2 ** (attempt - 1);
          await new Promise((r) => setTimeout(r, delay));
        }
      }
      throw new Error('Retry failed');
    }
    return { runWithRetry };
  }
  