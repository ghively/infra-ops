# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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

[Unreleased]: https://github.com/ghively/infra-ops/compare/v0.9.0...HEAD
[0.9.0]: https://github.com/ghively/infra-ops/compare/v0.1.0...v0.9.0
[0.1.0]: https://github.com/ghively/infra-ops/releases/tag/v0.1.0
