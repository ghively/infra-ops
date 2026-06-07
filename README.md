# infra-ops

> PCI-aware DevOps agent for Ansible + self-hosted GitLab CI/CD + Octopus Deploy

A **lean orchestrator + isolated specialist subagents** for managing infrastructure at a credit-card manufacturer under **PCI DSS + PCI Card Production + PCI PIN** scope.

## Overview

`infra-ops` is a Claude Code plugin that:

- **Reads broadly** — ingests your infrastructure documentation, playbooks, and policies
- **Authors code** — writes Ansible playbooks, GitLab CI/CD configs, and documentation
- **Opens MRs** — proposes changes via GitLab merge requests for human review
- **Never touches prod** — pipelines and humans apply changes; agent is propose-only
- **Protects crown jewels** — blocks PAN/secrets at the tool boundary (fail-closed by default); routes CHD-adjacent work to local-only models
- **Improves itself** — documentation-grounded, human-gated self-improvement loop with 37 pre-seeded instincts

## Status

**v0.13.0 — 14 agents · 21 skills · 37 seed instincts · full HSA design artifacts · 9 CI validators passing**

The corporate-zone plugin is built and wired: DLP (fail-closed), the local inference lane,
the governed learning loop, and the audit/state substrate all run and are covered by
tests (`npm test`). The four HSA perso-* agents are fully designed and ship as artifacts;
in-zone deployment remains CPSA-gated.

- See **[`docs/architecture.md`](docs/architecture.md)** for component overview, zone model, hook pipeline, review gate, state store, and instinct lifecycle (8 Mermaid diagrams)
- See **[`docs/workflows.md`](docs/workflows.md)** for end-to-end operational workflows (7 Mermaid diagrams)
- See **[`docs/architecture-gap.md`](docs/architecture-gap.md)** for design-vs-as-built status
- See **[`SPEC.md`](SPEC.md)** for the full component inventory
- See **[`docs/superpowers/specs/2026-06-06-gap-analysis.md`](docs/superpowers/specs/2026-06-06-gap-analysis.md)** for the prioritized gap backlog
- See **[`docs/infra-agent/DESIGN.md`](docs/infra-agent/DESIGN.md)** for full rationale and research

## What's Working

| Component | Status |
|-----------|--------|
| Plugin manifest + marketplace | ✅ Installable |
| `pan-egress-filter` hook (Luhn PAN + secrets, **fail-closed** by default) | ✅ Implemented |
| `sensitivity-router` (**fail-closed** by default) + `ollama-router.js` | ✅ Implemented (see caveat in architecture-gap.md) |
| Governed learning loop (promote/rollback over unified State Store) | ✅ Wired |
| `governance-ledger` + State Store (9 collections) | ✅ Implemented |
| 10 corporate specialist agents | ✅ Implemented |
| 4 HSA perso-* agents (perso-planner/reviewer/auditor/scribe) | ✅ Design artifacts complete — CPSA gates deployment |
| 21 domain skills (expanded with deep reference sections) | ✅ Implemented |
| 37 pre-seeded instincts (corporate + HSA zones) | ✅ Committed under `knowledge/instincts/` |
| 6 commands | ✅ Implemented |
| 11 hook scripts (9 event-wired + 2 CLI gates) | ✅ Implemented |
| Ansible / GitLab / secrets / PCI / Dockerfile / Terraform / Python rules | ✅ Implemented |
| In-HSA operational deployment | ⬜ CPSA-gated (design complete, deployment blocked) |

## Installation

### As a Claude Code Plugin

```bash
# From the repo root
claude plugin marketplace add .
claude plugin install infra-ops@infra-ops

# Verify
claude plugin validate ./.claude-plugin/plugin.json
```

### For Development

```bash
# Clone the repo
git clone https://github.com/ghively/infra-ops.git
cd infra-ops

# Install dependencies
npm install

# Run tests
npm test

# Validate all components
npm run validate
```

## Project Structure

