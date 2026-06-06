# infra-ops

> PCI-aware DevOps agent for Ansible + self-hosted GitLab CI/CD + Octopus Deploy

A **lean orchestrator + isolated specialist subagents** for managing infrastructure at a credit-card manufacturer under **PCI DSS + PCI Card Production + PCI PIN** scope.

## Overview

`infra-ops` is a Claude Code plugin that:

- **Reads broadly** — ingests your infrastructure documentation, playbooks, and policies
- **Authors code** — writes Ansible playbooks, GitLab CI/CD configs, and documentation
- **Opens MRs** — proposes changes via GitLab merge requests for human review
- **Never touches prod** — pipelines and humans apply changes; agent is propose-only
- **Protects crown jewels** — blocks PAN/secrets at the tool boundary; routes CHD-adjacent work to local-only models
- **Improves itself** — documentation-grounded, human-gated self-improvement loop

## Status

**v0.9.0 — Corporate-zone foundations built; HSA pending CPSA review**

The corporate-zone plugin is built and wired: DLP, the local inference lane, the
governed learning loop, and the audit/state substrate all run and are covered by
tests (`npm test`). The in-HSA deployment remains documentation-only and CPSA-gated.

- See **[`docs/architecture-gap.md`](docs/architecture-gap.md)** for design-vs-as-built status (the source of truth)
- See **[`SPEC.md`](SPEC.md)** for the component inventory
- See **[`TODO.md`](TODO.md)** for the ordered build backlog
- See **[`docs/infra-agent/DESIGN.md`](docs/infra-agent/DESIGN.md)** for full rationale and research

## What's Working

