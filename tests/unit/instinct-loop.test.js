#!/usr/bin/env node
/**
 * End-to-end unit test for the governed learning loop:
 * validate → promote → ledger write → governance event → rollback.
 *
 * Runs against an isolated temp plugin root + state dir so it never touches real data.
 */

'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

// Isolate filesystem side effects BEFORE requiring the libs.
const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'infra-ops-loop-'));
process.env.CLAUDE_PLUGIN_ROOT = tmpRoot;
process.env.INFRAOPS_STATE_DIR = path.join(tmpRoot, 'state');
fs.mkdirSync(path.join(tmpRoot, 'knowledge', 'instincts', 'corporate'), { recursive: true });

const gate = require(path.resolve(__dirname, '../../scripts/hooks/learning-promotion-gate.js'));
const ledger = require(path.resolve(__dirname, '../../scripts/lib/instinct-ledger.js'));
const StateStore = require(path.resolve(__dirname, '../../scripts/lib/state-store.js'));

let passed = 0;
async function check(name, fn) {
  await fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

(async () => {
  // 1. Validation rejects a below-threshold, unapproved promotion.
  await check('gate denies low-confidence + missing approver', async () => {
    const req = gate.parsePromotionRequest({ id: 'i1', zone: 'corporate', content: 'use FQCN', confidence: 0.5 });
    const res = await gate.processPromotion(req, { write: false });
    assert.strictEqual(res.ok, false);
    assert.ok(res.errors.some((e) => /Confidence/.test(e)));
    assert.ok(res.errors.some((e) => /approver/.test(e)));
  });

  // 2. Compliance content without citation is denied.
  await check('gate denies compliance content without citation', async () => {
    const req = gate.parsePromotionRequest({ id: 'i2', zone: 'corporate', content: 'enforce PCI DSS masking', confidence: 0.9, approver: 'op1' });
    const res = await gate.processPromotion(req, { write: false });
    assert.strictEqual(res.ok, false);
    assert.ok(res.errors.some((e) => /citation/.test(e)));
  });

  // 3. A valid promotion writes the ledger file and a governance event.
  await check('valid promotion writes ledger + governance event', async () => {
    const req = gate.parsePromotionRequest({
      id: 'fqcn-1', zone: 'corporate', content: 'Always use FQCN in Ansible modules.',
      confidence: 0.9, approver: 'senior-op-1', evidence: [{ observation_id: 'obs-1' }],
    });
    const res = await gate.processPromotion(req, { write: true });
    assert.strictEqual(res.ok, true);
    assert.ok(fs.existsSync(res.path), 'instinct file should exist');
    const yaml = fs.readFileSync(res.path, 'utf8');
    assert.ok(/status: active/.test(yaml));
    assert.ok(/promoted_by: "senior-op-1"/.test(yaml));

    const events = await StateStore.governanceEvents.getAll();
    assert.ok(events.some((e) => e.rule === 'instinct-promotion' && e.context.instinct_id === 'fqcn-1'),
      'a unified governance event should be recorded');
  });

  // 4. Rollback/deactivation updates the same file and logs an event.
  await check('rollback deactivates and logs', async () => {
    const p = await ledger.rollback({ instinctId: 'fqcn-1', zone: 'corporate', deactivate: true, reason: 'superseded', approvers: ['op1'] });
    const yaml = fs.readFileSync(p, 'utf8');
    assert.ok(/status: deactivated/.test(yaml));
    assert.ok(/reason: "superseded"/.test(yaml));
    const events = await StateStore.governanceEvents.getAll();
    assert.ok(events.some((e) => e.rule === 'instinct-rollback'));
  });

  // 5. list() sees the promoted instinct.
  await check('list returns promoted instincts', async () => {
    assert.ok(ledger.list('corpor').includes('fqcn-1'));
  });

  // Cleanup.
  fs.rmSync(tmpRoot, { recursive: true, force: true });
  console.log(`\n✅ instinct-loop: ${passed} checks passed`);
})().catch((err) => {
  console.error(err);
  try { fs.rmSync(tmpRoot, { recursive: true, force: true }); } catch { /* ignore */ }
  process.exit(1);
});
