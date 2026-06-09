#!/usr/bin/env node
/**
 * Unit tests for the deterministic merge-gate decision.
 */

'use strict';

const assert = require('assert');
const path = require('path');

const { parseVerdict, decide } = require(path.resolve(__dirname, '../../scripts/lib/merge-gate.js'));

let passed = 0;
function check(name, fn) {
  fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

check('parseVerdict reads the token from reviewer output', () => {
  assert.strictEqual(parseVerdict('VERDICT: BLOCK\n## findings…'), 'BLOCK');
  assert.strictEqual(parseVerdict('verdict:  pass'), 'PASS');
  assert.strictEqual(parseVerdict('no token here'), null);
});

check('PASS x3 clears', () => {
  const r = decide(['PASS', 'PASS', 'PASS']);
  assert.strictEqual(r.decision, 'PASS');
  assert.strictEqual(r.cleared, true);
});

check('any BLOCK blocks (and is not cleared)', () => {
  const r = decide(['PASS', 'BLOCK', 'PASS']);
  assert.strictEqual(r.decision, 'BLOCK');
  assert.strictEqual(r.cleared, false);
});

check('WARN is advisory — clears but flagged', () => {
  const r = decide(['PASS', 'WARN', 'PASS']);
  assert.strictEqual(r.decision, 'WARN');
  assert.strictEqual(r.cleared, true);
});

check('a missing/invalid verdict is incomplete → BLOCK', () => {
  assert.strictEqual(decide(['PASS', 'PASS']).decision, 'BLOCK');           // only 2 reviewers
  assert.strictEqual(decide(['PASS', 'PASS', null]).decision, 'BLOCK');     // one missing
  assert.strictEqual(decide(['PASS', 'PASS', 'garbage']).decision, 'BLOCK'); // one invalid
});

check('BLOCK at the cycle cap escalates', () => {
  const r1 = decide(['BLOCK', 'PASS', 'PASS'], { cycle: 1 });
  assert.strictEqual(r1.escalate, false); // first cycle: revise
  const r2 = decide(['BLOCK', 'PASS', 'PASS'], { cycle: 2 });
  assert.strictEqual(r2.escalate, true);  // cap reached: human
});

console.log(`\n✅ merge-gate: ${passed} checks passed`);
