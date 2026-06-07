#!/usr/bin/env node
/**
 * Unit tests for the local lane: ollama-router pure helpers and the
 * sensitivity-router decision logic. No network calls.
 */

'use strict';

const assert = require('assert');
const path = require('path');

const router = require(path.resolve(__dirname, '../../scripts/lib/ollama-router.js'));
const sensitivity = require(path.resolve(__dirname, '../../scripts/hooks/sensitivity-router.js'));

let passed = 0;
function check(name, fn) {
  fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

// --- ollama-router.isLocalUrl ---
check('isLocalUrl accepts localhost / loopback / RFC1918', () => {
  assert.strictEqual(router.isLocalUrl('http://localhost:11434'), true);
  assert.strictEqual(router.isLocalUrl('http://127.0.0.1:11434'), true);
  assert.strictEqual(router.isLocalUrl('http://192.168.1.50:11434'), true);
  assert.strictEqual(router.isLocalUrl('http://10.0.0.5:11434'), true);
  assert.strictEqual(router.isLocalUrl('http://172.16.0.9:11434'), true);
});

check('isLocalUrl rejects public hosts and garbage', () => {
  assert.strictEqual(router.isLocalUrl('https://api.openai.com'), false);
  assert.strictEqual(router.isLocalUrl('http://8.8.8.8:11434'), false);
  assert.strictEqual(router.isLocalUrl('not-a-url'), false);
});

check('buildPayload sets model/prompt/stream and optional system', () => {
  const p = router.buildPayload({ prompt: 'hi', model: 'm1' });
  assert.strictEqual(p.model, 'm1');
  assert.strictEqual(p.prompt, 'hi');
  assert.strictEqual(p.stream, false);
  assert.ok(!('system' in p));
  const p2 = router.buildPayload({ prompt: 'hi', system: 'sys' });
  assert.strictEqual(p2.system, 'sys');
  assert.strictEqual(p2.model, router.DEFAULT_MODEL);
});

check('parseArgs reads flags', () => {
  const o = router.parseArgs(['--model', 'qwen', '--system', 'be safe', '--health']);
  assert.strictEqual(o.model, 'qwen');
  assert.strictEqual(o.system, 'be safe');
  assert.strictEqual(o.health, true);
});

// --- sensitivity-router.decide ---
function withEnv(env, fn) {
  const saved = {};
  for (const k of Object.keys(env)) { saved[k] = process.env[k]; process.env[k] = env[k]; }
  try { return fn(); }
  finally {
    for (const k of Object.keys(env)) {
      if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k];
    }
  }
}

const benign = JSON.stringify({ tool_input: { command: 'ls -la' } });
const chd = JSON.stringify({ tool_input: { command: 'grep pan personalization.db' } });

check('decide allows benign input', () => {
  withEnv({ INFRAOPS_SENSITIVITY_ROUTE: '', INFRAOPS_SENSITIVE_FAIL_CLOSED: '0' }, () => {
    assert.strictEqual(sensitivity.decide(benign).action, 'allow');
  });
});

check('decide advises (non-blocking) on CHD when fail-closed is off', () => {
  withEnv({ INFRAOPS_SENSITIVITY_ROUTE: '', INFRAOPS_SENSITIVE_FAIL_CLOSED: '0' }, () => {
    assert.strictEqual(sensitivity.decide(chd).action, 'advise');
  });
});

check('decide denies CHD when fail-closed', () => {
  withEnv({ INFRAOPS_SENSITIVITY_ROUTE: '', INFRAOPS_SENSITIVE_FAIL_CLOSED: '1' }, () => {
    const d = sensitivity.decide(chd);
    assert.strictEqual(d.action, 'deny');
    assert.ok(/CHD-adjacent/.test(d.reason));
  });
});

check('decide is a no-op when globally disabled', () => {
  withEnv({ INFRAOPS_SENSITIVITY_ROUTE: '0', INFRAOPS_SENSITIVE_FAIL_CLOSED: '1' }, () => {
    assert.strictEqual(sensitivity.decide(chd).action, 'allow');
  });
});

// --- pan-egress-filter default behaviour ---
const pan = require(path.resolve(__dirname, '../../scripts/hooks/pan-egress-filter.js'));

check('pan-egress failClosed is true when env var is unset', () => {
  withEnv({ INFRAOPS_DLP_FAIL_CLOSED: undefined }, () => {
    assert.strictEqual(pan.failClosedEnabled(), true);
  });
});

