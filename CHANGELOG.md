# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Lint tooling: `eslint.config.js` (ESLint v9 flat config, CommonJS + Node globals)
  and `.markdownlint.json`, so `npm run lint` runs and passes. `lint` script now
  covers the whole tree (`eslint .`) instead of `scripts/` only.

### Changed

- Env-var namespace standardized on `INFRAOPS_*`: `yamllint-hook` and
  `ansible-syntax-hook` (and `hooks.json`) now read the canonical flag while still
  honoring legacy `INFRA_OPS_*` as a fallback, matching the other hooks.
- Docs: corrected stale counts (README/TODO now say 19 skills, 10 agents); refreshed
  the architecture-gap CI/tests row.

### Fixed

- Removed dead `require`s flagged by ESLint (`os` in `governance-ledger`, `fs` in
  `sensitivity-router`, `execSync` in `validate-agents`); normalized an unused catch
  binding. Markdown structural lint issues (blank-line/indent hygiene) auto-corrected.

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

[Unreleased]: https://github.com/ghively/infra-ops/compare/v0.10.0...HEAD
[0.10.0]: https://github.com/ghively/infra-ops/compare/v0.9.0...v0.10.0
[0.9.0]: https://github.com/ghively/infra-ops/compare/v0.1.0...v0.9.0
[0.1.0]: https://github.com/ghively/infra-ops/releases/tag/v0.1.0
