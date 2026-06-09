# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.14.0] - 2026-06-09

Merge of the v0.11–v0.13 main line (fail-closed defaults, expanded skills/rules,
seed instinct library, HSA design artifacts) with the templates/gates/in-zone-tooling
line. Post-merge state: 16 agents · 24 skills · 8 commands · 13 hook scripts ·
37 seed instincts · 18 validators.

### Removed

- `agents/perso-reviewer.md` — consolidated into the split in-zone reviewers the
  merge brought together: `perso-iac-reviewer` (correctness/idempotency) +
  `perso-cp-compliance-reviewer` (CP Logical + PIN), mirroring the corporate
  review gate. Its unique checks were ported: the FIM-baseline-integrity check
  moved to `perso-cp-compliance-reviewer`, and the `hsa-infrastructure` /
  `perso-compliance` skill wiring moved to the split reviewers. The HSA roster
  is now six agents: planner, iac-author, iac-reviewer, cp-compliance-reviewer,
  auditor, scribe.

### Added

- **Reliable-execution functions** — workflows that were prose the model executed by hand
  are now deterministic, tested code:
  - `scripts/merge-gate.js` (+ `lib/merge-gate.js`) — computes the review-gate decision
    from the three verdict tokens (any BLOCK blocks; a missing reviewer is incomplete →
    BLOCK; 2-cycle cap → escalate, exit 3). CLAUDE.md now points the merge gate at it.
  - `scripts/scaffold.js` (`/scaffold`) — deterministic copy + placeholder substitution +
    validate-structure + fail on any leftover `__…__` placeholder.
  - `scripts/preflight.js` (`/preflight`) — env/state checklist: node/git/tooling, branch,
    clean tree, staged-secret tripwire, leftover placeholders.
  - `scripts/conformance.js` (`npm run conformance`) — one local command running the
    structure + deployment validators over a repo, mirroring CI.
  - `scripts/lib/retry.js` — bounded exponential backoff; wraps the `ollama-router` and
    `siem-forwarder` network calls so a transient blip doesn't fail the run.
  - 5 new unit suites (merge-gate, scaffold, retry, conformance, preflight); `npm test`
    now runs 18 validators.
- **More canonical unit types + a deployment-uniformity gate** (extends the enforced
  structure):
  - 4 new scaffolds/types: `templates/{packer-template,python-tool,bash-tool,powershell-tool}/`
    with matching spec entries — 8 unit types total.
  - `scripts/lib/deployment-policy.js` + `scripts/validate-deployment.js` — deterministic
    gate asserting every `.gitlab-ci.yml` has the standard stages, the binding components,
    `environment:` scoping, and **manual + protected-branch production** (no auto-apply).
    `mentionsProduction` ignores false positives like `ansible-lint --profile production`.
  - `deployment-conformance` job added to the `structure-conformance` CI component.
  - `tests/unit/deployment.test.js` (5 checks); `structure.test.js` now 12 checks.
- **Enforced uniform structure** — the canonical IaC layout is now baked in and gated,
  not advisory:
  - `templates/{ansible-role,ansible-repo,terraform-module,terraform-env}/` — the fixed
    skeletons every unit is stamped from (`/scaffold` command).
  - `scripts/lib/structure-spec.js` (single source of truth) + `scripts/validate-structure.js`
    (deterministic gate, exits non-zero on any deviation).
  - `.gitlab-ci/components/structure-conformance` — binding CI gate over `roles/*`,
    `modules/*`, `envs/*` in the target repo; deviation fails the pipeline.
  - `tests/unit/structure.test.js` (8 checks) — templates ↔ spec never drift; deviations
    are rejected. `iac-author` now MUST scaffold from a template and pass the validator
    before an MR.