check('pan-egress failClosed is false when env var is 0', () => {
  withEnv({ INFRAOPS_DLP_FAIL_CLOSED: '0' }, () => {
    assert.strictEqual(pan.failClosedEnabled(), false);
  });
});

check('pan-egress failClosed is true when env var is 1', () => {
  withEnv({ INFRAOPS_DLP_FAIL_CLOSED: '1' }, () => {
    assert.strictEqual(pan.failClosedEnabled(), true);
  });
});

// --- sensitivity-router fail-closed default ---
check('sensitivity-router isFailClosed is true when env var is unset', () => {
  withEnv({ INFRAOPS_SENSITIVE_FAIL_CLOSED: undefined }, () => {
    assert.strictEqual(sensitivity.isFailClosed(), true);
  });
});

check('sensitivity-router isFailClosed is false when env var is 0', () => {
  withEnv({ INFRAOPS_SENSITIVE_FAIL_CLOSED: '0' }, () => {
    assert.strictEqual(sensitivity.isFailClosed(), false);
  });
});

check('sensitivity-router isFailClosed is true when env var is 1', () => {
  withEnv({ INFRAOPS_SENSITIVE_FAIL_CLOSED: '1' }, () => {
    assert.strictEqual(sensitivity.isFailClosed(), true);
  });
});

// --- env-var namespace ---
const yamllint = require(path.resolve(__dirname, '../../scripts/hooks/yamllint-hook.js'));
const ansibleSyntax = require(path.resolve(__dirname, '../../scripts/hooks/ansible-syntax-hook.js'));

check('yamllint hook activates on INFRAOPS_YAMLLINT=1 (canonical)', () => {
  withEnv({ INFRAOPS_YAMLLINT: '1', INFRA_OPS_YAMLLINT: undefined }, () => {
    const input = JSON.stringify({ tool_name: 'Write', tool_input: { file_path: 'foo.txt' } });
    const result = yamllint.run(input);
    assert.ok(result !== undefined);
  });
});

check('yamllint hook activates on INFRA_OPS_YAMLLINT=1 (back-compat)', () => {
  withEnv({ INFRAOPS_YAMLLINT: undefined, INFRA_OPS_YAMLLINT: '1' }, () => {
    const input = JSON.stringify({ tool_name: 'Write', tool_input: { file_path: 'foo.txt' } });
    const result = yamllint.run(input);
    assert.ok(result !== undefined);
  });
});

check('yamllint hook is a passthrough when both vars are unset', () => {
  withEnv({ INFRAOPS_YAMLLINT: undefined, INFRA_OPS_YAMLLINT: undefined }, () => {
    const input = JSON.stringify({ tool_name: 'Write', tool_input: { file_path: 'test.yaml' } });
    const result = yamllint.run(input);
    assert.strictEqual(result, input);
  });
});

check('ansible-syntax hook activates on INFRAOPS_ANSIBLE_SYNTAX=1 (canonical)', () => {
  withEnv({ INFRAOPS_ANSIBLE_SYNTAX: '1', INFRA_OPS_ANSIBLE_SYNTAX: undefined }, () => {
    const input = JSON.stringify({ tool_name: 'Write', tool_input: { file_path: 'foo.txt' } });
    const result = ansibleSyntax.run(input);
    assert.ok(result !== undefined);
  });
});

check('ansible-syntax hook activates on INFRA_OPS_ANSIBLE_SYNTAX=1 (back-compat)', () => {
  withEnv({ INFRAOPS_ANSIBLE_SYNTAX: undefined, INFRA_OPS_ANSIBLE_SYNTAX: '1' }, () => {
    const input = JSON.stringify({ tool_name: 'Write', tool_input: { file_path: 'foo.txt' } });
    const result = ansibleSyntax.run(input);
    assert.ok(result !== undefined);
  });
});

check('ansible-syntax hook is a passthrough when both vars are unset', () => {
  withEnv({ INFRAOPS_ANSIBLE_SYNTAX: undefined, INFRA_OPS_ANSIBLE_SYNTAX: undefined }, () => {
    const input = JSON.stringify({ tool_name: 'Write', tool_input: { file_path: 'site.yaml' } });
    const result = ansibleSyntax.run(input);
    assert.strictEqual(result, input);
  });
});

console.log(`\n✅ local-lane: ${passed} assertions passed`);
