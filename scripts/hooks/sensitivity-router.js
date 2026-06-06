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
 * Enable: Set INFRA_OPS_SENSITIVITY_ROUTE=1
 * Configure: Set OLLAMA_BASE_URL to local model endpoint
 */

'use strict';

const fs = require('fs');

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
 * instead of merely advising. Off by default to avoid false-positive breakage from
 * the broad keyword set in ordinary corporate work.
 */
function isFailClosed() {
  return /^(1|true|yes)$/i.test(String(process.env.INFRAOPS_SENSITIVE_FAIL_CLOSED || ''));
}

/**
 * Decide what to do with a tool call. Returns:
 *   { action: 'allow' }
 *   { action: 'advise', reason }   non-blocking guidance
 *   { action: 'deny', reason }     block; route to the local lane
 */
function decide(rawInput) {
  if (isDisabled()) return { action: 'allow' };

  let input;
  try {
    input = typeof rawInput === 'string' ? JSON.parse(rawInput) : rawInput;
  } catch {
    return { action: 'allow' };
  }

  const toolInput = (input && input.tool_input) || {};
  let chdDetected = false;

  if (toolInput.file_path && isInZonePath(toolInput.file_path)) chdDetected = true;
  if (toolInput.command && isCHDAdjacent(toolInput.command)) chdDetected = true;
  if (toolInput.content && isCHDAdjacent(toolInput.content)) chdDetected = true;
  if (toolInput.new_string && isCHDAdjacent(toolInput.new_string)) chdDetected = true;
  if (toolInput.query && isCHDAdjacent(toolInput.query)) chdDetected = true;

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
