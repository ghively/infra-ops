#!/usr/bin/env node
/**
 * [validate-deployment] Deterministic deployment-uniformity gate.
 *
 * Asserts a `.gitlab-ci.yml` matches the canonical pipeline policy in
 * `scripts/lib/deployment-policy.js` (standard stages, the binding components,
 * environment scoping, and manual+protected production). Exits non-zero on any
 * deviation so deployment is uniform across the estate. Runs locally (the agent
 * before an MR) and in the `structure-conformance` CI component.
 *
 * Usage: node scripts/validate-deployment.js --path .gitlab-ci.yml
 */
'use strict';

const fs = require('fs');
const { evaluate } = require('./lib/deployment-policy.js');

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--path') out.path = argv[++i];
  }
  return out;
}

function main(argv) {
  const args = parseArgs(argv);
  if (!args.path) {
    process.stderr.write('Usage: validate-deployment.js --path <.gitlab-ci.yml>\n');
    return 2;
  }
  if (!fs.existsSync(args.path)) {
    process.stderr.write(`❌ DEPLOYMENT POLICY: file not found: ${args.path}\n`);
    return 1;
  }
  const { ok, errors } = evaluate(fs.readFileSync(args.path, 'utf8'));
  if (!ok) {
    process.stderr.write(`❌ DEPLOYMENT NON-UNIFORM at ${args.path}:\n`);
    errors.forEach((e) => process.stderr.write(`   - ${e}\n`));
    process.stderr.write('Match the canonical pipeline shape; deployment uniformity is not optional.\n');
    return 1;
  }
  process.stdout.write(`✅ deployment policy satisfied: ${args.path}\n`);
  return 0;
}

if (require.main === module) {
  process.exit(main(process.argv.slice(2)));
}

module.exports = { parseArgs };
