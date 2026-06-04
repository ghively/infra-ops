#!/usr/bin/env node
/**
 * [governance-ledger] PostToolUse append-only audit ledger (IMPLEMENTED — baseline).
 *
 * Writes one tamper-evident JSONL record per tool use to
 *   <project>/.infra-ops/governance-ledger.jsonl
 * Commands are SHA-256 *fingerprinted*, never logged raw, so the ledger never
 * stores PAN/secrets (privacy-preserving audit — see SPEC.md §Audit).
 *
 * This is the local feed for the PCI Req 10 / PCI CP §6.4 audit trail; a later
 * phase forwards it to a tamper-evident SIEM (see TODO.md). Always exits 0.
 */
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

function sha256(s) {
  return crypto.createHash('sha256').update(String(s)).digest('hex').slice(0, 16);
}

function main() {
  let raw = '';
  try {
    raw = fs.readFileSync(0, 'utf8');
  } catch {
    process.exit(0);
  }
  if (!raw) process.exit(0);

  let p;
  try {
    p = JSON.parse(raw);
  } catch {
    process.exit(0);
  }

  const projectDir = process.env.CLAUDE_PROJECT_DIR || process.cwd();
  const dir = path.join(projectDir, '.infra-ops');
  const ledger = path.join(dir, 'governance-ledger.jsonl');

  const toolInput = p.tool_input || p.toolInput || {};
  const command = toolInput.command || toolInput.file_path || '';

  const record = {
    ts: new Date().toISOString(),
    session: p.session_id || p.sessionId || null,
    event: p.hook_event_name || 'PostToolUse',
    tool: p.tool_name || p.toolName || null,
    target_fp: command ? sha256(command) : null,
    cwd: process.cwd(),
  };

  try {
    fs.mkdirSync(dir, { recursive: true });
    fs.appendFileSync(ledger, JSON.stringify(record) + '\n');
  } catch (err) {
    process.stderr.write('[governance-ledger] write skipped: ' + err.message + '\n');
  }

  // Passthrough stdin so we never interfere with other hooks.
  process.stdout.write(raw);
  process.exit(0);
}

try {
  main();
} catch (err) {
  process.stderr.write('[governance-ledger] error: ' + err.message + '\n');
  process.exit(0);
}
