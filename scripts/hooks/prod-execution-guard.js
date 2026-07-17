#!/usr/bin/env node
/**
 * infra-ops — Prod-Execution Guard (PreToolUse, Bash)
 *
 * Enforces hard rule #1 ("propose, never dispose") at the tool boundary, symmetric
 * with pan-egress-filter enforcing rule #2. The agent may edit code, open MRs, and
 * trigger a gated Dev deploy — it must never run `ansible-playbook` against
 * test/staging/prod, and never auto-promote. That rule previously lived only in
 * CLAUDE.md prose (the softest enforcement layer); this hook makes it binding.
 *
 * Policy (deny-by-default for mutating runs):
 *   - `ansible-playbook … --check` / `--syntax-check`  → ALLOW (non-mutating; drift
 *     detection legitimately runs check-mode against real inventories).
 *   - `ansible-playbook -i <dev-inventory> …`           → ALLOW (Dev is permitted).
 *   - `ansible-playbook` with a non-dev or absent inventory → DENY.
 *   - recognized promotion commands (octopus promote / release deploy to non-dev) → DENY.
 *
 * Dev inventories: default substrings dev|development|local|localhost|sandbox|poc.
 * Override with INFRAOPS_DEV_INVENTORY (comma-separated substrings).
 *
 * Toggle: INFRAOPS_PROD_EXEC_GUARD=0 disables (fail-open) for break-glass; default on.
 * Design basis: SPEC §2 rule #1; docs/decisions/2026-07-17-prod-execution-prevention-hook.md.
 */

'use strict';

function isDisabled() {
  return /^(0|false|no|off)$/i.test(String(process.env.INFRAOPS_PROD_EXEC_GUARD ?? '1'));
}

function devInventorySubstrings() {
  const raw = process.env.INFRAOPS_DEV_INVENTORY;
  if (raw && raw.trim()) {
    return raw.split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
  }
  return ['dev', 'development', 'local', 'localhost', 'sandbox', 'poc'];
}

// Split a shell command into tokens (whitespace; strips surrounding quotes).
function tokenize(command) {
  const out = [];
  const re = /"([^"]*)"|'([^']*)'|(\S+)/g;
  let m;
  while ((m = re.exec(command)) !== null) {
    out.push(m[1] ?? m[2] ?? m[3]);
  }
  return out;
}

// Extract inventory value(s) from `-i X`, `--inventory X`, `--inventory=X`.
function inventoryTargets(tokens) {
  const targets = [];
  for (let i = 0; i < tokens.length; i += 1) {
    const t = tokens[i];
    if (t === '-i' || t === '--inventory') {
      if (tokens[i + 1] !== undefined) targets.push(tokens[i + 1]);
    } else if (t.startsWith('--inventory=')) {
      targets.push(t.slice('--inventory='.length));
    } else if (t.startsWith('-i=')) {
      targets.push(t.slice('-i='.length));
    }
  }
  return targets;
}

function isCheckModeOnly(tokens) {
  return tokens.includes('--check') || tokens.includes('--syntax-check') || tokens.includes('-C');
}

function isDevInventory(target) {
  const t = String(target).toLowerCase();
  return devInventorySubstrings().some(sub => t.includes(sub));
}

// Recognized non-dev promotion attempts (conservative).
const PROMOTION_PATTERNS = [
  /\bocto(?:pus)?\b[^\n]*\b(?:promote|deploy-release|create-release)\b/i,
  /\bansible-playbook\b[^\n]*\b(?:promote|promotion)\b/i,
];

/**
 * @returns {{action:'allow'}|{action:'deny',reason:string}}
 */
function decide(rawInput) {
  if (isDisabled()) return { action: 'allow' };

  let input;
  try {
    input = typeof rawInput === 'string' ? JSON.parse(rawInput) : rawInput;
  } catch {
    // A Bash command we cannot parse is not something we can clear — fail closed.
    return {
      action: 'deny',
      reason: '[infra-ops] BLOCKED (fail-closed): prod-execution-guard could not parse the ' +
        'tool input. Set INFRAOPS_PROD_EXEC_GUARD=0 for break-glass.',
    };
  }

  const toolName = (input && input.tool_name) || '';
  if (toolName.toLowerCase() !== 'bash') return { action: 'allow' };
  const command = ((input.tool_input || {}).command) || '';
  if (!command) return { action: 'allow' };

  for (const re of PROMOTION_PATTERNS) {
    if (re.test(command)) {
      return {
        action: 'deny',
        reason: '[infra-ops] BLOCKED: promotion/release-deploy is human-gated (GitLab ' +
          'approvals + Octopus manual intervention). The agent proposes; it never promotes. ' +
          '(SPEC §2 rule #1.)',
      };
    }
  }

  // Only ansible-playbook execution is gated here (ansible-lint / --syntax-check tooling
  // is handled elsewhere; this targets the run-against-an-inventory case).
  if (!/\bansible-playbook\b/.test(command)) return { action: 'allow' };

  const tokens = tokenize(command);
  if (isCheckModeOnly(tokens)) return { action: 'allow' }; // check/syntax = non-mutating

  const targets = inventoryTargets(tokens);
  if (targets.length > 0 && targets.every(isDevInventory)) {
    return { action: 'allow' }; // explicit Dev target(s)
  }

  const detail = targets.length > 0
    ? `inventory "${targets.join(', ')}" is not a recognized Dev inventory`
    : 'no Dev inventory was specified';
  return {
    action: 'deny',
    reason: '[infra-ops] BLOCKED: `ansible-playbook` may only run against a Dev inventory ' +
      `(${detail}). The agent never applies to test/staging/prod — promotion is human-gated ` +
      '(SPEC §2 rule #1). Use `--check`/`--syntax-check` for a dry run, target a Dev inventory, ' +
      'or set INFRAOPS_DEV_INVENTORY / INFRAOPS_PROD_EXEC_GUARD=0 for break-glass.',
  };
}

if (require.main === module) {
  let raw = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', chunk => { raw += chunk; });
  process.stdin.on('end', () => {
    let d;
    try {
      d = decide(raw);
    } catch (err) {
      process.stderr.write('[prod-execution-guard] internal error, allowing: ' + err.message + '\n');
      process.exit(0);
      return;
    }
    if (d.action === 'deny') {
      process.stdout.write(JSON.stringify({
        hookSpecificOutput: {
          hookEventName: 'PreToolUse',
          permissionDecision: 'deny',
          permissionDecisionReason: d.reason,
        },
      }));
    }
    process.exit(0);
  });
}

module.exports = { decide, isDevInventory, inventoryTargets, tokenize };