- Multi-tool IaC + automation competence: the agent now reasons across the whole
  toolchain, not just Ansible.
  - `skills/iac-tooling-selection` — decision framework for Terraform vs OpenTofu vs
    Ansible (provision vs configure) and Bash vs PowerShell vs Python, plus when to
    combine them. Loaded by `infra-planner` and `iac-author`.
  - `docs/iac-tooling-and-automation-guide.md` — deep reference: tool taxonomy,
    Terraform/OpenTofu choice (BSL vs Apache-2.0, state encryption), repo structuring +
    state isolation per tool, CI/CD (plan-on-MR/apply-on-approval), deployment methods
    (immutable/blue-green/canary/rolling/GitOps), scripting standards, data gathering.
  - `rules/terraform/terraform-style.md` (`**/*.tf,tofu,tfvars,hcl`) and
    `rules/scripts/scripting-standards.md` (`**/*.sh,ps1,py`) — path-scoped rules that
    auto-inject the standards when those file types are in context.
  - `infra-planner` now selects tooling per unit; `iac-author` can author
    Terraform/OpenTofu and Bash/PowerShell/Python to the same propose-only standard.
- `docs/iac-authoring-standards.md` — consolidated, citable guide to the best practices
  the `iac-author` agent follows (FQCN, idempotency, vars/inventory, secrets/Vault,
  the five-stage testing ladder, CI/CD, the review gate, the trust boundary). Linked
  from README, SPEC, and the docs index.
- Phase-7 (in-HSA) **tooling authored as proposals** (build-only; inert corporate-side):
  - `agents/perso-iac-author.md`, `agents/perso-iac-reviewer.md`,
    `agents/perso-cp-compliance-reviewer.md` — LOCAL-ONLY in-zone agents with the
    crown-jewels exclusions (no PAN/keys/PINs/HSM) baked in.
  - `knowledge/cpsa-approval.md` — citable authorization record separating **build**
    authorization (granted) from **go-live** authorization (CPSA-L sign-off, pending).
  - `knowledge/hsa-deployment.md` — added box bring-up, perso-* transfer/registration,
    and dual-control promotion runbooks.
  - `tests/unit/dual-control.test.js` — 12 checks covering the in-zone gate path.
  - In-zone guard hooks (DESIGN §3, previously never built): `scripts/hooks/hsa-boundary-guard.js`
    (fail-closed PreToolUse tripwire denying any PAN/key/component/PIN/HSM reference) and
    `scripts/hooks/block-no-verify.js` (denies verification-hook bypass). Registered in the
    HSA's own hooks config, not corporate. Coverage: `tests/unit/hsa-guard.test.js` (14 checks).
  - In-zone skills (DESIGN §3, previously never built): `skills/pci-pin-awareness`
    (recognize/refuse/route PIN data + keys) and `skills/perso-change-control` (test→live
    dual-control, witnessed sign-off, SoD). Wired into the `perso-*` agents and the skill map.
- Lint tooling: `eslint.config.js` (ESLint v9 flat config, CommonJS + Node globals)
  and `.markdownlint.json`, so `npm run lint` runs and passes. `lint` script now
  covers the whole tree (`eslint .`) instead of `scripts/` only.

### Changed

- `dual-control-promotion-gate.js`: the in-zone (`hsa`/`in-zone`) path now also
  requires a CPSA sign-off reference (`--cpsa-ref`) alongside two distinct approvers
  and a citation; env flags standardized to `INFRAOPS_HSA_ZONE` /
  `INFRAOPS_BYPASS_DUAL_CONTROL` (legacy `INFRA_*` still honored).
- Env-var namespace standardized on `INFRAOPS_*`: `yamllint-hook` and
  `ansible-syntax-hook` (and `hooks.json`) now read the canonical flag while still
  honoring legacy `INFRA_OPS_*` as a fallback, matching the other hooks.
- The HSA delegation flow (CLAUDE.md, workflows.md, perso-planner handoffs) now
  routes reviews through the in-zone reviewers (`perso-iac-reviewer` +
  `perso-cp-compliance-reviewer`) instead of the corporate, cloud-model
  `pci-compliance-reviewer` — a cloud agent can never run inside the air gap.
