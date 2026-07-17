#!/usr/bin/env node
/**
 * Infra-Ops Sensitivity Router Hook
 *
 * PreToolUse hook that routes CHD-adjacent (Cardholder Data) operations
 * to the local inference lane (Ollama) instead of cloud models.
 *
 * This hook enforces zone separation per PCI Card Production requirements:
 * - Corporate zone: Cloud model allowed
 * - CHD-adjacent work: Must use local-only model
 *
 * CHD routing: active by default. Set INFRAOPS_SENSITIVE_FAIL_CLOSED=0 for advisory mode.
 * Configure: Set OLLAMA_BASE_URL to local model endpoint
 */

'use strict';

// Keywords that indicate CHD-adjacent work
const CHD_KEYWORDS = [
  'cardholder',
  'pan',
  'cvv',
  'cvc',
  'pin',
  'chd',
  'sad',
  'track',
  'magnetic stripe',
  'emv',
  'personalization',
  'hsm',
  'key block',
  'tmk',
  'zak',
  'pek',
  'card production',
  'high security area',
  'hsa',
  'cpsa'
];

// Files in the in-zone path (air-gapped environment)
const IN_ZONE_PATHS = [
  '/zone/',
  '/hsa/',
  '/production/',
  '/card-production/',
  '\\zone\\',
  '\\hsa\\',
  '\\production\\',
  '\\card-production\\'
];

/**
 * Check if a prompt contains CHD-adjacent keywords.
 */
function isCHDAdjacent(text) {
  if (!text || typeof text !== 'string') {
    return false;
  }
  const normalized = text.toLowerCase();
  return CHD_KEYWORDS.some(keyword => normalized.includes(keyword));
}

/**
 * Check if a file path is in the in-zone/production area.
 */
function isInZonePath(filePath) {
  if (!filePath || typeof filePath !== 'string') {
    return false;
  }
  const normalized = filePath.toLowerCase();
  return IN_ZONE_PATHS.some(zonePath => normalized.includes(zonePath));
}

/**
 * Check if the local inference lane is available (OLLAMA_BASE_URL configured).
 */
function isLocalModelAvailable() {
  return !!process.env.OLLAMA_BASE_URL;
}

/**
 * Is the router globally disabled? Active by default; set INFRAOPS_SENSITIVITY_ROUTE=0
 * to turn it off entirely. (Legacy INFRA_OPS_SENSITIVITY_ROUTE is still honored.)
 */
function isDisabled() {
  const v = process.env.INFRAOPS_SENSITIVITY_ROUTE ?? process.env.INFRA_OPS_SENSITIVITY_ROUTE;
  return String(v ?? '').toLowerCase() === '0';
}

/**
 * Fail-closed mode: DENY CHD-adjacent tool calls (for hardened / in-zone operation)
 * instead of merely advising. On by default for PCI-scope CDE use. Set
 * INFRAOPS_SENSITIVE_FAIL_CLOSED=0 to switch to advisory mode.
 */
function isFailClosed() {
  return !/^(0|false|no)$/i.test(String(process.env.INFRAOPS_SENSITIVE_FAIL_CLOSED ?? '1'));
}

/**
 * Decide what to do with a tool call. Returns:
 *   { action: 'allow' }
 *   { action: 'advise', reason }   non-blocking guidance
 *   { action: 'deny', reason }     block; route to the local lane
 */
/**
 * Recursively collect every string value in a tool_input object/array, so content
 * scanning does not depend on a hardcoded field allowlist. Bounded depth guards
 * against pathological nesting.
 */
function collectStrings(node, depth = 0, out = []) {
  if (depth > 8 || node == null) return out;
  if (typeof node === 'string') { out.push(node); return out; }
  if (Array.isArray(node)) {
    for (const v of node) collectStrings(v, depth + 1, out);
    return out;
  }
  if (typeof node === 'object') {
    for (const v of Object.values(node)) collectStrings(v, depth + 1, out);
  }
  return out;
}

function decide(rawInput) {
  if (isDisabled()) return { action: 'allow' };

  let input;
  try {
    input = typeof rawInput === 'string' ? JSON.parse(rawInput) : rawInput;
  } catch {
    // Fail-open on a malformed payload lets CHD-adjacent work through by simply
    // malforming the input. Under the fail-closed default, deny instead.
    if (isFailClosed()) {
      return {
        action: 'deny',
        reason: '[infra-ops] BLOCKED (fail-closed): sensitivity-router could not parse ' +
          'the tool input to classify CHD-adjacency. Set INFRAOPS_SENSITIVE_FAIL_CLOSED=0 ' +
          'for advisory mode.',
      };
    }
    return { action: 'allow' };
  }

  const toolInput = (input && input.tool_input) || {};
  let chdDetected = false;

  // Path check stays targeted (it's a zone-path test, not a content test).
  if (toolInput.file_path && isInZonePath(toolInput.file_path)) chdDetected = true;

  // Scan ALL string values in the tool input, not a hardcoded field allowlist, so
  // MultiEdit edits[].new_string, Edit old_string, and MCP/WebFetch url/body/prompt
  // fields are covered too.
  if (!chdDetected) {
    for (const value of collectStrings(toolInput)) {
      if (isCHDAdjacent(value)) { chdDetected = true; break; }
    }
  }

  if (!chdDetected) return { action: 'allow' };

  const laneHint = isLocalModelAvailable()
    ? 'Route this work through the local lane: delegate to the sensitive-local-analyst ' +
      'agent or run inference via `node scripts/lib/ollama-router.js`.'
    : 'The local lane is NOT configured (OLLAMA_BASE_URL is unset). Stand up a local ' +
      'Ollama box and export OLLAMA_BASE_URL before processing CHD-adjacent content.';

  const reason = '[infra-ops] CHD-adjacent content detected. ' +
    'CHD-adjacent work must not be processed by a cloud model. ' + laneHint;

  if (isFailClosed()) {
    return { action: 'deny', reason };
  }
  return { action: 'advise', reason };
}

/**
 * Back-compat wrapper: returns the original input (allow) or a deny-decision string.
 */
function run(rawInput) {
  const d = decide(rawInput);
  if (d.action === 'deny') {
    return JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'deny',
        permissionDecisionReason: d.reason,
      },
    });
  }
  if (d.action === 'advise') {
    process.stderr.write('[sensitivity-router] ' + d.reason + '\n');
  }
  return rawInput;
}

/**
 * Stdin entry point.
 */
if (require.main === module) {
  let raw = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', chunk => { raw += chunk; });
  process.stdin.on('end', () => {
    const d = decide(raw);
    if (d.action === 'deny') {
      process.stdout.write(JSON.stringify({
        hookSpecificOutput: {
          hookEventName: 'PreToolUse',
          permissionDecision: 'deny',
          permissionDecisionReason: d.reason,
        },
      }));
    } else if (d.action === 'advise') {
      process.stderr.write('[sensitivity-router] ' + d.reason + '\n');
    }
    // allow → no stdout (passthrough)
    process.exit(0);
  });
}

module.exports = {
  isCHDAdjacent,
  isInZonePath,
  isLocalModelAvailable,
  isFailClosed,
  decide,
  run
};
