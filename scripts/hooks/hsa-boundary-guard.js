#!/usr/bin/env node
/**
 * [hsa-boundary-guard] In-zone (HSA) PreToolUse boundary guard.
 *
 * DESIGN §3 names this hook: "block any key/PAN/HSM reference" inside the
 * air-gapped High Security Area. It is the runtime tripwire for CLAUDE.md hard
 * rule #2 (never touch the crown jewels) and DESIGN line 114 (no PAN · no
 * keys/components · no PINs · no HSM config).
 *
 * This is an IN-ZONE hook. It is intentionally NOT wired into the corporate
 * `hooks/hooks.json`; it belongs to the air-gapped HSA's own hooks config and is
 * transferred in per `knowledge/hsa-deployment.md`. The corporate DLP tripwire is
 * `pan-egress-filter.js`; this guard is stricter (fail-closed by default) and adds
 * key/PIN/HSM reference detection that has no place in the HSA tool context.
 *
 * Contract (Claude Code hook):
 *   - stdin: JSON { tool_name, tool_input, ... }
 *   - to BLOCK: print a PreToolUse JSON decision with permissionDecision="deny"
 *   - to ALLOW: exit 0 with no decision (passthrough)
 *
 * Failure policy: fail-CLOSED by default (the HSA is the strictest zone) — if the
 * input cannot be inspected, DENY. Set INFRAOPS_HSA_GUARD_FAIL_OPEN=1 to relax to
 * fail-open (not recommended in-zone).
 */
'use strict';

function failOpenEnabled() {
  return /^(1|true|yes)$/i.test(String(process.env.INFRAOPS_HSA_GUARD_FAIL_OPEN || ''));
}

function readStdin() {
  try {
    return require('fs').readFileSync(0, 'utf8');
  } catch {
    return '';
  }
}

// Luhn check over a digit string (PAN detection).
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

function containsPan(text) {
  const re = /\b(?:\d[ -]?){13,19}\b/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    const digits = m[0].replace(/[ -]/g, '');
    if (digits.length >= 13 && digits.length <= 19 && luhnValid(digits)) return true;
  }
  return false;
}

// Crown-jewels reference categories. These are high-signal terms whose presence in
// an HSA tool context is itself a boundary violation — the guard is a deliberate
// tripwire, so it errs toward blocking (a human confirms false positives).
const CATEGORIES = [
  {
    name: 'cryptographic key material',
    patterns: [
      /-----BEGIN[A-Z0-9 ]*PRIVATE KEY-----/,
      /\bkey[\s_-]?component\b/i,
      /\bclear[\s_-]?key\b/i,
      /\bkey[\s_-]?ceremony\b/i,
      /\bsplit[\s_-]?knowledge\b/i,
      /\b(?:ZMK|ZPK|BDK|TMK|TPK|KEK|DUKPT|LMK)\b/, // payment key types
    ],
  },
  {
    name: 'PIN data',
    patterns: [
      /\bPIN[\s_-]?block\b/i,
      /\bPIN[\s_-]?offset\b/i,
      /\b(?:PVV|PVKI|CVK)\b/,
      /\bencrypt(?:ed|ing)?[\s_-]+PIN\b/i,
    ],
  },
  {
    name: 'HSM configuration',
    patterns: [
      /\bHSM\b/,
      /\b(?:Thales|SafeNet|payShield|nCipher|Luna)\b/i,
      /\bpartition[\s_-]?(?:password|policy|config)\b/i,
    ],
  },
];

// Returns { category, pattern } on the first crown-jewels hit, else null.
function findCrownJewels(text) {
  if (containsPan(text)) return { category: 'cardholder PAN (Luhn-valid)', pattern: 'PAN' };
  for (const cat of CATEGORIES) {
    for (const re of cat.patterns) {
      if (re.test(text)) return { category: cat.name, pattern: re.source };
    }
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
  let blob = '';
  try {
    blob = JSON.stringify(payload.tool_input || payload.toolInput || payload || {});
  } catch {
    return failOpenEnabled() ? null : '[infra-ops/hsa] BLOCKED (fail-closed): tool input could not be serialized for boundary inspection.';
  }
  const hit = findCrownJewels(blob);
  if (hit) {
    return (
      `[infra-ops/hsa] BLOCKED: tool input references ${hit.category}. ` +
      'The HSA boundary forbids PAN, keys/components, PINs, and HSM configuration in any ' +
      'tool/model context (CLAUDE.md rule #2; DESIGN line 114). This is a human, ' +
      'dual-control, split-knowledge ceremony — never an agent tool call.'
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
  } catch (err) {
    if (!failOpenEnabled()) {
      deny('[infra-ops/hsa] BLOCKED (fail-closed): could not parse tool input for boundary inspection. ' + err.message);
    }
    process.stderr.write('[hsa-boundary-guard] parse error; allowing (fail-open): ' + err.message + '\n');
    process.exit(0);
  }

  const reason = inspect(payload);
  if (reason) deny(reason);
  process.exit(0);
}

if (require.main === module) {
  try {
    main();
  } catch (err) {
    if (!failOpenEnabled()) {
      deny('[infra-ops/hsa] BLOCKED (fail-closed): boundary guard internal error. ' + err.message);
    }
    process.stderr.write('[hsa-boundary-guard] internal error; allowing (fail-open): ' + err.message + '\n');
    process.exit(0);
  }
}

module.exports = { luhnValid, containsPan, findCrownJewels, inspect };
