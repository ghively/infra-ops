#!/usr/bin/env node
/**
 * [merge-gate] Deterministic review-gate decision (CLI).
 *
 * Computes the merge decision from the three reviewer verdicts per the no-discretion
 * rule in CLAUDE.md. The orchestrator runs this instead of judging by hand.
 *
 * Usage:
 *   node scripts/merge-gate.js --verdicts PASS,WARN,PASS [--cycle 1]
 *   node scripts/merge-gate.js --file r1.txt --file r2.txt --file r3.txt [--cycle 2]
 *
 * Exit codes: 0 = cleared (PASS/WARN) · 1 = BLOCK (return to iac-author, revise) ·
 *             3 = ESCALATE (revision cap reached — human required).
 */
'use strict';

const fs = require('fs');
const { parseVerdict, decide } = require('./lib/merge-gate.js');

function parseArgs(argv) {
  const out = { files: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--verdicts') out.verdicts = (argv[++i] || '').split(',').map((s) => s.trim()).filter(Boolean);
    else if (a === '--file') out.files.push(argv[++i]);
    else if (a === '--cycle') out.cycle = parseInt(argv[++i], 10) || 1;
  }
  return out;
}

function main(argv) {
  const args = parseArgs(argv);
  let verdicts = args.verdicts || [];
  for (const f of args.files) {
    if (!fs.existsSync(f)) {
      process.stderr.write(`merge-gate: reviewer file not found: ${f}\n`);
      verdicts.push(null); // missing file = missing verdict = incomplete
      continue;
    }
    verdicts.push(parseVerdict(fs.readFileSync(f, 'utf8')));
  }
  if (verdicts.length === 0) {
    process.stderr.write('Usage: merge-gate.js --verdicts PASS,WARN,PASS [--cycle N]  (or --file ... x3)\n');
    return 2;
  }

  const res = decide(verdicts, { cycle: args.cycle || 1 });
  const line = `MERGE-GATE: ${res.decision} (verdicts: ${res.verdicts.map((v) => v || '—').join(', ')}; cycle ${res.cycle})`;
  if (res.cleared) {
    process.stdout.write(`✅ ${line}\n`);
    res.reasons.forEach((r) => process.stdout.write(`   - ${r}\n`));
    return 0;
  }
  process.stderr.write(`❌ ${line}\n`);
  res.reasons.forEach((r) => process.stderr.write(`   - ${r}\n`));
  return res.escalate ? 3 : 1;
}

if (require.main === module) {
  process.exit(main(process.argv.slice(2)));
}

module.exports = { parseArgs };
