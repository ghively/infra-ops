# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Initial standalone repository structure
- Package.json with npm scripts for validation and testing
- Comprehensive README with installation and development docs
- MIT License
- CONTRIBUTING.md with development workflow
- .env.example with all configuration options
- CI/CD workflow placeholders
- Test infrastructure placeholders

### Changed
- Migrated from ECC/plugins/infra-ops to standalone repo
- Updated documentation references from `../../docs/infra-agent/` to `./docs/infra-agent/`

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

[Unreleased]: https://github.com/ghively/infra-ops/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/ghively/infra-ops/releases/tag/v0.1.0
