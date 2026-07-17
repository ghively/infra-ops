#!/usr/bin/env node
/**
 * infra-ops — CHD Ingress Classifier (UserPromptSubmit)
 *
 * Implements the intake boundary from decision
 * 2026-07-17-disambiguate-local-lane.md (chosen option: build the ingress classifier
 * now). The PreToolUse DLP/sensitivity hooks act at tool-call EGRESS — but in a chat
 * agent, CHD-adjacent content enters at the PROMPT, which the cloud orchestrator has
 * already seen by the time any tool runs. This hook classifies content at intake:
 * UserPromptSubmit fires before the model processes the prompt, so a CHD-adjacent
 * prompt can be refused before it reaches the cloud model at all.
 *
 * Scope + honest limitation: this gates the USER-PROMPT channel. Content that enters
 * via tool results (file reads, MCP responses) is a separate channel still covered by
 * the PreToolUse pan-egress-filter + sensitivity-router. Full intake coverage of every
 * channel is not achievable from a single hook point; this closes the primary one.
 *
 * Behavior: under the fail-closed default (INFRAOPS_SENSITIVE_FAIL_CLOSED=1) a
 * CHD-adjacent prompt is BLOCKED with routing guidance to the local lane. In advisory
 * mode it injects a warning as additional context but allows the prompt.
 *
 * Toggle: shares INFRAOPS_SENSITIVE_FAIL_CLOSED with the router (default fail-closed).
 * Disable entirely with INFRAOPS_CHD_INGRESS=0.
 */

'use strict';

let isCHDAdjacent;
try {
  ({ isCHDAdjacent } = require('./sensitivity-router.js'));
} catch {
  isCHDAdjacent = () => false; // if the router is unavailable, do not block prompts
}

function isDisabled() {
  return /^(0|false|no|off)$/i.test(String(process.env.INFRAOPS_CHD_INGRESS ?? '1'));
}

function isFailClosed() {
  return !/^(0|false|no)$/i.test(String(process.env.INFRAOPS_SENSITIVE_FAIL_CLOSED ?? '1'));
}

const BLOCK_REASON =
  '[infra-ops] BLOCKED at intake: this prompt contains CHD-adjacent content, which must ' +
  'not enter a cloud model. Route this work through the local lane (delegate to ' +
  'sensitive-local-analyst / run `node scripts/lib/ollama-router.js`) or, for in-zone ' +
  'work, use the air-gapped HSA orchestrator. Set INFRAOPS_SENSITIVE_FAIL_CLOSED=0 for ' +
  'advisory mode, or INFRAOPS_CHD_INGRESS=0 to disable this intake check.';

/**
 * @returns {{action:'allow'}|{action:'block',reason}|{action:'advise',reason}}
 */
function decide(rawInput) {
  if (isDisabled()) return { action: 'allow' };

  let prompt = '';
  try {
    const input = typeof rawInput === 'string' ? JSON.parse(rawInput) : rawInput;
    prompt = (input && (input.prompt || input.user_prompt || input.text)) || '';
  } catch {
    // A malformed intake payload we cannot classify: fail closed → block; else allow.
    return isFailClosed()
      ? { action: 'block', reason: '[infra-ops] BLOCKED (fail-closed): could not parse the prompt for CHD-adjacency classification.' }
      : { action: 'allow' };
  }

  if (!prompt || !isCHDAdjacent(prompt)) return { action: 'allow' };
  return isFailClosed() ? { action: 'block', reason: BLOCK_REASON } : { action: 'advise', reason: BLOCK_REASON };
}

if (require.main === module) {
  let raw = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (chunk) => { raw += chunk; });
  process.stdin.on('end', () => {
    let d;
    try {
      d = decide(raw);
    } catch (err) {
      process.stderr.write('[chd-ingress-classifier] internal error, allowing: ' + err.message + '\n');
      process.exit(0);
      return;
    }
    if (d.action === 'block') {
      // UserPromptSubmit block contract: decision "block" with a reason.
      process.stdout.write(JSON.stringify({ decision: 'block', reason: d.reason }));
    } else if (d.action === 'advise') {
      process.stdout.write(JSON.stringify({
        hookSpecificOutput: { hookEventName: 'UserPromptSubmit', additionalContext: d.reason },
      }));
    }
    // allow → no output
    process.exit(0);
  });
}

module.exports = { decide };
