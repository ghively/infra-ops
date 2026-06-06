#!/usr/bin/env node
/**
 * Unit tests for the audit/learning data plane:
 * - governance-capture persists detected events through the unified State Store
 * - siem-forwarder.forwardRecord is a no-op when forwarding is unconfigured
 * - observe-runner records through the unified store when enabled
 */

'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'infra-ops-dp-'));
process.env.INFRAOPS_STATE_DIR = path.join(tmp, 'state');
process.env.INFRAOPS_GOVERNANCE_CAPTURE = '1';
process.env.INFRAOPS_OBSERVE = '1';
delete process.env.INFRAOPS_AUDIT_FORWARD;
delete process.env.SIEM_ENABLED;

const capture = require(path.resolve(__dirname, '../../scripts/hooks/governance-capture.js'));
const observe = require(path.resolve(__dirname, '../../scripts/hooks/observe-runner.js'));
const siem = require(path.resolve(__dirname, '../../scripts/lib/siem-forwarder.js'));
const StateStore = require(path.resolve(__dirname, '../../scripts/lib/state-store.js'));

let passed = 0;
async function check(name, fn) { await fn(); passed += 1; console.log(`  ✓ ${name}`); }

(async () => {
  await check('governance-capture persists a secret_detected event to the store', async () => {
    capture.run(JSON.stringify({
      tool_name: 'Write',
      tool_input: { file_path: 'app.js', content: 'const k = "AKIAIOSFODNN7EXAMPLE"' },
    }));
    // persistence is fire-and-forget; allow the microtask/IO to settle
    await new Promise((r) => setTimeout(r, 50));
    const events = await StateStore.governanceEvents.getAll();
    assert.ok(events.some((e) => e.rule === 'governance-capture' && e.eventType === 'secret_detected'),
      'a secret_detected event should be persisted');
  });

  await check('observe-runner records an observation when enabled', async () => {
    await observe.run(JSON.stringify({ tool_name: 'Bash', tool_input: { command: 'ansible-lint' } }));
    await new Promise((r) => setTimeout(r, 50));
    const obs = await StateStore.observations.getAll();
    assert.ok(obs.length >= 1, 'at least one observation should be recorded');
  });

  await check('siem.forwardRecord is a no-op when forwarding unconfigured', async () => {
    const res = await siem.forwardRecord({ ts: 'now', tool: 'Bash' });
    assert.deepStrictEqual(res, { skipped: true });
  });

  await check('siem config reads INFRAOPS_AUDIT_FORWARD', async () => {
    process.env.INFRAOPS_AUDIT_FORWARD = 'https://siem.example.com/in';
    const cfg = siem.getConfig();
    assert.strictEqual(cfg.enabled, true);
    assert.strictEqual(cfg.endpoint, 'https://siem.example.com/in');
    delete process.env.INFRAOPS_AUDIT_FORWARD;
  });

  fs.rmSync(tmp, { recursive: true, force: true });
  console.log(`\n✅ data-plane: ${passed} checks passed`);
})().catch((err) => {
  console.error(err);
  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* ignore */ }
  process.exit(1);
});
