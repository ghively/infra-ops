#!/usr/bin/env node
/**
 * [validate-structure] Deterministic structure-conformance gate.
 *
 * Asserts that an IaC unit matches the canonical layout in
 * `scripts/lib/structure-spec.js`. This is the enforcement that makes the
 * `iac-author` agent's output *uniform*: the agent scaffolds from `templates/` and
 * runs this before opening an MR, and the `structure-conformance` CI component runs
 * it in the target repo. Any deviation exits non-zero and fails the pipeline.
 *
 * CLI:
 *   node scripts/validate-structure.js --type <type> --path <dir>
 *   node scripts/validate-structure.js --list          # list known types
 *   Exit 0 = conforms; non-zero = deviation (reasons on stderr).
 *
 * Library:
 *   const { validateStructure } = require('./validate-structure.js');
 *   const { ok, errors } = validateStructure('ansible-role', '/path/to/role');
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { SPECS, TYPES } = require('./lib/structure-spec.js');

function isFile(p) {
  try { return fs.statSync(p).isFile(); } catch { return false; }
}

function isDir(p) {
  try { return fs.statSync(p).isDirectory(); } catch { return false; }
}

// Validate a single unit against its spec. Returns { ok, errors: string[] }.
function validateStructure(type, unitPath) {
  const spec = SPECS[type];
  if (!spec) {
    return { ok: false, errors: [`unknown type "${type}" (known: ${TYPES.join(', ')})`] };
  }
  if (!isDir(unitPath)) {
    return { ok: false, errors: [`path is not a directory: ${unitPath}`] };
  }

  const errors = [];

  for (const rel of spec.requiredFiles || []) {
    if (!isFile(path.join(unitPath, rel))) {
      errors.push(`missing required file: ${rel}`);
    }
  }

  for (const rel of spec.requiredDirs || []) {
    if (!isDir(path.join(unitPath, rel))) {
      errors.push(`missing required directory: ${rel}/`);
    }
  }

  for (const check of spec.contentChecks || []) {
    const file = path.join(unitPath, check.file);
    if (!isFile(file)) {
      // A missing file is already reported above if it's required; only flag content
      // when the file exists but doesn't satisfy the assertion.
      continue;
    }
    const body = fs.readFileSync(file, 'utf8');
    if (!new RegExp(check.pattern).test(body)) {
      errors.push(`${check.file}: ${check.why} (expected /${check.pattern}/)`);
    }
  }

  return { ok: errors.length === 0, errors };
}

// ---- CLI ----
function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--list') out.list = true;
    else if (a === '--type') out.type = argv[++i];
    else if (a === '--path') out.path = argv[++i];
  }
  return out;
}

function main(argv) {
  const args = parseArgs(argv);
  if (args.list) {
    process.stdout.write(`Known structure types:\n${TYPES.map((t) => `  - ${t}: ${SPECS[t].description}`).join('\n')}\n`);
    return 0;
  }
  if (!args.type || !args.path) {
    process.stderr.write('Usage: validate-structure.js --type <type> --path <dir>  (or --list)\n');
    return 2;
  }
  const { ok, errors } = validateStructure(args.type, args.path);
  if (!ok) {
    process.stderr.write(`❌ STRUCTURE NON-CONFORMANT (${args.type}) at ${args.path}:\n`);
    errors.forEach((e) => process.stderr.write(`   - ${e}\n`));
    process.stderr.write('Scaffold from templates/ and fix the layout; the structure is not optional.\n');
    return 1;
  }
  process.stdout.write(`✅ structure conforms: ${args.type} @ ${args.path}\n`);
  return 0;
}

if (require.main === module) {
  process.exit(main(process.argv.slice(2)));
}

module.exports = { validateStructure, parseArgs };
