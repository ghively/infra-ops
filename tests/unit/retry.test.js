#!/usr/bin/env node
/**
 * Unit tests for the retry/backoff helper (deterministic — no real waits).
 */

'use strict';

const assert = require('assert');
const path = require('path');

const { retry } = require(path.resolve(__dirname, '../../scripts/lib/retry.js'));

const noWait = () => Promise.resolve(); // inject to skip real backoff

let passed = 0;
async function check(name, fn) {
  await fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

(async () => {
  await check('succeeds first try (no retries used)', async () => {
    let calls = 0;
    const r = await retry(async () => { calls += 1; return 'ok'; }, { sleepFn: noWait });
    assert.strictEqual(r, 'ok');
    assert.strictEqual(calls, 1);
  });

  await check('retries then succeeds', async () => {
    let calls = 0;
    const r = await retry(async () => {
      calls += 1;
      if (calls < 3) throw new Error('transient');
      return 'recovered';
    }, { retries: 4, sleepFn: noWait });
    assert.strictEqual(r, 'recovered');
    assert.strictEqual(calls, 3);
  });

  await check('throws after exhausting retries (retries+1 attempts)', async () => {
    let calls = 0;
    await assert.rejects(
      retry(async () => { calls += 1; throw new Error('always'); }, { retries: 2, sleepFn: noWait }),
      /always/,
    );
    assert.strictEqual(calls, 3); // 1 initial + 2 retries
  });

  await check('shouldRetry=false stops immediately', async () => {
    let calls = 0;
    await assert.rejects(
      retry(async () => { calls += 1; throw new Error('fatal'); }, { retries: 5, shouldRetry: () => false, sleepFn: noWait }),
      /fatal/,
    );
    assert.strictEqual(calls, 1);
  });

  await check('onRetry fires with increasing backoff', async () => {
    const delays = [];
    let calls = 0;
    await retry(async () => { calls += 1; if (calls < 3) throw new Error('x'); return 1; }, {
      baseMs: 10, factor: 2, sleepFn: noWait, onRetry: (_e, _n, d) => delays.push(d),
    });
    assert.deepStrictEqual(delays, [10, 20]); // exponential
  });

  console.log(`\n✅ retry: ${passed} checks passed`);
})().catch((err) => { console.error(err); process.exit(1); });
