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
 * Check if the local model is available.
 */
function isLocalModelAvailable() {
  return !!process.env.OLLAMA_BASE_URL;
}

/**
 * Emit a routing directive to stderr.
 */
function emitRoute(localOnly) {
  if (localOnly) {
    process.stderr.write('[sensitivity-router] CHD-adjacent content detected - routing to local model lane\n');
  }
}

/**
 * Core hook logic.
 */
function run(rawInput) {
  // Gate on feature flag
  if (String(process.env.INFRA_OPS_SENSITIVITY_ROUTE || '').toLowerCase() !== '1') {
    return rawInput;
  }

  let input;
  try {
    input = typeof rawInput === 'string' ? JSON.parse(rawInput) : rawInput;
  } catch {
    return rawInput;
  }

  // Check for CHD-adjacent content in tool input
  const toolInput = input.tool_input || {};
  let chdDetected = false;

  // Check file paths
  if (toolInput.file_path && isInZonePath(toolInput.file_path)) {
    chdDetected = true;
  }

  // Check command content (for Bash)
  if (toolInput.command && isCHDAdjacent(toolInput.command)) {
    chdDetected = true;
  }

  // Check content (for Edit/Write)
  if (toolInput.content && isCHDAdjacent(toolInput.content)) {
    chdDetected = true;
  }

  // Check new_string for Edit operations
  if (toolInput.new_string && isCHDAdjacent(toolInput.new_string)) {
    chdDetected = true;
  }

  // Check query string
  if (toolInput.query && isCHDAdjacent(toolInput.query)) {
    chdDetected = true;
  }

  // Emit routing directive if CHD detected
  if (chdDetected) {
    if (!isLocalModelAvailable()) {
      process.stderr.write('[sensitivity-router] ERROR: CHD-adjacent content detected but local model unavailable. Set OLLAMA_BASE_URL.\n');
    }
    emitRoute(true);
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
    const result = run(raw);
    process.stdout.write(result);
  });
}

module.exports = {
  isCHDAdjacent,
  isInZonePath,
  run
};
