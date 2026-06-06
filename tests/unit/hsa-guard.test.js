#!/usr/bin/env node
/**
 * Unit tests for the in-zone guard hooks:
 *   - hsa-boundary-guard: blocks any PAN/key/component/PIN/HSM reference (fail-closed)
 *   - block-no-verify: blocks attempts to bypass verification hooks
 *
 * Pure functions over in-memory payloads — no state store, no filesystem.
 */

'use strict';

const assert = require('assert');
const path = require('path');

const guard = require(path.resolve(__dirname, '../../scripts/hooks/hsa-boundary-guard.js'));
const noverify = require(path.resolve(__dirname, '../../scripts/hooks/block-no-verify.js'));

let passed = 0;
function check(name, fn) {
  fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

// ---- hsa-boundary-guard ----

check('guard detects a Luhn-valid PAN', () => {
  const hit = guard.findCrownJewels('card 4111111111111111 here');
  assert.ok(hit && /PAN/.test(hit.category));
  // A short, non-card number is not a PAN.
  assert.strictEqual(guard.containsPan('ticket 42 build 7'), false);
});

check('guard detects cryptographic key material', () => {
  assert.strictEqual(guard.findCrownJewels('-----BEGIN RSA PRIVATE KEY-----').category, 'cryptographic key material');
  assert.strictEqual(guard.findCrownJewels('rotate the ZMK now').category, 'cryptographic key material');
  assert.strictEqual(guard.findCrownJewels('record the key component').category, 'cryptographic key material');
  assert.strictEqual(guard.findCrownJewels('schedule a key ceremony').category, 'cryptographic key material');
});

check('guard detects PIN data', () => {
  assert.strictEqual(guard.findCrownJewels('extract the PIN block').category, 'PIN data');
  assert.strictEqual(guard.findCrownJewels('compute the PVV').category, 'PIN data');
});

check('guard detects HSM configuration', () => {
  assert.strictEqual(guard.findCrownJewels('configure the HSM partition').category, 'HSM configuration');
  assert.strictEqual(guard.findCrownJewels('on the payShield 10k').category, 'HSM configuration');
});

check('guard allows benign in-zone input', () => {
  assert.strictEqual(guard.findCrownJewels('update the nginx config and restart the service'), null);
});

check('guard.inspect denies a crown-jewels payload', () => {
  const reason = guard.inspect({ tool_input: { command: 'echo the ZMK is rotating' } });
  assert.ok(reason && /BLOCKED/.test(reason));
});

check('guard.inspect allows a benign payload', () => {
  assert.strictEqual(guard.inspect({ tool_input: { command: 'ansible-playbook site.yml --check' } }), null);
});

check('guard.inspect is fail-closed on uninspectable input', () => {
  const circular = {};
  circular.self = circular;
  delete process.env.INFRAOPS_HSA_GUARD_FAIL_OPEN;
  const reason = guard.inspect({ tool_input: circular });
  assert.ok(reason && /fail-closed/.test(reason));
});

check('guard.inspect relaxes to fail-open under the flag', () => {
  const circular = {};
  circular.self = circular;
  process.env.INFRAOPS_HSA_GUARD_FAIL_OPEN = '1';
  assert.strictEqual(guard.inspect({ tool_input: circular }), null);
  delete process.env.INFRAOPS_HSA_GUARD_FAIL_OPEN;
});

// ---- block-no-verify ----

check('no-verify detects --no-verify', () => {
  assert.ok(noverify.findBypass('git commit --no-verify -m wip'));
  assert.ok(noverify.findBypass('git push --no-verify'));
});

check('no-verify detects git commit -n', () => {
  assert.ok(noverify.findBypass('git commit -n -m wip'));
});

check('no-verify detects hooksPath neutralization and HUSKY=0', () => {
  assert.ok(noverify.findBypass('git -c core.hooksPath=/dev/null commit -m x'));
  assert.ok(noverify.findBypass('HUSKY=0 git commit -m x'));
});

check('no-verify allows a normal commit', () => {
  assert.strictEqual(noverify.findBypass('git commit -m "normal message"'), null);
  assert.strictEqual(noverify.findBypass('git commit --amend -m fix'), null);
});

check('no-verify.inspect only gates Bash', () => {
  assert.strictEqual(noverify.inspect({ tool_name: 'Write', tool_input: { command: 'git commit --no-verify' } }), null);
  const reason = noverify.inspect({ tool_name: 'Bash', tool_input: { command: 'git commit --no-verify' } });
  assert.ok(reason && /BLOCKED/.test(reason));
});

console.log(`\n✅ hsa-guard: ${passed} checks passed`);