- `marketplace.json` version now tracks the plugin version (0.14.0).
- Docs: README/SPEC reconciled to the post-merge component counts (16 agents,
  24 skills, 8 commands, 13 hooks, 18 validators), the merged project-structure tree
  (perso-* design artifacts + in-zone proposals, templates, new skills/hooks/tests,
  `cpsa-approval.md`, new docs), an Authoring Standards section, and a corrected
  environment-variable table (`INFRAOPS_YAMLLINT`/`INFRAOPS_ANSIBLE_SYNTAX` are
  enable flags set in `hooks/hooks.json`, not binary paths).

### Fixed

- `js-yaml` is now declared in `dependencies` — `tests/ci/validate-instincts.js`
  requires it, so `npm test` failed on a fresh clone.
- Removed dead `require`s flagged by ESLint (`os` in `governance-ledger`, `fs` in
  `sensitivity-router`, `execSync` in `validate-agents`); normalized an unused catch
  binding. Markdown structural lint issues (blank-line/indent hygiene) auto-corrected.

## [0.13.0] - 2026-06-07

### Added

- Seed instinct library: 37 pre-promoted instincts under `knowledge/instincts/`,
  zone-segmented — corporate (ansible-best-practices, gitlab-ci-security,
  pci-dss-controls, secrets-vault-patterns, supply-chain-hardening,
  change-management) and HSA (hsa-zone-controls, perso-operational-patterns).
- `tests/ci/validate-instincts.js` — CI validator over all instinct YAML files.
- `docs/architecture.md` (component overview, zone model, hook pipeline, agent
  roster, state store, instinct lifecycle — 8 Mermaid diagrams) and
  `docs/workflows.md` (7 operational workflows).

## [0.12.0] - 2026-06-07

### Added

- HSA design artifacts: `perso-planner`, `perso-reviewer`, `perso-auditor`,
  `perso-scribe` agents + `hsa-infrastructure` and `perso-compliance` skills
  (deployment CPSA-gated).
- Path-scoped rule packs: `rules/dockerfile/`, `rules/terraform/`, `rules/python/`.
- Skill deep-reference expansions (Ansible family, GitLab CI, PCI, deploy/secrets,
  supply-chain-and-sbom, pre-commit-and-secret-scanning).

## [0.11.0] - 2026-06-06

### Changed

- `pan-egress-filter` and `sensitivity-router` now default to **fail-closed**
  (`INFRAOPS_DLP_FAIL_CLOSED=0` / `INFRAOPS_SENSITIVE_FAIL_CLOSED=0` to loosen).
- Env-var namespace standardized on `INFRAOPS_*` with `INFRA_OPS_*` back-compat.

### Fixed

- State-store schema drift: added `knowledgeBase` and `observations` collections +
  `validate-schema` CI test.

## [0.10.0] - 2026-06-06

Agent-layer hardening from a four-stream best-practices research pass (Claude Code
orchestration, IaC skill quality, multi-agent design, MCP servers).

### Added

- Agents: `iac-debugger` (sonnet) and `secrets-scanner` (haiku), both emitting a
  machine-readable VERDICT token.
- Skills: `iac-sast-scanning` (+ `.gitlab-ci/components/iac-sast` gate),
  `rollback-and-runbooks`, `ci-pipeline-debugging`, `incident-response`.
- Orchestration: Delegation Envelope, evaluator→remediation loop, deterministic 3-way
  merge gate, no-re-delegation rule in CLAUDE.md.
- MCP: bundle `sequential-thinking`; `docs/mcp-servers.md` guide for operator-enabled
  read-only GitLab/Octopus servers.

### Changed

- All 8 existing agents curated: handoffs, verdict/routed tokens, trigger-phrased
  descriptions, iac-author model-routing fix + Molecule branch, reviewers cite the
  path-injected rules as the single source of truth.
- Zone naming reconciled to canonical `corporate`/`hsa` (legacy `corpor`/`in-zone`
  accepted as aliases) across ledger, gates, commands, dirs, tests.
