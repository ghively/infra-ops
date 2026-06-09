#!/usr/bin/env node
/**
 * [block-no-verify] PreToolUse guard against bypassing verification hooks.
 *
 * DESIGN §3 names this hook in the in-zone set. Verification gates (pre-commit,
 * pre-push, the dual-control and boundary guards) only mean something if they
 * cannot be skipped. This hook denies Bash tool calls that try to bypass them —
 * `git commit --no-verify`, `git push --no-verify`, `-n` on a git commit, or
 * neutralizing the hooks path.
 *
 * Useful in both zones, but mandatory in-zone; like the other in-zone guards it is
 * transferred in via `knowledge/hsa-deployment.md` and registered in the HSA's own
 * hooks config (not the corporate `hooks/hooks.json`).
 *
 * Contract (Claude Code hook):
 *   - stdin: JSON { tool_name, tool_input: { command }, ... }
 *   - to BLOCK: print a PreToolUse JSON decision with permissionDecision="deny"
 *   - to ALLOW: exit 0 with no decision (passthrough)
 */
'use strict';

function readStdin() {
  try {
    return require('fs').readFileSync(0, 'utf8');
  } catch {
    return '';
  }
}

// Bypass patterns. Each entry: { re, why } — `re` tested against the command string.
const BYPASS_PATTERNS = [
  { re: /--no-verify\b/, why: '`--no-verify` skips pre-commit/pre-push verification hooks' },
  { re: /\bgit\s+commit\b[^\n|;&]*\s-[a-zA-Z]*n[a-zA-Z]*\b/, why: '`git commit -n` is `--no-verify` (skips hooks)' },
  { re: /core\.hooksPath\s*=\s*(?:\/dev\/null|''|"")/, why: 'neutralizing core.hooksPath disables all git hooks' },
  { re: /\bHUSKY\s*=\s*0\b/, why: 'HUSKY=0 disables Husky verification hooks' },
  { re: /\bPRE_COMMIT_ALLOW_NO_CONFIG\b/, why: 'bypasses pre-commit configuration enforcement' },
];

// Returns { why } on the first bypass match, else null.
function findBypass(command) {
  if (typeof command !== 'string' || !command) return null;
  for (const p of BYPASS_PATTERNS) {
    if (p.re.test(command)) return { why: p.why };
  }
  return null;
}

function deny(reason) {
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'deny',
        permissionDecisionReason: reason,
      },
    })
  );
  process.exit(0);
}

// Core inspection: returns a deny-reason string, or null to allow.
function inspect(payload) {
  const tool = payload.tool_name || payload.toolName || '';
  if (tool && tool !== 'Bash') return null; // only Bash can run git
  const input = payload.tool_input || payload.toolInput || {};
  const command = input.command || '';
  const hit = findBypass(command);
  if (hit) {
    return (
      `[infra-ops] BLOCKED: ${hit.why}. Verification gates are not optional — ` +
      'fix the underlying issue or request a documented, audited exception rather than bypassing.'
    );
  }
  return null;
}

function main() {
  const raw = readStdin();
  if (!raw) process.exit(0);
  let payload;
  try {
    payload = JSON.parse(raw);
  } catch {
    process.exit(0); // can't inspect a non-JSON payload; allow (this guard is not a DLP)
  }
  const reason = inspect(payload);
  if (reason) deny(reason);
  process.exit(0);
}

if (require.main === module) {
  main();
}

module.exports = { findBypass, inspect };
