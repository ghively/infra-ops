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

**v0.10.0** — Hardened agent layer (10 corporate agents + 3 in-zone `perso-*` proposals, 22 skills), deterministic enforcement; HSA go-live pending CPSA-L sign-off.

The corporate-zone plugin is built and wired: DLP, the local inference lane, the
governed learning loop, and the audit/state substrate all run and are covered by
tests (`npm test`). The in-HSA **tooling** — `perso-*` agents, deployment runbooks,
and the in-zone dual-control gate — is authored as reviewable proposals
(`knowledge/cpsa-approval.md §1`). In-HSA **deployment/go-live** remains gated on the
CPSA-L sign-off (`knowledge/cpsa-approval.md §2`); no PAN/keys/PINs/HSM config is ever
authored here.

- See **[`docs/architecture-gap.md`](docs/architecture-gap.md)** for design-vs-as-built status (the source of truth)
- See **[`docs/iac-tooling-and-automation-guide.md`](docs/iac-tooling-and-automation-guide.md)** for tech selection (Terraform/OpenTofu vs Ansible vs scripting), repo structuring, CI/CD, and deployment methods
- See **[`docs/iac-authoring-standards.md`](docs/iac-authoring-standards.md)** for the Ansible execution standards the `iac-author` agent follows
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
| 13 specialist agents (10 corporate + 3 in-zone `perso-*`) | ✅ Implemented |
| 21 domain skills | ✅ Implemented |
| 7 commands (incl. `/scaffold`) | ✅ Implemented |
| Canonical templates + structure-conformance gate | ✅ Enforced (`validate-structure.js`) |
| 13 hook scripts (9 event-wired + 4 CLI/in-zone gates) | ✅ Implemented |
| Ansible / GitLab / secrets / PCI rules + authoring-standards guide | ✅ Implemented |
| In-HSA tooling (`perso-*` agents, runbooks, guards, dual-control gate) | 🟡 Built as proposals (`knowledge/cpsa-approval.md §1`) |
| In-HSA deployment / go-live | ⬜ CPSA-L sign-off pending (`knowledge/cpsa-approval.md §2`) |

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
├── agents/                  # 13 specialist subagents (auto-discovered)
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
│   └── perso-*.md                  # 3 LOCAL-ONLY in-zone agents (proposals):
│                                   #   perso-iac-author / -iac-reviewer / -cp-compliance-reviewer
├── skills/                  # 22 lazy-loaded domain skills
│   ├── iac-tooling-selection/   # Terraform/OpenTofu vs Ansible vs Bash/PowerShell/Python
│   ├── ansible-patterns/  ansible-testing/  gitlab-cicd-pipeline/
│   ├── octopus-release/  drift-detection/  multi-env-promotion/
│   ├── pci-dss-compliance/  pci-cp-compliance/  secrets-vault/
│   ├── change-documentation/  knowledge-curation/  iac-sast-scanning/
│   ├── rollback-and-runbooks/  ci-pipeline-debugging/  incident-response/
│   ├── pre-commit-and-secret-scanning/  supply-chain-and-sbom/
│   ├── pci-pin-awareness/  perso-change-control/   # in-zone (DESIGN §3)
│   └── instinct-promotion/  instinct-rollback/   # governed learning loop
├── commands/                # 7 slash commands
│   ├── infra-discover.md  playbook-review.md  drift-check.md
│   ├── knowledge-ingest.md  scaffold.md
│   └── instinct-promote.md  instinct-rollback.md
├── templates/               # Canonical IaC skeletons (the agent stamps every unit from these)
│   ├── ansible-role/  ansible-repo/
│   └── terraform-module/  terraform-env/
├── contexts/                # Context modes (dev / research / review)
├── hooks/
│   └── hooks.json           # Hook event bindings (9 event-wired hooks)
├── scripts/
│   ├── hooks/               # 13 hook implementations (9 event-wired + 4 CLI/in-zone gates)
│   │   ├── infra-session-bootstrap.js  pan-egress-filter.js
│   │   ├── governance-ledger.js  governance-capture.js  observe-runner.js
│   │   ├── gateguard-fact-force.js  sensitivity-router.js
│   │   ├── yamllint-hook.js  ansible-syntax-hook.js
│   │   ├── learning-promotion-gate.js  dual-control-promotion-gate.js
│   │   └── hsa-boundary-guard.js  block-no-verify.js   # in-zone guards
│   ├── validate-structure.js   # Deterministic structure-conformance gate (uniform layout)
│   └── lib/                 # Shared libraries
│       ├── structure-spec.js       # Canonical IaC layout spec (single source of truth)
│       ├── state-store.js          # Unified state/governance store
│       ├── instinct-ledger.js      # Instinct persistence + governance logging
│       ├── ollama-router.js        # Local-only inference lane
│       ├── siem-forwarder.js       # Audit forwarding
│       └── shell-substitution.js
├── rules/                   # Paths-scoped rules (auto-inject per file type)
│   ├── common/  ansible/  terraform/  scripts/  gitlab-ci/  secrets/  pci/
├── schemas/                 # JSON schemas (state-store.schema.json)
├── knowledge/               # Knowledge base + instinct ledger
│   ├── README.md  runner-topology.md  hsa-deployment.md
│   ├── cpsa-approval.md     # Citable Phase-7 authorization record (build vs go-live)
│   └── instincts/           # corporate/  hsa/   (zone-segmented)
├── docs/
│   ├── architecture-gap.md         # Design-vs-as-built (source of truth)
│   ├── iac-authoring-standards.md  # Ansible execution standards the iac-author follows
│   ├── iac-tooling-and-automation-guide.md  # Tech selection + repo/CI/CD/scripting standards
│   ├── foundation-improvement-plan.md  mcp-servers.md
│   ├── changes/  decisions/         # Auto-docs (change records + ADRs)
│   └── infra-agent/                 # Full design rationale + research
│       ├── DESIGN.md  research/     # (11 research reports)
├── tests/
│   ├── ci/                  # Component validators (agents/commands/skills/hooks)
│   ├── unit/                # Unit suites (local-lane, instinct-loop, data-plane,
│   │                        #             dual-control, hsa-guard)
│   └── run-all.js           # Test runner (npm test)
├── .gitlab-ci/              # Reusable CI components (ansible-deploy, iac-sast, structure-conformance)
├── CLAUDE.md                # Orchestration contract (delegation map, skills, Context7)
├── SPEC.md  TODO.md  CHANGELOG.md  CONTRIBUTING.md
├── package.json  .env.example
└── README.md                # This file
```

### Orchestration & MCP

`CLAUDE.md` is the portable behavioral contract: Claude acts as a **lean orchestrator**
that delegates specialist work to the ten subagents (each in its own context window)
per a task→agent routing map, with a Delegation Envelope, an evaluator→remediation
loop, and a deterministic merge gate. **Context7** and **sequential-thinking** MCP
servers are bundled (`plugin.json` `mcpServers`); read-only GitLab/Octopus servers are
operator-enabled — see **[`docs/mcp-servers.md`](docs/mcp-servers.md)**.

How standards are *known and enforced*: path-scoped **rules** (`rules/**`) auto-inject
when matching files are in context (deterministic), **skills** teach application, and
the **binding** enforcement is hooks + the `iac-sast-scanning` CI gate + the
deterministic merge gate — reviewer agents advise, these gates bind.

## Authoring Standards

**Uniform structure is baked in and enforced — not advised.** Every new IaC unit is
stamped from a fixed canonical skeleton in [`templates/`](templates/) (`ansible-role`,
`ansible-repo`, `terraform-module`, `terraform-env`) via the
[`/scaffold`](commands/scaffold.md) command. The layout is defined once in
[`scripts/lib/structure-spec.js`](scripts/lib/structure-spec.js) and enforced
deterministically by [`scripts/validate-structure.js`](scripts/validate-structure.js):
the `iac-author` agent must pass it before an MR, and the
[`structure-conformance`](.gitlab-ci/components/structure-conformance/template.yml) CI
component runs the same check over every `roles/*`, `modules/*`, and `envs/*` in the
target repo — **any deviation fails the pipeline.** So structure and deployment are
uniform by construction.

**Choosing the technology** comes first. The
[`iac-tooling-selection`](skills/iac-tooling-selection/SKILL.md) skill +
**[`docs/iac-tooling-and-automation-guide.md`](docs/iac-tooling-and-automation-guide.md)**
define when to use **Terraform/OpenTofu** (provisioning) vs **Ansible** (in-host config)
vs **Bash/PowerShell/Python** (glue, orchestration, data gathering), how to structure
repos and CI/CD per tool, the deployment methods (immutable, blue-green, canary, rolling,
GitOps), and **when to combine** them — grounded in industry standards. The standards for
each file type auto-inject via path-scoped rules (`rules/terraform/*`, `rules/scripts/*`,
`rules/ansible/*`).

Once the tooling is chosen, the **Ansible execution** standards the **`iac-author`** agent
follows — and that the review gate checks — are consolidated in
**[`docs/iac-authoring-standards.md`](docs/iac-authoring-standards.md)**:

- **Ansible**: FQCN everywhere, idempotent modules (no naked `command`/`shell`),
  role-prefixed vars, inventory-as-directory, OS targeting by structure.
- **Secrets**: no plaintext — Vault references + `no_log: true`; crown-jewels hard stop.
- **Testing ladder**: `yamllint → ansible-lint → --syntax-check → --check --diff →
  Molecule idempotence` (all five gate every MR).
- **CI/CD**: staged pipelines, environment scoping, manual+protected production, the
  agent triggers at most a gated *dev* deploy.
- **Every MR**: `--check --diff` evidence + blast radius + rollback plan, then the
  three-way review gate (any `BLOCK` blocks; max 2 remediation cycles).

That guide is the readable index; the **binding** definitions are the rules under
`rules/**` (if the guide and a rule diverge, the rule wins).

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
| `INFRAOPS_DLP_FAIL_CLOSED` | Make `pan-egress-filter` fail-closed | `false` |
| `INFRAOPS_SENSITIVE_FAIL_CLOSED` | Make `sensitivity-router` **deny** CHD-adjacent calls (vs advisory) | `false` |
| `INFRAOPS_HSA_ZONE` | Mark the air-gapped in-zone environment (required for HSA promotions) | (unset) |
| `INFRAOPS_HSA_GUARD_FAIL_OPEN` | Relax the in-zone `hsa-boundary-guard` to fail-open (not recommended) | `false` (fail-closed) |
| `INFRAOPS_BYPASS_DUAL_CONTROL` | Audited emergency bypass of the dual-control gate | (unset) |

Legacy `INFRA_OPS_*` / `INFRA_*` names are still honored as fallbacks. Hook feature
flags (`INFRAOPS_YAMLLINT`, `INFRAOPS_ANSIBLE_SYNTAX`, `INFRAOPS_OBSERVE`,
`INFRAOPS_GOVERNANCE_CAPTURE`) are set in `hooks/hooks.json`. See [`.env.example`](.env.example)
and [`TODO.md`](TODO.md) for when each flag applies.

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

The three in-zone `perso-*` agents (`perso-iac-author`, `perso-iac-reviewer`,
`perso-cp-compliance-reviewer`) run on a **separate, air-gapped, local-only plane**
inside the HSA — they are not part of the corporate orchestration above and never run
on a cloud model. See [`knowledge/hsa-deployment.md`](knowledge/hsa-deployment.md).

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
