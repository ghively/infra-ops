#!/usr/bin/env node
/**
 * [preflight] Fail-fast environment + working-state checklist.
 *
 * Run before the agent authors/changes anything: it surfaces the broken-environment
 * failures (wrong branch, dirty tree, staged secret, missing tool, leftover scaffold
 * placeholder) up front instead of mid-task. `/preflight` calls it.
 *
 * Hard checks failing => exit 1. Warnings (recommended tools, dirty tree) => exit 0 but
 * reported. `--branch <name>` asserts the current branch.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { findPlaceholders } = require('./scaffold.js');

function run(cmd) {
  try {
    return { ok: true, out: execSync(cmd, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim() };
  } catch (err) {
    return { ok: false, out: (err.stdout || '').toString().trim() };
  }
}

function hasTool(name) {
  return run(`command -v ${name}`).ok;
}

const SKIP_DIRS = new Set(['node_modules', '.git', 'templates', 'coverage', '.venv']);
// Executable IaC/code only — prose (.md) legitimately documents placeholder tokens, so
// scanning it produces false positives. A scaffolded unit's README is checked at
// scaffold time instead (scripts/scaffold.js).
const TEXT_EXT = new Set(['.yml', '.yaml', '.tf', '.tfvars', '.hcl', '.sh', '.bash', '.ps1', '.py', '.cfg', '.ini', '.toml']);

// Scan the working tree for leftover canonical placeholders (excludes templates/).
function scanTreePlaceholders(root) {
  const hits = [];
  const walk = (dir) => {
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      if (e.isDirectory()) {
        if (!SKIP_DIRS.has(e.name) && !e.name.startsWith('.')) walk(path.join(dir, e.name));
        continue;
      }
      if (!TEXT_EXT.has(path.extname(e.name))) continue;
      const p = path.join(dir, e.name);
      let body;
      try { body = fs.readFileSync(p, 'utf8'); } catch { continue; }
      const found = findPlaceholders(body);
      if (found.length) hits.push({ file: path.relative(root, p), placeholders: found });
    }
  };
  walk(root);
  return hits;
}

// Classify a list of {level, ok} checks. Returns { ok, hard, warnings }.
function summarize(checks) {
  const hard = checks.filter((c) => c.level === 'hard' && !c.ok);
  const warnings = checks.filter((c) => c.level === 'warn' && !c.ok);
  return { ok: hard.length === 0, hard, warnings };
}

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--branch') out.branch = argv[++i];
    else if (argv[i] === '--path') out.path = argv[++i];
  }
  return out;
}

function buildChecks(root, expectedBranch) {
  const checks = [];
  const add = (id, level, ok, detail) => checks.push({ id, level, ok, detail });

  // Runtime
  const major = parseInt(process.versions.node.split('.')[0], 10);
  add('node>=18', 'hard', major >= 18, `node ${process.versions.node}`);

  // Git state
  const inRepo = run('git rev-parse --is-inside-work-tree').ok;
  add('git-repo', 'hard', inRepo, inRepo ? 'inside a git repo' : 'not a git repo');
  if (inRepo) {
    const branch = run('git rev-parse --abbrev-ref HEAD').out;
    add('branch', 'warn', !expectedBranch || branch === expectedBranch, `on ${branch}${expectedBranch ? ` (expected ${expectedBranch})` : ''}`);
    const dirty = run('git status --porcelain').out;
    add('clean-tree', 'warn', dirty === '', dirty === '' ? 'clean' : 'uncommitted changes present');
    // Staged-secret tripwire (high-confidence patterns only).
    const staged = run('git diff --cached -U0').out;
    const secret = /AKIA[0-9A-Z]{16}|-----BEGIN[A-Z ]*PRIVATE KEY-----|\bgh[pousr]_[A-Za-z0-9]{20,}\b/.test(staged);
    add('no-staged-secrets', 'hard', !secret, secret ? 'a likely secret is staged — unstage and use Vault' : 'no obvious staged secret');
  }

  // Recommended tools (environment varies → warnings, not hard)
  for (const t of ['ansible-lint', 'yamllint', 'ansible-playbook']) add(`tool:${t}`, 'warn', hasTool(t), hasTool(t) ? 'present' : 'missing (recommended)');
  add('tool:terraform|tofu', 'warn', hasTool('tofu') || hasTool('terraform'), (hasTool('tofu') || hasTool('terraform')) ? 'present' : 'missing (recommended for TF/OpenTofu)');

  // Leftover scaffold placeholders anywhere in the tree (excludes templates/)
  const placeholders = scanTreePlaceholders(root);
  add('no-leftover-placeholders', 'hard', placeholders.length === 0,
    placeholders.length === 0 ? 'none' : `${placeholders.length} file(s): ${placeholders.slice(0, 5).map((h) => h.file).join(', ')}`);

  return checks;
}

function main(argv) {
  const args = parseArgs(argv);
  const root = args.path || process.cwd();
  const checks = buildChecks(root, args.branch);
  const { ok, hard, warnings } = summarize(checks);

  for (const c of checks) {
    const mark = c.ok ? '✅' : (c.level === 'hard' ? '❌' : '⚠️ ');
    process.stdout.write(`${mark} ${c.id}: ${c.detail}\n`);
  }
  process.stdout.write(`\npreflight: ${ok ? 'READY' : 'BLOCKED'} (${hard.length} hard failure(s), ${warnings.length} warning(s))\n`);
  return ok ? 0 : 1;
}

if (require.main === module) {
  process.exit(main(process.argv.slice(2)));
}

module.exports = { scanTreePlaceholders, summarize, parseArgs, buildChecks };
