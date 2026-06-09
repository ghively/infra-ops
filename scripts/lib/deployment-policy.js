'use strict';

/**
 * Deployment-uniformity policy — the canonical pipeline shape every `.gitlab-ci.yml`
 * in the estate must satisfy, so *deployment* is as uniform as *structure*. This is the
 * content-level companion to structure-spec.js: `scripts/validate-deployment.js` runs
 * it and the `structure-conformance` CI component enforces it (deviation fails the build).
 *
 * Checks are pattern-based over the raw pipeline text (no YAML dependency): a policy
 * linter that asserts the required shape is present and the prod-safety gates exist.
 * The production rules are conditional — they only bind when the pipeline actually
 * defines a production deploy.
 */

// Does this pipeline define a production DEPLOYMENT? Match real deploy signals — an
// environment named prod(uction), a prod limit/tier, or a prod deploy job — not the
// bare word "production" (which appears in e.g. `ansible-lint --profile production`).
function mentionsProduction(t) {
  return (
    /name:\s*prod(uction)?\b/i.test(t) ||           // environment: { name: production }
    /deployment_tier:\s*production\b/i.test(t) ||   // environment tier
    /(?:-l|--limit)\s+prod(uction)?\b/i.test(t) ||  // ansible limit to prod
    /deploy[_-]?prod(uction)?\b/i.test(t)           // job name deploy_production / deploy-prod
  );
}

const RULES = [
  { id: 'stages-declared', why: 'must declare a `stages:` list', test: (t) => /^stages:/m.test(t) },
  { id: 'validate-stage', why: 'must include a `validate` stage (quality gate before deploy)', test: (t) => /^\s*-\s*validate\s*$/m.test(t) },
  { id: 'deploy-stage', why: 'must include a `deploy` stage', test: (t) => /^\s*-\s*deploy\s*$/m.test(t) },
  { id: 'iac-sast-gate', why: 'must include the iac-sast security component', test: (t) => /iac-sast/.test(t) },
  { id: 'structure-gate', why: 'must include the structure-conformance component', test: (t) => /structure-conformance/.test(t) },
  { id: 'environment-scoping', why: 'deploy jobs must declare `environment:`', test: (t) => /environment:/.test(t) },
  {
    id: 'prod-manual-gate',
    why: 'production deploy must be `when: manual` (no auto-apply to prod)',
    test: (t) => !mentionsProduction(t) || /when:\s*manual/.test(t),
  },
  {
    id: 'prod-protected-branch',
    why: 'production deploy must be gated to the default/protected branch (CI_DEFAULT_BRANCH)',
    test: (t) => !mentionsProduction(t) || /CI_DEFAULT_BRANCH|protected/.test(t),
  },
];

// Evaluate a pipeline's raw content against the policy. Returns { ok, errors: string[] }.
function evaluate(content) {
  const text = String(content || '');
  const errors = [];
  for (const rule of RULES) {
    let ok;
    try { ok = !!rule.test(text); } catch { ok = false; }
    if (!ok) errors.push(`${rule.id}: ${rule.why}`);
  }
  return { ok: errors.length === 0, errors };
}

module.exports = { RULES, evaluate, mentionsProduction };
