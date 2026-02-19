/**
 * Retry Utilities for Workers (CRIT-001, CRIT-002)
 * 
 * Provides exponential backoff and circuit breaker patterns
 * for resilient HTTP and browser operations.
 */

export interface RetryOptions {
  maxRetries: number;
  baseDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
  retryableErrors?: string[];
  onRetry?: (attempt: number, error: Error, delayMs: number) => void;
}

const DEFAULT_OPTIONS: RetryOptions = {
  maxRetries: 3,
  baseDelayMs: 1000,
  maxDelayMs: 30000,
  backoffMultiplier: 2,
  retryableErrors: ['ETIMEDOUT', 'ECONNRESET', 'ECONNREFUSED', 'fetch failed', 'timeout'],
};

/**
 * Calculate delay with exponential backoff + jitter
 */
function calculateDelay(attempt: number, options: RetryOptions): number {
  const exponentialDelay = options.baseDelayMs * Math.pow(options.backoffMultiplier, attempt - 1);
  const jitter = Math.random() * 0.3 * exponentialDelay; // 0-30% jitter
  return Math.min(exponentialDelay + jitter, options.maxDelayMs);
}

/**
 * Check if error is retryable
 */
function isRetryable(error: Error, options: RetryOptions): boolean {
  const errorStr = error.message.toLowerCase();
  
  // Always retry these HTTP status codes
  if (errorStr.includes('429') || errorStr.includes('503') || errorStr.includes('502')) {
    return true;
  }
  
  // Check against retryable error patterns
  return options.retryableErrors?.some(pattern => 
    errorStr.includes(pattern.toLowerCase())
  ) ?? false;
}

/**
 * Retry wrapper for async functions with exponential backoff
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: Partial<RetryOptions> = {}
): Promise<T> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  let lastError: Error | null = null;
  
  for (let attempt = 1; attempt <= opts.maxRetries + 1; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;
      
      const isLastAttempt = attempt > opts.maxRetries;
      const canRetry = !isLastAttempt && isRetryable(lastError, opts);
      
      if (!canRetry) {
        throw lastError;
      }
      
      const delay = calculateDelay(attempt, opts);
      opts.onRetry?.(attempt, lastError, delay);
      
      await sleep(delay);
    }
  }
  
  throw lastError;
}

/**
 * Retry wrapper for fetch with timeout support
 */
export async function fetchWithRetry(
  url: string,
  init?: RequestInit & { timeoutMs?: number },
  options: Partial<RetryOptions> = {}
): Promise<Response> {
  const { timeoutMs = 30000, ...fetchInit } = init || {};
  
  return withRetry(async () => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    
    try {
      const response = await fetch(url, {
        ...fetchInit,
        signal: controller.signal,
      });
      
      // Treat 5xx as retryable
      if (response.status >= 500 || response.status === 429) {
        const text = await response.text().catch(() => '');
        throw new Error(`HTTP ${response.status}: ${text.slice(0, 200)}`);
      }
      
      return response;
    } finally {
      clearTimeout(timeout);
    }
  }, options);
}

/**
 * Circuit breaker state
 */
interface CircuitState {
  failures: number;
  lastFailure: number;
  state: 'closed' | 'open' | 'half-open';
}

const circuits = new Map<string, CircuitState>();

/**
 * Circuit breaker for external services (HIGH-003)
 */
export function withCircuitBreaker<T>(
  key: string,
  fn: () => Promise<T>,
  options: {
    failureThreshold: number;
    resetTimeMs: number;
    halfOpenRequests: number;
  } = {
    failureThreshold: 5,
    resetTimeMs: 60000,
    halfOpenRequests: 1,
  }
): Promise<T> {
  let circuit = circuits.get(key);
  
  if (!circuit) {
    circuit = { failures: 0, lastFailure: 0, state: 'closed' };
    circuits.set(key, circuit);
  }
  
  const now = Date.now();
  
  // Check if we should transition from open to half-open
  if (circuit.state === 'open' && now - circuit.lastFailure > options.resetTimeMs) {
    circuit.state = 'half-open';
    circuit.failures = 0;
  }
  
  // If circuit is open, fail fast
  if (circuit.state === 'open') {
    throw new Error(`Circuit breaker open for ${key}. Will retry after ${Math.round((options.resetTimeMs - (now - circuit.lastFailure)) / 1000)}s`);
  }
  
  return fn()
    .then(result => {
      // Success - reset circuit
      circuit!.failures = 0;
      circuit!.state = 'closed';
      return result;
    })
    .catch(error => {
      circuit!.failures++;
      circuit!.lastFailure = now;
      
      if (circuit!.failures >= options.failureThreshold) {
        circuit!.state = 'open';
        console.error(`[CircuitBreaker] ${key} opened after ${circuit!.failures} failures`);
      }
      
      throw error;
    });
}

/**
 * Sleep utility
 */
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Batch processor with retry per item
 */
export async function processBatchWithRetry<T, R>(
  items: T[],
  processor: (item: T) => Promise<R>,
  options: {
    maxRetries?: number;
    delayBetweenItems?: number;
    onItemError?: (item: T, error: Error, attempt: number) => void;
    onItemSuccess?: (item: T, result: R) => void;
  } = {}
): Promise<{ successes: R[]; failures: Array<{ item: T; error: Error }> }> {
  const maxRetries = options.maxRetries ?? 2;
  const delayMs = options.delayBetweenItems ?? 1000;
  
  const successes: R[] = [];
  const failures: Array<{ item: T; error: Error }> = [];
  
  for (const item of items) {
    let lastError: Error | null = null;
    
    for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
      try {
        const result = await processor(item);
        options.onItemSuccess?.(item, result);
        successes.push(result);
        lastError = null;
        break;
      } catch (error) {
        lastError = error as Error;
        options.onItemError?.(item, lastError, attempt);
        
        if (attempt <= maxRetries) {
          await sleep(delayMs * attempt); // Linear backoff per item
        }
      }
    }
    
    if (lastError) {
      failures.push({ item, error: lastError });
    }
    
    // Rate limiting between items
    if (delayMs > 0) {
      await sleep(delayMs);
    }
  }
  
  return { successes, failures };
}
