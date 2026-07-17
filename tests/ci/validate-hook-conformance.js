#!/usr/bin/env node

/**
 * Hook conformance harness (design decision 2026-07-17-hook-conformance-selftest).
 *
 * `validate-hooks.js` proves a hook file exists and is wired. It does NOT prove the
 * hook actually *runs* and *denies* — which is how `gateguard-fact-force.js` shipped
 * inert (no stdin entry point: read nothing, exited 0) while every doc listed it as a
 * live guard. This harness closes that gap: for each enforcing hook it pipes a known-bad
 * payload to the real script and asserts a PreToolUse `deny`, and pipes a known-good
 * payload and asserts passthrough (no deny). It catches all three failure modes: hook
 * never runs, hook runs but no-ops, hook fails open.
 *
 * Every new enforcing hook MUST add a case here (SPEC §4 extend-conventions).
 */

'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const REPO_ROOT = path.resolve(__dirname, '../../');
const HOOK = name => path.join(REPO_ROOT, 'scripts/hooks', name);

// gateguard-fact-force is first-touch-stateful; give it an isolated, freshly-created
// state dir per case so results don't depend on prior runs (or other cases).
function freshStateDir(tag) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `gg-conf-${tag}-`));
  return dir;
}

// Each case: feed `stdin` to `script` with `env`, expect deny (true) or passthrough (false).
const CASES = [
  {
    name: 'gateguard-fact-force denies a first-touch Edit',
    script: 'gateguard-fact-force.js',
    freshState: 'deny', // isolated empty state so "first touch" is genuinely first
    stdin: { tool_name: 'Edit', tool_input: { file_path: 'roles/x/tasks/main.yml', old_string: 'a', new_string: 'b' } },
    expectDeny: true,
  },
  {
    name: 'gateguard-fact-force disabled → allow',
    script: 'gateguard-fact-force.js',
    env: { INFRAOPS_GATEGUARD: 'off' },
    stdin: { tool_name: 'Edit', tool_input: { file_path: 'roles/x/tasks/main.yml', old_string: 'a', new_string: 'b' } },
    expectDeny: false,
  },
  {
    name: 'pan-egress-filter denies a Luhn-valid PAN in tool input',
    script: 'pan-egress-filter.js',
    env: { INFRAOPS_DLP_FAIL_CLOSED: '1' },
    stdin: { tool_name: 'Bash', tool_input: { command: 'echo 4111111111111111' } },
    expectDeny: true,
  },
  {
    name: 'pan-egress-filter allows benign input',
    script: 'pan-egress-filter.js',
    env: { INFRAOPS_DLP_FAIL_CLOSED: '1' },
    stdin: { tool_name: 'Bash', tool_input: { command: 'echo hello world' } },
    expectDeny: false,
  },
  {
    name: 'sensitivity-router (fail-closed) denies CHD-adjacent content',
    script: 'sensitivity-router.js',
    env: { INFRAOPS_SENSITIVE_FAIL_CLOSED: '1' },
    stdin: { tool_name: 'Bash', tool_input: { command: 'prepare the cardholder data feed' } },
    expectDeny: true,
  },
  {
    name: 'sensitivity-router (fail-closed) denies a malformed payload (no fail-open)',
    script: 'sensitivity-router.js',
    env: { INFRAOPS_SENSITIVE_FAIL_CLOSED: '1' },
    stdinRaw: 'not-json',
    expectDeny: true,
  },
  {
    name: 'sensitivity-router allows benign input',
    script: 'sensitivity-router.js',
    env: { INFRAOPS_SENSITIVE_FAIL_CLOSED: '1' },
    stdin: { tool_name: 'Edit', tool_input: { file_path: 'README.md', new_string: 'hello' } },
    expectDeny: false,
  },
  {
    name: 'prod-execution-guard denies ansible-playbook against prod',
    script: 'prod-execution-guard.js',
    env: {},
    stdin: { tool_name: 'Bash', tool_input: { command: 'ansible-playbook -i inventory/prod site.yml' } },
    expectDeny: true,
  },
  {
    name: 'prod-execution-guard allows a Dev-inventory run',
    script: 'prod-execution-guard.js',
    env: {},
    stdin: { tool_name: 'Bash', tool_input: { command: 'ansible-playbook -i inventory/dev site.yml' } },
    expectDeny: false,
  },
  {
    name: 'prod-execution-guard allows prod check-mode (non-mutating)',
    script: 'prod-execution-guard.js',
    env: {},
    stdin: { tool_name: 'Bash', tool_input: { command: 'ansible-playbook -i inventory/prod --check site.yml' } },
    expectDeny: false,
  },
  {
    name: 'hsa-boundary-guard denies a lowercase HSM/key reference',
    script: 'hsa-boundary-guard.js',
    env: { INFRAOPS_HSA_ZONE: '1' },
    stdin: { tool_name: 'Bash', tool_input: { command: 'configure hsm partition and load zmk' } },
    expectDeny: true,
  },
];

function isDeny(stdout) {
  if (!stdout || !stdout.trim()) return false;
  try {
    const parsed = JSON.parse(stdout);
    return parsed?.hookSpecificOutput?.permissionDecision === 'deny';
  } catch {
    return false;
  }
}

function runCase(c) {
  const stdin = 'stdinRaw' in c ? c.stdinRaw : JSON.stringify(c.stdin);
  const env = { ...process.env, ...(c.env || {}) };
  if (c.freshState) env.GATEGUARD_STATE_DIR = freshStateDir(c.freshState);
  const res = spawnSync('node', [HOOK(c.script)], {
    input: stdin,
    encoding: 'utf8',
    env,
    timeout: 10000,
  });
  if (res.status !== 0) {
    return { ok: false, detail: `exited ${res.status} (hooks must exit 0): ${res.stderr || ''}`.trim() };
  }
  const denied = isDeny(res.stdout);
  if (denied !== c.expectDeny) {
    return { ok: false, detail: `expected ${c.expectDeny ? 'DENY' : 'ALLOW'}, got ${denied ? 'DENY' : 'ALLOW'}` };
  }
  return { ok: true };
}

function main() {
  let failed = 0;
  for (const c of CASES) {
    const r = runCase(c);
    if (r.ok) {
      console.log(`✓ ${c.name}`);
    } else {
      failed += 1;
      console.error(`❌ ${c.name}\n   - ${r.detail}`);
    }
  }
  if (failed > 0) {
    console.error(`\n❌ hook-conformance: ${failed} of ${CASES.length} case(s) failed`);
    process.exit(1);
  }
  console.log(`\n✅ hook-conformance: all ${CASES.length} enforcement cases behave correctly`);
}

main();
