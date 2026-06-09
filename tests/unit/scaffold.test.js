#!/usr/bin/env node
/**
 * Unit tests for the deterministic scaffolder: every type scaffolds, conforms, and has
 * no leftover placeholders; bad inputs are rejected.
 */

'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { sanitize, substitute, findPlaceholders, scaffold } = require(path.resolve(__dirname, '../../scripts/scaffold.js'));
const { TYPES } = require(path.resolve(__dirname, '../../scripts/lib/structure-spec.js'));

let passed = 0;
function check(name, fn) {
  fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

check('substitute replaces canonical placeholders', () => {
  assert.strictEqual(substitute('role_name: __ROLE_NAME__', 'My App'), 'role_name: My App');
  assert.strictEqual(substitute('{{ __role_name___pkgs }}', 'My App'), '{{ my_app_pkgs }}');
  assert.strictEqual(sanitize('My-App 1'), 'my_app_1');
});

check('findPlaceholders flags __UPPER__ but not prose markers', () => {
  assert.deepStrictEqual(findPlaceholders('a __ROLE_NAME__ b __NAME__'), ['__ROLE_NAME__', '__NAME__']);
  assert.deepStrictEqual(findPlaceholders('use a __double_underscore prefix'), []);
});

// Every type scaffolds cleanly (conforms + no leftover placeholders).
for (const type of TYPES) {
  check(`scaffolds ${type} → conforms, no placeholders`, () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'scaffold-'));
    try {
      const dest = path.join(tmp, 'unit');
      const res = scaffold({ type, name: 'demo', dest });
      assert.strictEqual(res.ok, true, res.errors.join('; '));
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
}

check('a scaffolded ansible-role has no __ROLE_NAME__ left', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'scaffold-'));
  try {
    const dest = path.join(tmp, 'myrole');
    scaffold({ type: 'ansible-role', name: 'myrole', dest });
    const meta = fs.readFileSync(path.join(dest, 'meta/main.yml'), 'utf8');
    assert.ok(/role_name: myrole/.test(meta));
    assert.ok(!/__ROLE_NAME__/.test(meta));
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

check('rejects an unknown type and a non-empty destination', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'scaffold-'));
  try {
    assert.strictEqual(scaffold({ type: 'nope', name: 'x', dest: path.join(tmp, 'a') }).ok, false);
    const dest = path.join(tmp, 'b');
    fs.mkdirSync(dest, { recursive: true });
    fs.writeFileSync(path.join(dest, 'existing'), 'x');
    assert.strictEqual(scaffold({ type: 'ansible-role', name: 'x', dest }).ok, false);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

console.log(`\n✅ scaffold: ${passed} checks passed`);
