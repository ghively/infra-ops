#!/usr/bin/env node
/**
 * [scaffold] Deterministic IaC unit scaffolder.
 *
 * Copies the canonical `templates/<type>/`, substitutes name placeholders, then enforces
 * the result: runs validate-structure AND fails on any leftover `__PLACEHOLDER__`. This
 * makes "stamp every unit from the template" a function, not freehand model work — the
 * `/scaffold` command calls it.
 *
 * Usage: node scripts/scaffold.js --type <type> --name <name> --dest <dir>
 * Exit 0 = scaffolded + conforms; non-zero = failed (reasons on stderr).
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { validateStructure } = require('./validate-structure.js');
const { SPECS, TYPES } = require('./lib/structure-spec.js');

const TEMPLATES_DIR = path.resolve(__dirname, '../templates');

// Sanitize a name for use as an identifier (lowercase, non-alnum → underscore).
function sanitize(name) {
  return String(name).toLowerCase().replace(/[^a-z0-9_]+/g, '_').replace(/^_+|_+$/g, '');
}

// Substitute the canonical placeholders in file content.
function substitute(content, name) {
  return String(content)
    .replace(/__ROLE_NAME__/g, name)
    .replace(/__NAME__/g, name)
    .replace(/__role_name__/g, sanitize(name));
}

// Find leftover canonical placeholders (`__UPPER__`). Lowercase `__x` markers in prose
// (e.g. "__double_underscore") are intentionally not matched.
function findPlaceholders(text) {
  const out = new Set();
  const re = /__[A-Z][A-Z0-9_]*__/g;
  let m;
  while ((m = re.exec(String(text))) !== null) out.add(m[0]);
  return [...out];
}

function copyTree(srcDir, destDir, name) {
  fs.mkdirSync(destDir, { recursive: true });
  for (const entry of fs.readdirSync(srcDir, { withFileTypes: true })) {
    const src = path.join(srcDir, entry.name);
    const dest = path.join(destDir, entry.name);
    if (entry.isDirectory()) {
      copyTree(src, dest, name);
    } else {
      fs.writeFileSync(dest, substitute(fs.readFileSync(src, 'utf8'), name));
    }
  }
}

// Scaffold a unit. Returns { ok, dest, errors }.
function scaffold({ type, name, dest }) {
  const errors = [];
  if (!SPECS[type]) return { ok: false, dest, errors: [`unknown type "${type}" (known: ${TYPES.join(', ')})`] };
  if (!name) return { ok: false, dest, errors: ['--name is required'] };
  const templateDir = path.join(TEMPLATES_DIR, type);
  if (!fs.existsSync(templateDir)) return { ok: false, dest, errors: [`template not found: ${templateDir}`] };
  if (fs.existsSync(dest) && fs.readdirSync(dest).length > 0) {
    return { ok: false, dest, errors: [`destination exists and is not empty: ${dest}`] };
  }

  copyTree(templateDir, dest, name);

  // Enforce structure.
  const struct = validateStructure(type, dest);
  if (!struct.ok) errors.push(...struct.errors.map((e) => `structure: ${e}`));

  // Enforce: no unresolved placeholders remain anywhere in the unit.
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, entry.name);
      if (entry.isDirectory()) { walk(p); continue; }
      const left = findPlaceholders(fs.readFileSync(p, 'utf8'));
      if (left.length) errors.push(`unresolved placeholder(s) in ${path.relative(dest, p)}: ${left.join(', ')}`);
    }
  };
  walk(dest);

  return { ok: errors.length === 0, dest, errors };
}

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--type') out.type = argv[++i];
    else if (a === '--name') out.name = argv[++i];
    else if (a === '--dest') out.dest = argv[++i];
  }
  return out;
}

function main(argv) {
  const args = parseArgs(argv);
  if (!args.type || !args.name || !args.dest) {
    process.stderr.write('Usage: scaffold.js --type <type> --name <name> --dest <dir>\n');
    process.stderr.write(`Types: ${TYPES.join(', ')}\n`);
    return 2;
  }
  const res = scaffold(args);
  if (!res.ok) {
    process.stderr.write(`❌ scaffold failed (${args.type} → ${args.dest}):\n`);
    res.errors.forEach((e) => process.stderr.write(`   - ${e}\n`));
    return 1;
  }
  process.stdout.write(`✅ scaffolded ${args.type} → ${args.dest} (conforms, no placeholders left)\n`);
  return 0;
}

if (require.main === module) {
  process.exit(main(process.argv.slice(2)));
}

module.exports = { sanitize, substitute, findPlaceholders, scaffold, parseArgs };
