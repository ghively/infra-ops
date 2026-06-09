#!/usr/bin/env node
/**
 * Unit tests for the local conformance runner: detects + validates a canonical repo,
 * and reports deviations.
 */

'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { runConformance } = require(path.resolve(__dirname, '../../scripts/conformance.js'));
const { scaffold } = require(path.resolve(__dirname, '../../scripts/scaffold.js'));

const TEMPLATES = path.resolve(__dirname, '../../templates');

let passed = 0;
function check(name, fn) {
  fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

function buildRepo(root) {
  // A canonical Ansible repo: ansible.cfg + a scaffolded role + the template pipeline.
  fs.writeFileSync(path.join(root, 'ansible.cfg'), '[defaults]\nroles_path = roles\n');
  // Copy the canonical pipeline + the rest of the ansible-repo skeleton.
  for (const f of ['requirements.yml', '.gitlab-ci.yml']) {
    fs.copyFileSync(path.join(TEMPLATES, 'ansible-repo', f), path.join(root, f));
  }
  for (const env of ['dev', 'staging', 'prod']) {
    fs.mkdirSync(path.join(root, 'inventories', env, 'group_vars'), { recursive: true });
    fs.copyFileSync(
      path.join(TEMPLATES, 'ansible-repo', 'inventories', env, 'hosts.yml'),
      path.join(root, 'inventories', env, 'hosts.yml'),
    );
  }
  fs.mkdirSync(path.join(root, 'playbooks'), { recursive: true });
  fs.copyFileSync(path.join(TEMPLATES, 'ansible-repo', 'playbooks', 'site.yml'), path.join(root, 'playbooks', 'site.yml'));
  scaffold({ type: 'ansible-role', name: 'web', dest: path.join(root, 'roles', 'web') });
}

check('a canonical repo conforms across structure + deployment', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'conf-'));
  try {
    buildRepo(root);
    const results = runConformance(root);
    assert.ok(results.length >= 3, `expected several units, got ${results.length}`);
    assert.ok(results.every((r) => r.ok), JSON.stringify(results.filter((r) => !r.ok)));
    assert.ok(results.some((r) => r.type === 'deployment' && r.ok));
    assert.ok(results.some((r) => r.type === 'ansible-role' && r.ok));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

check('a broken role is reported as non-conformant', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'conf-'));
  try {
    buildRepo(root);
    fs.rmSync(path.join(root, 'roles', 'web', 'meta'), { recursive: true, force: true });
    const results = runConformance(root);
    const role = results.find((r) => r.type === 'ansible-role');
    assert.strictEqual(role.ok, false);
    assert.ok(role.errors.some((e) => /meta\/main\.yml/.test(e)));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

console.log(`\n✅ conformance: ${passed} checks passed`);
