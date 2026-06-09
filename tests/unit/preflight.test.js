#!/usr/bin/env node
/**
 * Unit tests for preflight's pure helpers (placeholder scan + check summary).
 * The git/tool checks are environment-dependent and exercised via the CLI, not here.
 */

'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { scanTreePlaceholders, summarize } = require(path.resolve(__dirname, '../../scripts/preflight.js'));

let passed = 0;
function check(name, fn) {
  fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

check('scanTreePlaceholders finds leftover placeholders and skips templates/', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'preflight-'));
  try {
    fs.writeFileSync(path.join(root, 'tasks.yml'), 'name: __ROLE_NAME__\n');
    fs.mkdirSync(path.join(root, 'templates', 'ansible-role'), { recursive: true });
    fs.writeFileSync(path.join(root, 'templates', 'ansible-role', 'x.yml'), 'name: __ROLE_NAME__\n');
    const hits = scanTreePlaceholders(root);
    assert.strictEqual(hits.length, 1);
    assert.strictEqual(hits[0].file, 'tasks.yml');
    assert.deepStrictEqual(hits[0].placeholders, ['__ROLE_NAME__']);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

check('a clean tree yields no placeholder hits', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'preflight-'));
  try {
    fs.writeFileSync(path.join(root, 'main.tf'), 'resource "null_resource" "x" {}\n');
    assert.deepStrictEqual(scanTreePlaceholders(root), []);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

check('summarize blocks on a hard failure, passes on warnings only', () => {
  assert.strictEqual(summarize([{ level: 'hard', ok: true }, { level: 'warn', ok: false }]).ok, true);
  const blocked = summarize([{ level: 'hard', ok: false }, { level: 'warn', ok: false }]);
  assert.strictEqual(blocked.ok, false);
  assert.strictEqual(blocked.hard.length, 1);
  assert.strictEqual(blocked.warnings.length, 1);
});

console.log(`\n✅ preflight: ${passed} checks passed`);
