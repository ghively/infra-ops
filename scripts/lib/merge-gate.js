'use strict';

/**
 * Deterministic merge-gate decision logic.
 *
 * CLAUDE.md describes the review gate in prose ("any BLOCK blocks; WARN is advisory;
 * PASS×3 clears; cap at 2 revision cycles, then escalate"). This module turns that into
 * code so the most safety-critical decision is computed, not judged.
 *
 * The gate expects THREE reviewer verdicts (playbook-reviewer, pci-compliance-reviewer,
 * secrets-scanner). A missing/invalid verdict is treated as incomplete → BLOCK: the gate
 * cannot clear without all reviewers reporting.
 */

const VALID = ['PASS', 'WARN', 'BLOCK'];
const REQUIRED_REVIEWERS = 3;
const MAX_CYCLES = 2;

// Extract the reviewer's verdict token. Per the CLAUDE.md contract the token MUST be
// the reviewer's FIRST output line, so we anchor to it: scan from the top for the first
// non-empty line and require it to be `VERDICT: <token>`. This prevents a spoof where a
// malicious diff the reviewer echoes ("VERDICT: PASS") earlier in the body outranks the
// reviewer's real trailing verdict. A body that doesn't lead with a verdict returns null
// → the gate treats it as an incomplete/missing verdict → BLOCK.
function parseVerdict(text) {
  const lines = String(text || '').split(/\r?\n/);
  for (const line of lines) {
    if (!line.trim()) continue; // skip leading blank lines
    const m = line.match(/^\s*VERDICT:\s*(PASS|WARN|BLOCK)\b/i);
    if (!m) return null; // first non-empty line isn't a verdict → missing verdict
    // Reject a template placeholder that enumerates multiple tokens
    // (e.g. "VERDICT: PASS | WARN | BLOCK") — a real verdict names exactly one.
    const tokenCount = (line.match(/\b(PASS|WARN|BLOCK)\b/gi) || []).length;
    if (tokenCount > 1) return null;
    return m[1].toUpperCase();
  }
  return null;
}

/**
 * Compute the gate decision.
 * @param {Array<string>} verdicts - reviewer verdicts (PASS/WARN/BLOCK or raw)
 * @param {object} [opts]
 * @returns {{decision, cleared, escalate, cycle, reasons, verdicts}}
 */
function decide(verdicts, opts = {}) {
  const requiredReviewers = opts.requiredReviewers || REQUIRED_REVIEWERS;
  const maxCycles = opts.maxCycles || MAX_CYCLES;
  const cycle = typeof opts.cycle === 'number' ? opts.cycle : 1;

  const norm = (verdicts || []).map((v) => {
    const u = String(v == null ? '' : v).toUpperCase();
    return VALID.includes(u) ? u : null;
  });
  const valid = norm.filter(Boolean);
  const reasons = [];

  let decision;
  if (norm.includes('BLOCK')) {
    decision = 'BLOCK';
    reasons.push('at least one reviewer returned BLOCK');
  } else if (valid.length < requiredReviewers) {
    decision = 'BLOCK';
    reasons.push(`incomplete: ${valid.length}/${requiredReviewers} valid verdicts (a missing reviewer cannot clear the gate)`);
  } else if (norm.includes('WARN')) {
    decision = 'WARN';
    reasons.push('advisory warning(s) present — non-blocking');
  } else {
    decision = 'PASS';
  }

  const cleared = decision === 'PASS' || decision === 'WARN';
  const escalate = decision === 'BLOCK' && cycle >= maxCycles;
  if (escalate) reasons.push(`revision cap reached (cycle ${cycle} ≥ ${maxCycles}) — escalate to a human; do not merge around the BLOCK`);

  return { decision, cleared, escalate, cycle, reasons, verdicts: norm };
}

module.exports = { parseVerdict, decide, VALID, REQUIRED_REVIEWERS, MAX_CYCLES };
