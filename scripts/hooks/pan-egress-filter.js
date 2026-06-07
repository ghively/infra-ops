#!/usr/bin/env node
/**
 * [pan-egress-filter] PreToolUse DLP gate (IMPLEMENTED — baseline).
 *
 * Blocks a tool call when its input appears to contain cardholder data (a
 * Luhn-valid PAN) or a high-confidence secret. This is the runtime enforcement
 * of the design rule: "CHD/SAD must never enter a model context or egress to a
 * cloud LLM" (see ../../SPEC.md §Trust boundary; docs/infra-agent/research/pci-*).
 *
 * Contract (Claude Code hook):
 *   - stdin: JSON { tool_name, tool_input, ... }
 *   - to BLOCK: print a PreToolUse JSON decision with permissionDecision="deny"
 *   - to ALLOW: exit 0 with no decision (passthrough)
 *
 * Failure policy: by default, on parse/internal error this DENYs the tool call
 * (fail-closed). Set INFRAOPS_DLP_FAIL_CLOSED=0 to loosen (fail-open) if needed.
 * Fail-closed means any inability to inspect the input results in a DENY rather
 * than a silent allow. See TODO.md / README.
 */
'use strict';

// Fail-closed by default. Set INFRAOPS_DLP_FAIL_CLOSED=0 to loosen (fail-open).
// Any inability to inspect tool input results in DENY unless the operator opts out.
function failClosedEnabled() {
  return !/^(0|false|no)$/i.test(String(process.env.INFRAOPS_DLP_FAIL_CLOSED ?? '1'));
}

function readStdin() {
  try {
    return require('fs').readFileSync(0, 'utf8');
  } catch {
    return '';
  }
}

// Luhn check over a digit string.
function luhnValid(digits) {
  let sum = 0;
  let alt = false;
  for (let i = digits.length - 1; i >= 0; i -= 1) {
    let d = digits.charCodeAt(i) - 48;
    if (d < 0 || d > 9) return false;
    if (alt) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    alt = !alt;
  }
  return sum % 10 === 0;
}

// Find candidate PANs: 13–19 digit runs allowing spaces/dashes as separators.
function containsPan(text) {
  const re = /\b(?:\d[ -]?){13,19}\b/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    const digits = m[0].replace(/[ -]/g, '');
    if (digits.length >= 13 && digits.length <= 19 && luhnValid(digits)) {
      return true;
    }
  }
  return false;
}

// High-confidence secret patterns (defense-in-depth; not exhaustive — see TODO).
const SECRET_PATTERNS = [
  /-----BEGIN[A-Z ]*PRIVATE KEY-----/, // private keys
  /\bAKIA[0-9A-Z]{16}\b/, // AWS access key id
  /\bgh[pousr]_[A-Za-z0-9]{20,}\b/, // GitHub tokens
  /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/, // Slack tokens
  /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{5,}\b/, // JWT
];

function containsSecret(text) {
  return SECRET_PATTERNS.some((re) => re.test(text));
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

function main() {
  const raw = readStdin();
  if (!raw) process.exit(0);

  let payload;
  try {
    payload = JSON.parse(raw);
  } catch (err) {
    if (failClosedEnabled()) {
      deny('[infra-ops] BLOCKED (fail-closed): could not parse tool input for DLP inspection. ' + err.message);
    }
    process.stderr.write('[pan-egress-filter] parse error; allowing (fail-open): ' + err.message + '\n');
    process.exit(0);
  }

  let blob = '';
  try {
    blob = JSON.stringify(payload.tool_input || payload.toolInput || payload || {});
  } catch (err) {
    if (failClosedEnabled()) {
      deny('[infra-ops] BLOCKED (fail-closed): tool input could not be serialized for DLP inspection.');
    }
    process.stderr.write('[pan-egress-filter] serialize error; allowing (fail-open): ' + err.message + '\n');
    process.exit(0);
  }

  if (containsPan(blob)) {
    deny(
      '[infra-ops] BLOCKED: tool input appears to contain a cardholder PAN (Luhn-valid). ' +
        'CHD must never enter a model/tool context. Redact/tokenize at the source, or route ' +
        'this work to the local-only lane (sensitive-local-analyst / in-zone). See SPEC.md.'
    );
  }
  if (containsSecret(blob)) {
    deny(
      '[infra-ops] BLOCKED: tool input appears to contain a secret/credential. ' +
        'Use a Vault reference, never a plaintext value. See SPEC.md §Secrets.'
    );
  }

  process.exit(0);
}

if (require.main === module) {
  try {
    main();
  } catch (err) {
    if (failClosedEnabled()) {
      deny('[infra-ops] BLOCKED (fail-closed): DLP filter internal error. ' + err.message);
    }
    process.stderr.write('[pan-egress-filter] internal error; allowing (fail-open): ' + err.message + '\n');
    process.exit(0);
  }
}

module.exports = { failClosedEnabled, containsPan, containsSecret };
