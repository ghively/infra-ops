#!/usr/bin/env node
/**
 * [conformance] Local structure + deployment conformance runner.
 *
 * Runs the same checks the `structure-conformance` CI component runs, over a target
 * repo, in one command — so the agent has a single reliable pre-MR gate that mirrors CI
 * instead of remembering each validator. `npm run conformance [-- <path>]`.
 *
 * Exit 0 = everything conforms; non-zero = at least one deviation.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { validateStructure } = require('./validate-structure.js');
const { evaluate } = require('./lib/deployment-policy.js');

function subdirs(p) {
  if (!fs.existsSync(p) || !fs.statSync(p).isDirectory()) return [];
  return fs.readdirSync(p, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => path.join(p, e.name));
}

// Detect units by the canonical repo layout and validate each. Returns result rows.
function runConformance(root) {
  const results = [];
  const add = (type, unit, res) => results.push({ type, unit, ok: res.ok, errors: res.errors || [] });

  if (fs.existsSync(path.join(root, 'ansible.cfg'))) add('ansible-repo', root, validateStructure('ansible-repo', root));
  for (const d of subdirs(path.join(root, 'roles'))) add('ansible-role', d, validateStructure('ansible-role', d));
  for (const d of subdirs(path.join(root, 'modules'))) add('terraform-module', d, validateStructure('terraform-module', d));
  for (const d of subdirs(path.join(root, 'envs'))) add('terraform-env', d, validateStructure('terraform-env', d));
  for (const d of subdirs(path.join(root, 'packer'))) add('packer-template', d, validateStructure('packer-template', d));

  const ci = path.join(root, '.gitlab-ci.yml');
  if (fs.existsSync(ci)) add('deployment', ci, evaluate(fs.readFileSync(ci, 'utf8')));

  return results;
}

function main(argv) {
  const root = argv[0] || process.cwd();
  const results = runConformance(root);
  if (results.length === 0) {
    process.stdout.write(`conformance: no IaC units detected under ${root}\n`);
    return 0;
  }
  let failed = 0;
  for (const r of results) {
    if (r.ok) {
      process.stdout.write(`✅ ${r.type}: ${r.unit}\n`);
    } else {
      failed += 1;
      process.stderr.write(`❌ ${r.type}: ${r.unit}\n`);
      r.errors.forEach((e) => process.stderr.write(`     - ${e}\n`));
    }
  }
  process.stdout.write(`\n${results.length - failed}/${results.length} units conform.\n`);
  return failed > 0 ? 1 : 0;
}

if (require.main === module) {
  process.exit(main(process.argv.slice(2)));
}

module.exports = { runConformance, subdirs };