| Component | Status |
|-----------|--------|
| Plugin manifest + marketplace | ✅ Installable |
| `pan-egress-filter` hook (Luhn PAN + secrets, fail-closed option) | ✅ Implemented |
| Local inference lane (`scripts/lib/ollama-router.js`) + `sensitivity-router` | ✅ Implemented (see caveat in architecture-gap.md) |
| Governed learning loop (promote/rollback over unified State Store) | ✅ Wired |
| `governance-ledger` + State Store (`scripts/lib/state-store.js`) | ✅ Implemented |
| 8 specialist agents | ✅ Implemented |
| 13 domain skills | ✅ Implemented |
| 6 commands | ✅ Implemented |
| 11 hook scripts (9 event-wired + 2 CLI gates) | ✅ Implemented |
| Ansible / GitLab / secrets / PCI rules | ✅ Implemented |
| In-HSA deployment + `perso-*` agents | ⬜ Documented only (CPSA-gated) |

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
├── agents/                  # 8 specialist subagents (auto-discovered)
│   ├── infra-planner.md            # Brief → phased plans with rollback units
│   ├── infra-auditor.md            # Read-only discovery + drift detection
│   ├── iac-author.md               # Ansible/GitLab CI authoring
│   ├── playbook-reviewer.md        # Playbook MR review
│   ├── pci-compliance-reviewer.md  # PCI control checks
│   ├── sensitive-local-analyst.md  # Local-lane router for CHD work
│   ├── change-scribe.md            # Auto-doc generation
│   └── knowledge-curator.md        # Doc ingestion + cited answers
├── skills/                  # 13 lazy-loaded domain skills
│   ├── ansible-patterns/  ansible-testing/  gitlab-cicd-pipeline/
│   ├── octopus-release/  drift-detection/  multi-env-promotion/
│   ├── pci-dss-compliance/  pci-cp-compliance/  secrets-vault/
│   ├── change-documentation/  knowledge-curation/
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
│       ├── state-store.js          # Unified state/governance store
│       ├── instinct-ledger.js      # Instinct persistence + governance logging
│       ├── ollama-router.js        # Local-only inference lane
│       ├── siem-forwarder.js       # Audit forwarding
│       └── shell-substitution.js
├── rules/                   # Paths-scoped rules
│   ├── common/  ansible/  gitlab-ci/  secrets/  pci/
├── schemas/                 # JSON schemas (state-store.schema.json)
├── knowledge/               # Knowledge base + instinct ledger
│   ├── README.md  runner-topology.md  hsa-deployment.md
│   └── instincts/           # corpor/  in-zone/   (zone-segmented)
├── docs/
│   ├── architecture-gap.md         # Design-vs-as-built (source of truth)
│   ├── foundation-improvement-plan.md
│   ├── changes/  decisions/         # Auto-docs (change records + ADRs)
│   └── infra-agent/                 # Full design rationale + research
│       ├── DESIGN.md  research/     # (11 research reports)
├── tests/
│   ├── ci/                  # Component validators (agents/commands/skills/hooks)
│   ├── unit/                # Unit suites (local-lane, instinct-loop)
│   └── run-all.js           # Test runner (npm test)
├── .gitlab-ci/              # Reusable CI components (ansible-deploy)
├── CLAUDE.md                # Orchestration contract (delegation map, skills, Context7)
├── SPEC.md  TODO.md  CHANGELOG.md  CONTRIBUTING.md
├── package.json  .env.example
└── README.md                # This file
```

### Orchestration & MCP

`CLAUDE.md` is the portable behavioral contract: Claude acts as a **lean orchestrator**
that delegates specialist work to the eight subagents (each in its own context window)
per a task→agent routing map. A **Context7** MCP server is bundled (`plugin.json`
`mcpServers`) so authoring/review agents fetch **current** library docs (Ansible
modules, GitLab CI keywords, Octopus/Vault APIs) instead of relying on memory.

## The Hard Trust Boundary

These rules are never violated:

1. **Propose, never dispose** — The agent edits code and opens MRs. It never runs `ansible-playbook` against prod and never auto-promotes changes.
2. **Never touch crown jewels** — No cleartext PAN, keys, PINs, or HSM configuration. The `pan-egress-filter` hook enforces this.
3. **Zone separation** — Corporate (DSS) and production/HSA (CP/PIN) are separate deployments. CHD-adjacent work runs on the local-only model lane.
4. **Cite, don't guess** — Scoping/compliance answers come from ingested documentation with source citations.

See [`SPEC.md §2`](SPEC.md#2-the-hard-trust-boundary-never-violate) for full justification.

## Environment Variables

Optional configuration flags:

| Variable | Purpose | Default |
|----------|---------|---------|
| `OLLAMA_BASE_URL` | Local model endpoint for CHD-adjacent work | (none) |
| `INFRAOPS_AUDIT_FORWARD` | SIEM endpoint for governance ledger | (none) |
| `INFRAOPS_DLP_FAIL_CLOSED` | Make PAN filter fail-closed | `false` |

See [`TODO.md`](TODO.md) for when each flag applies.

## Architecture

The plugin uses a **multi-agent architecture** with clear separation of concerns:

```
                    ┌─────────────────┐
                    │ Claude Code     │
                    │  Harness        │
                    └────────┬────────┘
                             │
                ┌────────────┴────────────┐
                │                         │
         ┌──────▼──────┐          ┌──────▼──────┐
         │ Orchestrator │          │   Local     │
         │  (Opus)      │          │   Lane      │
         └──────┬──────┘          │  (Ollama)   │
                │                 └──────┬──────┘
                │                          │
    ┌───────────┼──────────────────────────┼──────────┐
    │           │         Agents            │          │
    │  ┌────────▼────────┐  ┌─────────────▼──────────┐ │
    │  │ infra-planner    │  │ sensitive-local-analyst│ │
    │  │ iac-author       │  │                       │ │
    │  │ playbook-reviewer│  │                       │ │
    │  │ pci-compliance   │  │                       │ │
    │  │ infra-auditor    │  │                       │ │
    │  │ knowledge-curator│  │                       │ │
    │  │ change-scribe    │  │                       │ │
    │  └─────────────────┘  └────────────────────────┘ │
    │                                                   │
    │                   Skills (lazy-loaded)           │
    │  ansible-patterns, gitlab-cicd-pipeline,        │
    │  octopus-release, drift-detection, pci-*, etc.   │
    │                                                   │
    └───────────────────────────────────────────────────┘
```

See [`docs/infra-agent/DESIGN.md`](docs/infra-agent/DESIGN.md) for the complete architecture.

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

After adding, update [`SPEC.md §3`](SPEC.md#3-component-inventory-status) and [`TODO.md`](TODO.md).

## Contributing

Contributions are welcome! Please:

1. Read [`SPEC.md`](SPEC.md) and [`docs/infra-agent/DESIGN.md`](docs/infra-agent/DESIGN.md) first
2. Check [`TODO.md`](TODO.md) for open work
3. Follow the conventions in [`SPEC.md §4`](SPEC.md#4-how-to-extend-conventions-follow-those)
4. Ensure tests pass: `npm test && npm run validate`
5. Update component status in SPEC.md

## License

MIT License — see [LICENSE](LICENSE) file.

## Acknowledgments

Built as a standalone spinout from [ECC](https://github.com/affaan-m/ECC), leveraging its Claude Code plugin patterns and security/compliance frameworks.
