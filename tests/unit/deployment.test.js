#!/usr/bin/env node
/**
 * Unit tests for the deployment-uniformity gate:
 *   - the canonical template pipeline satisfies the policy
 *   - a compliant production pipeline (manual + protected) passes
 *   - missing stages/components and an ungated prod deploy are rejected
 *   - `--profile production` (ansible-lint) is NOT mistaken for a prod deploy
 *
 * Bakes deployment uniformity into npm test alongside structure uniformity.
 */

'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const { evaluate, mentionsProduction } = require(path.resolve(__dirname, '../../scripts/lib/deployment-policy.js'));

let passed = 0;
function check(name, fn) {
  fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

const TEMPLATE = path.resolve(__dirname, '../../templates/ansible-repo/.gitlab-ci.yml');

const COMPLIANT_PROD = `stages:
  - validate
  - deploy
include:
  - local: '/.gitlab-ci/components/iac-sast/template.yml'
  - local: '/.gitlab-ci/components/structure-conformance/template.yml'
deploy_prod:
  stage: deploy
  environment:
    name: production
  rules:
    - if: '$CI_COMMIT_BRANCH == $CI_DEFAULT_BRANCH'
      when: manual
  script:
    - ansible-playbook -l production playbooks/site.yml
`;

check('canonical template pipeline satisfies the policy', () => {
  const res = evaluate(fs.readFileSync(TEMPLATE, 'utf8'));
  assert.strictEqual(res.ok, true, res.errors.join('; '));
});

check('a manual + protected production pipeline passes', () => {
  const res = evaluate(COMPLIANT_PROD);
  assert.strictEqual(res.ok, true, res.errors.join('; '));
});

check('an ungated production deploy is rejected', () => {
  const bad = COMPLIANT_PROD.replace(/\s*when: manual/, '').replace(/CI_DEFAULT_BRANCH/, 'CI_COMMIT_TAG');
  const res = evaluate(bad);
  assert.strictEqual(res.ok, false);
  assert.ok(res.errors.some((e) => /prod-manual-gate/.test(e)));
  assert.ok(res.errors.some((e) => /prod-protected-branch/.test(e)));
});

check('a pipeline missing stages and components is rejected', () => {
  const res = evaluate('deploy_dev:\n  script: [echo hi]\n');
  assert.strictEqual(res.ok, false);
  assert.ok(res.errors.some((e) => /stages-declared/.test(e)));
  assert.ok(res.errors.some((e) => /iac-sast-gate/.test(e)));
  assert.ok(res.errors.some((e) => /structure-gate/.test(e)));
});

check('ansible-lint --profile production is not a prod deploy', () => {
  assert.strictEqual(mentionsProduction('script:\n  - ansible-lint --profile production\n'), false);
  assert.strictEqual(mentionsProduction('environment:\n  name: production\n'), true);
});

console.log(`\n✅ deployment: ${passed} checks passed`);