```
infra-ops/
├── .claude-plugin/          # Plugin manifest (Claude Code marketplace)
│   ├── plugin.json          # Main plugin configuration
│   └── marketplace.json     # Marketplace listing metadata
├── agents/                  # 14 specialist subagents (auto-discovered)
│   ├── infra-planner.md            # Brief → phased plans with rollback units
│   ├── infra-auditor.md            # Read-only discovery + drift detection
│   ├── iac-author.md               # Ansible/GitLab CI authoring (+ Molecule)
│   ├── iac-debugger.md             # Diagnose failures → proposed fix (read-only)
│   ├── playbook-reviewer.md        # Playbook MR review
│   ├── pci-compliance-reviewer.md  # PCI control checks
│   ├── secrets-scanner.md          # Deterministic pre-merge secret/PAN scan
│   ├── sensitive-local-analyst.md  # Local-lane router for CHD work
│   ├── change-scribe.md            # Auto-doc generation
│   ├── knowledge-curator.md        # Doc ingestion + cited answers
│   ├── perso-planner.md            # HSA infra brief → phased plan (CPSA-gated deploy)
│   ├── perso-reviewer.md           # HSA MR review — CP+PIN controls
│   ├── perso-auditor.md            # HSA read-only discovery + drift detection
│   └── perso-scribe.md             # HSA change records with dual-control evidence
├── skills/                  # 21 lazy-loaded domain skills
│   ├── ansible-patterns/  ansible-testing/  gitlab-cicd-pipeline/
│   ├── octopus-release/  drift-detection/  multi-env-promotion/
│   ├── pci-dss-compliance/  pci-cp-compliance/  secrets-vault/
│   ├── change-documentation/  knowledge-curation/  iac-sast-scanning/
│   ├── rollback-and-runbooks/  ci-pipeline-debugging/  incident-response/
│   ├── pre-commit-and-secret-scanning/  supply-chain-and-sbom/
│   ├── hsa-infrastructure/  perso-compliance/  # HSA-zone skills
│   └── instinct-promotion/  instinct-rollback/   # governed learning loop
├── commands/                # 6 slash commands
│   ├── infra-discover.md  playbook-review.md  drift-check.md
│   ├── knowledge-ingest.md
│   └── instinct-promote.md  instinct-rollback.md
├── contexts/                # Context modes (dev / research / review)
├── hooks/
│   └── hooks.json           # Hook event bindings (9 event-wired hooks)
├── scripts/
│   ├── hooks/               # 11 hook implementations (incl. 2 CLI gates)
│   │   ├── infra-session-bootstrap.js  pan-egress-filter.js
│   │   ├── governance-ledger.js  governance-capture.js  observe-runner.js
│   │   ├── gateguard-fact-force.js  sensitivity-router.js
│   │   ├── yamllint-hook.js  ansible-syntax-hook.js
│   │   └── learning-promotion-gate.js  dual-control-promotion-gate.js
│   └── lib/                 # Shared libraries
│       ├── state-store.js          # Unified state/governance store (9 collections)
│       ├── instinct-ledger.js      # Instinct persistence + governance logging
│       ├── ollama-router.js        # Local-only inference lane
│       ├── siem-forwarder.js       # Audit forwarding
│       └── shell-substitution.js
├── rules/                   # Path-scoped rules (auto-inject on file match)
│   ├── common/  ansible/  gitlab-ci/  secrets/  pci/
│   ├── dockerfile/          # Container security rules
│   ├── terraform/           # IaC security + style rules
│   └── python/              # Python security rules
├── schemas/                 # JSON schemas (state-store.schema.json — 9 collections)
├── knowledge/               # Knowledge base + instinct ledger
│   ├── README.md  runner-topology.md  hsa-deployment.md
│   └── instincts/           # Zone-segmented pre-seeded instincts
│       ├── corporate/       # ansible-best-practices, gitlab-ci-security,
│       │                    # pci-dss-controls, secrets-vault-patterns,
│       │                    # supply-chain-hardening, change-management
│       └── hsa/             # hsa-zone-controls, perso-operational-patterns
├── docs/
│   ├── architecture.md             # Component overview + 8 Mermaid diagrams
│   ├── workflows.md                # Operational workflows + 7 Mermaid diagrams
│   ├── architecture-gap.md         # Design-vs-as-built (source of truth)
│   ├── superpowers/specs/          # Living architectural specs + gap backlog
│   │   ├── 2026-06-06-deep-init-reference.md
│   │   └── 2026-06-06-gap-analysis.md
│   ├── changes/  decisions/        # Auto-docs (change records + ADRs)
│   └── infra-agent/                # Full design rationale + research
│       ├── DESIGN.md  research/    # (11 research reports)
├── tests/
│   ├── ci/                  # Component validators (agents/commands/skills/hooks/instincts)
│   ├── unit/                # Unit suites (local-lane, instinct-loop)
│   └── run-all.js           # Test runner (npm test)
├── .gitlab-ci/              # Reusable CI components (ansible-deploy, iac-sast gate)
├── CLAUDE.md                # Orchestration contract (delegation map, skills, Context7)
├── SPEC.md  TODO.md  CHANGELOG.md  CONTRIBUTING.md
├── package.json  .env.example
└── README.md                # This file
```

### Orchestration & MCP

`CLAUDE.md` is the portable behavioral contract: Claude acts as a **lean orchestrator**
that delegates specialist work to the fourteen subagents (each in its own context window)
per a task→agent routing map, with a Delegation Envelope, an evaluator→remediation
loop, and a deterministic merge gate. **Context7** and **sequential-thinking** MCP
servers are bundled (`plugin.json` `mcpServers`); read-only GitLab/Octopus servers are
operator-enabled — see **[`docs/mcp-servers.md`](docs/mcp-servers.md)**.

