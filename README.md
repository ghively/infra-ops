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

**v0.1.0 — Scaffold Phase**

Baseline tooling is wired and installable. Most domain depth is intentionally left as TODOs for the agent to build out with real context from your environment.

- See **[`SPEC.md`](SPEC.md)** for component status and what exists vs. stubbed
- See **[`TODO.md`](TODO.md)** for the ordered build backlog
- See **[`docs/infra-agent/DESIGN.md`](docs/infra-agent/DESIGN.md)** for full rationale and research

## What's Working

| Component | Status |
|-----------|--------|
| Plugin manifest + marketplace | ✅ Installable |
| `pan-egress-filter` hook | ✅ PAN/secrets DLP |
| `governance-ledger` hook | ✅ Append-only audit |
| `infra-session-bootstrap` hook | ✅ Session primer |
| 8 specialist agents | 🟡 Scaffolded |
| 11 domain skills | 🟡 Scaffolded |
| 4 commands | 🟡 Scaffolded |
| 3 hook scripts | ✅ Implemented |
| Ansible rules | 🟡 Stubbed |

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
├── agents/                  # Specialist subagents (auto-discovered)
│   ├── infra-planner.md     # Brief → phased plans with rollback units
│   ├── infra-auditor.md     # Read-only discovery + drift detection
│   ├── iac-author.md        # Ansible/GitLab CI authoring
│   ├── playbook-reviewer.md # Playbook MR review
│   ├── pci-compliance-reviewer.md  # PCI control checks
│   ├── sensitive-local-analyst.md  # Local-lane router for CHD work
│   ├── change-scribe.md     # Auto-doc generation
│   └── knowledge-curator.md # Doc ingestion + cited answers
├── skills/                  # Lazy-loaded domain skills
│   ├── ansible-patterns/    # Repo layout, FQCN, idempotency
│   ├── ansible-testing/     # yamllint→ansible-lint→molecule
│   ├── gitlab-cicd-pipeline/  # Stages, environments, CI components
│   ├── octopus-release/     # GitLab→Octopus integration
│   ├── drift-detection/     # Scheduled --check --diff
│   ├── pci-dss-compliance/  # Corporate DSS controls
│   ├── pci-cp-compliance/   # Card Production (Logical+PIN)
│   ├── change-documentation/  # Auto-doc generation
│   ├── multi-env-promotion/  # dev→test→staging→prod
│   ├── secrets-vault/       # Vault references, runtime lookups
│   └── knowledge-curation/  # Doc ingestion + classification
├── commands/                # Slash commands
│   ├── infra-discover.md    # Run capture-current-state discovery
│   ├── playbook-review.md   # Review a playbook/MR
│   ├── drift-check.md       # Run drift detection
│   └── knowledge-ingest.md  # Ingest a document into knowledge base
├── hooks/                   # Hook wiring (auto-loaded)
│   └── hooks.json           # Hook event bindings
├── scripts/hooks/           # Hook implementations
│   ├── infra-session-bootstrap.js  # SessionStart primer
│   ├── pan-egress-filter.js       # PreToolUse DLP
│   └── governance-ledger.js        # PostToolUse audit
├── rules/                   # Paths-scoped rules
│   ├── common/             # Prompt Defense Baseline
│   └── ansible/            # Coding style, testing, security
├── knowledge/               # Ingested docs + instinct ledger
│   ├── README.md            # Knowledge base conventions
│   └── .gitignore           # Sensitive content not committed
├── docs/                    # Documentation
│   └── infra-agent/         # Full design rationale + research
│       ├── DESIGN.md        # Complete design document
│       └── research/        # 11 research reports
├── tests/                   # Test suites
│   └── ci/                  # Validation scripts
├── SPEC.md                  # Build spec + component status
├── TODO.md                  # Ordered build backlog
├── package.json             # NPM manifest
└── README.md                # This file
```

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
