'use strict';

/**
 * Bounded exponential-backoff retry for transient failures (network I/O).
 *
 * Used by the network callers (`ollama-router`, `siem-forwarder`) so a transient blip
 * doesn't fail the run. Deterministic and testable: inject `sleepFn` to avoid real waits.
 */

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * @param {(attempt:number)=>Promise<any>} fn  - the operation; receives the 0-based attempt
 * @param {object} [opts]
 *   retries=4, baseMs=200, factor=2, maxMs=Infinity,
 *   shouldRetry=(err,attempt)=>true, onRetry=(err,nextAttempt,delayMs)=>void, sleepFn=sleep
 * @returns {Promise<any>} the operation's result, or throws the last error
 */
async function retry(fn, opts = {}) {
  const retries = opts.retries == null ? 4 : opts.retries;
  const baseMs = opts.baseMs == null ? 200 : opts.baseMs;
  const factor = opts.factor == null ? 2 : opts.factor;
  const maxMs = opts.maxMs == null ? Infinity : opts.maxMs;
  const shouldRetry = opts.shouldRetry || (() => true);
  const sleepFn = opts.sleepFn || sleep;

  let attempt = 0;
  let lastErr;
  while (attempt <= retries) {
    try {
      return await fn(attempt);
    } catch (err) {
      lastErr = err;
      if (attempt === retries || !shouldRetry(err, attempt)) break;
      const delay = Math.min(maxMs, baseMs * factor ** attempt);
      if (opts.onRetry) opts.onRetry(err, attempt + 1, delay);
      await sleepFn(delay);
      attempt += 1;
    }
  }
  throw lastErr;
}

module.exports = { retry, sleep };
