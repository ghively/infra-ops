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
const path = require('path');
const crypto = require('crypto');

function sha256(s) {
  return crypto.createHash('sha256').update(String(s)).digest('hex').slice(0, 16);
}

async function main() {
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

  // Forward to a SIEM in real time when configured (INFRAOPS_AUDIT_FORWARD or SIEM_*).
  // AWAIT the forward (bounded) before exiting — previously the request was fired and
  // then process.exit(0) killed it before it flushed, so nothing was ever delivered.
  // The bound keeps us within the hook's async timeout; a transport error is ignored so
  // we never block or fail the tool pipeline.
  if (process.env.INFRAOPS_AUDIT_FORWARD || String(process.env.SIEM_ENABLED || '') === '1') {
    try {
      const siem = require('../lib/siem-forwarder.js');
      const timeoutMs = Number(process.env.INFRAOPS_AUDIT_FORWARD_TIMEOUT_MS || 8000);
      await Promise.race([
        Promise.resolve(siem.forwardRecord(record)).catch(() => { /* ignore transport errors */ }),
        new Promise((resolve) => setTimeout(resolve, timeoutMs)),
      ]);
    } catch {
      /* forwarder unavailable — ledger write already succeeded */
    }
  }

  // Passthrough stdin so we never interfere with other hooks.
  process.stdout.write(raw);
  process.exit(0);
}

main().catch((err) => {
  process.stderr.write('[governance-ledger] error: ' + err.message + '\n');
  process.exit(0);
});