- Rewrote the two instinct skills to the standard When/How/Examples format.

### Fixed

- Deterministic standards injection: added `paths:` globs to the PCI, secrets, and
  GitLab-CI rules (they had none, so they weren't auto-injected).
- `drift-detection` asserted on the non-existent `ansible_changed_tasks` var (silent
  no-op) — replaced with set_stats / play-recap parsing.
- Typo in `pci-compliance-reviewer` prompt-defense baseline.

## [0.9.0] - 2026-06-06

Remediation release: closed the gap between the docs' claims and the running code,
and built out the two foundationally-diverged pillars (local lane + learning loop).

### Added

- Real local inference lane: `scripts/lib/ollama-router.js` (local-only HTTP, no
  cloud SDK, refuses non-local endpoints) wired into the `sensitive-local-analyst` agent
- `scripts/lib/instinct-ledger.js`: single source of truth for instinct persistence
  and governance logging through the shared State Store
- `/instinct-promote` and `/instinct-rollback` commands (were claimed but missing)
- `INFRAOPS_DLP_FAIL_CLOSED` support in `pan-egress-filter`
- `INFRAOPS_SENSITIVE_FAIL_CLOSED` deny mode in `sensitivity-router`
- `tests/run-all.js` runner; unit suites (`tests/unit/local-lane`, `instinct-loop`)
- `docs/architecture-gap.md`: authoritative design-vs-as-built status

### Changed

- `sensitivity-router` upgraded from an stderr log to a real PreToolUse gate
- `learning-promotion-gate` / `dual-control-promotion-gate` rewritten to use the
  unified ledger, expose real CLIs, and emit valid deny decisions
- Reconciled docs to reality: README structure/status, SPEC §3, TODO status, version
- Migrated from ECC/plugins/infra-ops to standalone repo

### Fixed

- `state-store.js` pruned every newly-added entry (compared `Date.now()` to an
  ISO-string `createdAt`), so the store always read back empty
- `validate-hooks.js` rejected the real Claude Code hooks.json schema
- `npm test` referenced a missing `tests/run-all.js` module
- Instinct skills lacked frontmatter (undiscoverable); doubled DESIGN.md links

## [0.1.0] - 2026-06-03

### Added

- Plugin manifest + single-plugin marketplace (`.claude-plugin/`)
- Safety hook: `pan-egress-filter` (PreToolUse DLP)
- Audit hook: `governance-ledger` (PostToolUse, fingerprinted)
- Session primer: `infra-session-bootstrap`
- 8 scaffolded specialist agents:
  - infra-planner
  - infra-auditor
  - iac-author
  - playbook-reviewer
  - pci-compliance-reviewer
  - sensitive-local-analyst
  - change-scribe
  - knowledge-curator
- 11 scaffolded domain skills
- 4 scaffolded commands
- 3 hook implementations
- Prompt Defense Baseline rules
- Ansible coding rules (stubbed)
- SPEC.md with component status and conventions
- TODO.md with ordered build backlog
- Full design documentation in `docs/infra-agent/`:
  - DESIGN.md (complete rationale)
  - 11 research reports

[Unreleased]: https://github.com/ghively/infra-ops/compare/v0.14.0...HEAD
[0.14.0]: https://github.com/ghively/infra-ops/compare/v0.13.0...v0.14.0
[0.13.0]: https://github.com/ghively/infra-ops/compare/v0.12.0...v0.13.0
[0.12.0]: https://github.com/ghively/infra-ops/compare/v0.11.0...v0.12.0
[0.11.0]: https://github.com/ghively/infra-ops/compare/v0.10.0...v0.11.0
[0.10.0]: https://github.com/ghively/infra-ops/compare/v0.9.0...v0.10.0
[0.9.0]: https://github.com/ghively/infra-ops/compare/v0.1.0...v0.9.0
[0.1.0]: https://github.com/ghively/infra-ops/releases/tag/v0.1.0
