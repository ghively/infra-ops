#!/usr/bin/env node
/**
 * Unit tests for the structure-conformance gate:
 *   - every bundled template validates against its own type (spec ↔ templates never drift)
 *   - the validator actually REJECTS deviations (missing files, failed content checks)
 *
 * This is what makes "uniform structure" enforced: if a template or the spec drifts,
 * npm test goes red.
 */

'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { validateStructure } = require(path.resolve(__dirname, '../../scripts/validate-structure.js'));
const { TYPES } = require(path.resolve(__dirname, '../../scripts/lib/structure-spec.js'));

const TEMPLATES = path.resolve(__dirname, '../../templates');

let passed = 0;
function check(name, fn) {
  fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

// 1. Every known type has a bundled template that conforms.
for (const type of TYPES) {
  check(`bundled template conforms: ${type}`, () => {
    const res = validateStructure(type, path.join(TEMPLATES, type));
    assert.strictEqual(res.ok, true, `${type}: ${res.errors.join('; ')}`);
  });
}

// 2. A missing required file is rejected.
check('rejects a unit missing required files', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'struct-'));
  try {
    const res = validateStructure('terraform-module', tmp);
    assert.strictEqual(res.ok, false);
    assert.ok(res.errors.some((e) => /missing required file: versions\.tf/.test(e)));
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

// 3. A present-but-non-conformant file (failed content check) is rejected.
check('rejects a terraform module with unpinned versions', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'struct-'));
  try {
    fs.writeFileSync(path.join(tmp, 'main.tf'), '# empty\n');
    fs.writeFileSync(path.join(tmp, 'variables.tf'), '# empty\n');
    fs.writeFileSync(path.join(tmp, 'outputs.tf'), '# empty\n');
    fs.writeFileSync(path.join(tmp, 'README.md'), '# x\n');
    fs.writeFileSync(path.join(tmp, 'versions.tf'), 'terraform {}\n'); // no required_version/providers
    const res = validateStructure('terraform-module', tmp);
    assert.strictEqual(res.ok, false);
    assert.ok(res.errors.some((e) => /required_version/.test(e)));
    assert.ok(res.errors.some((e) => /required_providers/.test(e)));
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

// 4. A missing required directory is rejected.
check('rejects an ansible role missing skeleton dirs', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'struct-'));
  try {
    const res = validateStructure('ansible-role', tmp);
    assert.strictEqual(res.ok, false);
    assert.ok(res.errors.some((e) => /missing required directory: handlers\//.test(e)));
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

// 5. Unknown type is rejected.
check('rejects an unknown type', () => {
  const res = validateStructure('not-a-type', TEMPLATES);
  assert.strictEqual(res.ok, false);
  assert.ok(res.errors.some((e) => /unknown type/.test(e)));
});

console.log(`\n✅ structure: ${passed} checks passed`);
