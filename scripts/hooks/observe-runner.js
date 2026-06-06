#!/usr/bin/env node
/**
 * Infra-Ops Observation Hook
 *
 * PostToolUse hook that captures tool usage patterns for continuous learning.
 * Writes observations to the State Store observations collection.
 *
 * Enable: Set INFRAOPS_OBSERVE=1 (legacy INFRA_OPS_OBSERVE still honored)
 */

'use strict';

const crypto = require('crypto');

// State store integration (lazy load to avoid startup overhead)
let StateStore;

function getStateStore() {
  if (!StateStore) {
    try {
      StateStore = require('../lib/state-store.js');
    } catch (_) {
      return null;
    }
  }
  return StateStore;
}

/**
 * Generate a unique observation ID.
 */
function generateObservationId() {
  return `obs-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
}

/**
 * Extract tool sequence from hook input.
 */
function extractToolSequence(input) {
  const toolName = input.tool_name || '';
  const toolInput = input.tool_input || {};

  // For Bash: capture command fingerprint
  if (toolName === 'Bash') {
    const command = toolInput.command || '';
    return {
      tool: 'bash',
      fingerprint: crypto.createHash('sha256').update(command).digest('hex').slice(0, 12),
      commandName: command.trim().split(/\s+/)[0] || null
    };
  }

  // For Edit/Write: capture file path
  if (toolName === 'Edit' || toolName === 'Write') {
    const filePath = toolInput.file_path || '';
    return {
      tool: toolName.toLowerCase(),
      filePath,
      extension: filePath.split('.').pop().toLowerCase()
    };
  }

  // For Read: capture file path
  if (toolName === 'Read') {
    const filePath = toolInput.file_path || '';
    return {
      tool: 'read',
      filePath,
      extension: filePath.split('.').pop().toLowerCase()
    };
  }

  // Default: just tool name
  return {
    tool: toolName.toLowerCase()
  };
}

/**
 * Record an observation to the State Store.
 */
async function recordObservation(toolSequence, sessionId) {
  const store = getStateStore();
  if (!store) {
    return;
  }

  try {
    await store.observations.add({
      id: generateObservationId(),
      sessionId: sessionId || null,
      timestamp: new Date().toISOString(),
      ...toolSequence
    });
  } catch (error) {
    // Silently fail - never block the tool pipeline
    process.stderr.write(`[observe] Failed to record observation: ${error.message}\n`);
  }
}

/**
 * Resolve session ID from environment or input.
 */
function resolveSessionId(input) {
  return (
    (input && input.sessionId) ||
    process.env.CLAUDE_SESSION_ID ||
    process.env.INFRAOPS_SESSION_ID ||
    process.env.INFRA_OPS_SESSION_ID ||
    null
  );
}

/**
 * Core hook logic.
 */
async function run(rawInput) {
  // Gate on feature flag (INFRAOPS_* canonical; legacy INFRA_OPS_* honored).
  const observeOn = [process.env.INFRAOPS_OBSERVE, process.env.INFRA_OPS_OBSERVE]
    .some((v) => String(v || '').toLowerCase() === '1');
  if (!observeOn) {
    return rawInput;
  }

  let input;
  try {
    input = typeof rawInput === 'string' ? JSON.parse(rawInput) : rawInput;
  } catch {
    return rawInput;
  }

  const sessionId = resolveSessionId(input);
  const toolSequence = extractToolSequence(input);

  if (toolSequence && toolSequence.tool) {
    // Record asynchronously, don't block
    recordObservation(toolSequence, sessionId).catch(() => {
      /* ignore */
    });
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
  process.stdin.on('end', async () => {
    const result = await run(raw);
    process.stdout.write(result);
  });
}

module.exports = {
  extractToolSequence,
  generateObservationId,
  recordObservation,
  run
};
