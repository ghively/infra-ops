#!/usr/bin/env node
/**
 * Unit tests for the dual-control promotion gate's in-zone (hsa) path:
 * two distinct approvers + citation + CPSA reference + in-zone flag are all
 * required; legacy env flag honored; emergency bypass is audited.
 *
 * Runs against an isolated temp state dir so it never touches real data.
 */

'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

// Isolate filesystem side effects BEFORE requiring the gate (it logs via the ledger).
const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'infra-ops-dc-'));
process.env.CLAUDE_PLUGIN_ROOT = tmpRoot;
process.env.INFRAOPS_STATE_DIR = path.join(tmpRoot, 'state');

const gate = require(path.resolve(__dirname, '../../scripts/hooks/dual-control-promotion-gate.js'));

// Start from a clean flag state for every run.
for (const f of ['INFRAOPS_HSA_ZONE', 'INFRA_HSA_ZONE', 'INFRAOPS_BYPASS_DUAL_CONTROL', 'INFRA_BYPASS_DUAL_CONTROL']) {
  delete process.env[f];
}

let passed = 0;
async function check(name, fn) {
  await fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

const inzone = (over = {}) => gate.parseRequest({
  id: 'i-hsa', zone: 'in-zone', confidence: 0.9,
  approvers: 'alice,bob', citation: 'PCI DSS Req 7.2', cpsa_ref: 'knowledge/cpsa-approval.md#build',
  ...over,
});

(async () => {
  await check('parseRequest reads cpsa_ref aliases', () => {
    assert.strictEqual(gate.parseRequest({ cpsa: 'x' }).cpsaRef, 'x');
    assert.strictEqual(gate.parseRequest({ cpsaRef: 'y' }).cpsaRef, 'y');
    assert.strictEqual(gate.parseRequest({ cpsa_ref: 'z' }).cpsaRef, 'z');
  });

  await check('corporate promotion needs no HSA flag or CPSA ref', async () => {
    const res = await gate.processDualControl(gate.parseRequest({
      id: 'i1', zone: 'corporate', confidence: 0.9, approvers: 'alice,bob', citation: 'Req 7.2',
    }));
    assert.strictEqual(res.ok, true, res.errors.join('; '));
  });

  await check('in-zone denied without INFRAOPS_HSA_ZONE', async () => {
    delete process.env.INFRAOPS_HSA_ZONE;
    const res = await gate.processDualControl(inzone());
    assert.strictEqual(res.ok, false);
    assert.ok(res.errors.some((e) => /HSA zone/.test(e)), res.errors.join('; '));
  });

  await check('in-zone denied without CPSA reference', async () => {
    process.env.INFRAOPS_HSA_ZONE = '1';
    const res = await gate.processDualControl(inzone({ cpsa_ref: null }));
    assert.strictEqual(res.ok, false);
    assert.ok(res.errors.some((e) => /CPSA sign-off reference/.test(e)), res.errors.join('; '));
    delete process.env.INFRAOPS_HSA_ZONE;
  });

  await check('in-zone denied with a single approver', async () => {
    process.env.INFRAOPS_HSA_ZONE = '1';
    const res = await gate.processDualControl(inzone({ approvers: 'alice' }));
    assert.strictEqual(res.ok, false);
    assert.ok(res.errors.some((e) => /at least 2 approvers/.test(e)));
    delete process.env.INFRAOPS_HSA_ZONE;
  });

  await check('in-zone denied with non-distinct approvers', async () => {
    process.env.INFRAOPS_HSA_ZONE = '1';
    const res = await gate.processDualControl(inzone({ approvers: 'alice,alice' }));
    assert.strictEqual(res.ok, false);
    assert.ok(res.errors.some((e) => /distinct persons/.test(e)));
    delete process.env.INFRAOPS_HSA_ZONE;
  });

  await check('in-zone denied without a citation', async () => {
    process.env.INFRAOPS_HSA_ZONE = '1';
    const res = await gate.processDualControl(inzone({ citation: null }));
    assert.strictEqual(res.ok, false);
    assert.ok(res.errors.some((e) => /citation/.test(e)));
    delete process.env.INFRAOPS_HSA_ZONE;
  });

  await check('in-zone allowed with all four controls satisfied', async () => {
    process.env.INFRAOPS_HSA_ZONE = '1';
    const res = await gate.processDualControl(inzone());
    assert.strictEqual(res.ok, true, res.errors.join('; '));
    delete process.env.INFRAOPS_HSA_ZONE;
  });

  await check('legacy INFRA_HSA_ZONE is still honored', async () => {
    process.env.INFRA_HSA_ZONE = '1';
    const res = await gate.processDualControl(inzone());
    assert.strictEqual(res.ok, true, res.errors.join('; '));
    delete process.env.INFRA_HSA_ZONE;
  });

  await check('emergency bypass is allowed and audited', async () => {
    process.env.INFRAOPS_BYPASS_DUAL_CONTROL = '1';
    const res = await gate.processDualControl(inzone({ approvers: 'alice', citation: null, cpsa_ref: null }));
    assert.strictEqual(res.ok, true);
    assert.ok(res.warnings.includes('bypass'));
    delete process.env.INFRAOPS_BYPASS_DUAL_CONTROL;
  });

  await check('hook denies a failing in-zone promotion tool call', async () => {
    delete process.env.INFRAOPS_HSA_ZONE;
    const decision = await gate.runHook({
      tool_name: 'instinct_promote',
      tool_input: { id: 'i9', zone: 'hsa', approvers: 'alice,bob', citation: 'Req 7.2', cpsa_ref: 'ref' },
    });
    assert.ok(decision && decision.hookSpecificOutput.permissionDecision === 'deny');
  });

  await check('hook ignores corporate-zone promotions', async () => {
    const decision = await gate.runHook({
      tool_name: 'instinct_promote',
      tool_input: { id: 'i10', zone: 'corporate', approvers: 'alice,bob', citation: 'Req 7.2' },
    });
    assert.strictEqual(decision, null);
  });

  fs.rmSync(tmpRoot, { recursive: true, force: true });
  console.log(`\n✅ dual-control: ${passed} checks passed`);
})().catch((err) => {
  console.error(err);
  try { fs.rmSync(tmpRoot, { recursive: true, force: true }); } catch { /* ignore */ }
  process.exit(1);
});