Standards are *known and enforced* at three layers: path-scoped **rules** (`rules/**`)
auto-inject when matching files are in context (deterministic), **skills** teach
application, and the **binding** enforcement is hooks + the `iac-sast-scanning` CI gate
+ the deterministic 3-way merge gate (playbook-reviewer + pci-compliance-reviewer +
secrets-scanner; any BLOCK blocks the merge).

## The Hard Trust Boundary

These rules are never violated:

1. **Propose, never dispose** — The agent edits code and opens MRs. It never runs `ansible-playbook` against prod and never auto-promotes changes.
2. **Never touch crown jewels** — No cleartext PAN, keys, PINs, or HSM configuration. The `pan-egress-filter` hook enforces this at the tool boundary (fail-closed).
3. **Zone separation** — Corporate (DSS) and production/HSA (CP/PIN) are separate deployments. CHD-adjacent work runs on the local-only model lane; the HSA is air-gapped.
4. **Cite, don't guess** — Scoping/compliance answers come from ingested documentation with source citations.

See [`SPEC.md §2`](SPEC.md#2-the-hard-trust-boundary-never-violate) for full justification.

## Environment Variables

| Variable | Purpose | Default |
|----------|---------|---------|
| `OLLAMA_BASE_URL` | Local model endpoint for CHD-adjacent work | (none — local lane is wired but endpoint must be set) |
| `INFRAOPS_AUDIT_FORWARD` | SIEM endpoint for governance ledger | (none — events stored locally until set) |
| `INFRAOPS_DLP_FAIL_CLOSED` | PAN/secrets filter fail posture (`0` to loosen) | `1` (fail-closed) |
| `INFRAOPS_SENSITIVE_FAIL_CLOSED` | Sensitivity router fail posture (`0` to loosen) | `1` (fail-closed) |
| `INFRAOPS_YAMLLINT` | Path to yamllint binary | `yamllint` |
| `INFRAOPS_ANSIBLE_SYNTAX` | Path to ansible-playbook binary | `ansible-playbook` |

See [`.env.example`](.env.example) for the full list.

## Architecture

Full architecture documentation with Mermaid diagrams lives in **[`docs/architecture.md`](docs/architecture.md)**. Covers:

- **System overview** — enforcement layers, hook pipeline, zone model
- **Agent roster** — all 14 agents with model, zone, and skills
- **Review gate** — 3-way parallel review with 2-cycle remediation loop
- **State Store** — 9 collections (sessions, skillRuns, skillVersions, decisions, installState, governanceEvents, workItems, knowledgeBase, observations)
- **Instinct lifecycle** — candidate → active → deprecated with governance gates

Operational workflows (standard change, HSA change, drift detection, secret detection, learning loop, incident response, knowledge ingestion) are in **[`docs/workflows.md`](docs/workflows.md)**.

## Development

### Running Tests

```bash
npm test                      # Run all tests
npm run coverage             # Run with coverage
npm run validate             # Validate all components
```

### Component Validation

```bash
npm run validate:agents      # Validate agent frontmatter
npm run validate:commands    # Validate command definitions
npm run validate:skills      # Validate skill definitions
npm run validate:hooks       # Validate hook wiring
```

### Adding Components

See [`SPEC.md §4`](SPEC.md#4-how-to-extend-conventions-follow-these) for conventions:

- **Agents**: `agents/<name>.md` with YAML frontmatter
- **Skills**: `skills/<name>/SKILL.md` with When/How/Examples
- **Commands**: `commands/<name>.md` with description frontmatter
- **Hooks**: Add to `hooks/hooks.json`; script in `scripts/hooks/`
- **Rules**: Add with `paths:` glob for scoping
- **Instincts**: Add to `knowledge/instincts/<zone>/<category>.yaml`

After adding, update [`SPEC.md §3`](SPEC.md#3-component-inventory-status) and [`TODO.md`](TODO.md).

## Contributing

Contributions are welcome! Please:

1. Read [`SPEC.md`](SPEC.md) and [`docs/infra-agent/DESIGN.md`](docs/infra-agent/DESIGN.md) first
2. Check [`docs/superpowers/specs/2026-06-06-gap-analysis.md`](docs/superpowers/specs/2026-06-06-gap-analysis.md) for open work
3. Follow the conventions in [`SPEC.md §4`](SPEC.md#4-how-to-extend-conventions-follow-those)
4. Ensure tests pass: `npm test && npm run validate`
5. Update component status in SPEC.md

## License

MIT License — see [LICENSE](LICENSE) file.

## Acknowledgments

Built as a standalone spinout from [ECC](https://github.com/affaan-m/ECC), leveraging its Claude Code plugin patterns and security/compliance frameworks.
