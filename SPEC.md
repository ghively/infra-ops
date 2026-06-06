# infra-ops — Build Spec

This is the working spec for the **infra-ops** Claude Code plugin: a lean orchestrator + isolated
specialist subagents that manage an Ansible / self-hosted GitLab CI/CD / Octopus Deploy estate for a
**credit-card manufacturer** (PCI DSS + PCI Card Production + PCI PIN scope).

The full rationale, citations, and decision record live in **[`docs/infra-agent/DESIGN.md`](docs/infra-agent/DESIGN.md)**
(v2) and its research in [`docs/infra-agent/research/`](docs/infra-agent/research/). This SPEC is the buildable subset: what
exists, what's stubbed, and how the agent fills the gaps. **Read [`docs/infra-agent/DESIGN.md`](docs/infra-agent/DESIGN.md) before extending anything.**

> This plugin is intentionally a **scaffold**. Baseline tooling is wired and installable; most
> domain depth is left as TODOs (see `TODO.md`) for the agent to build once it has real context from
> the environment and your documentation.

---

## 1. Environment baseline (current reality — the agent's first context to learn)

Keep this section accurate; it is the ground truth the agent reasons from and the knowledge loop
expands.

- **GitLab:** one **self-hosted** instance. CI/CD in use.
- **Compute:** a **single Linux box** that is *both* the agent host *and* the GitLab runner. (No
  separation of trust levels yet — a known gap; see TODO "runner topology".)
- **Ansible playbooks (2 today):**
  1. `updates` — patching/update playbook (works).
  2. `documentation` — generates documentation; **needs a desperate rework** (first real authoring
     task — see TODO "rework documentation playbook").
- **Octopus Deploy:** in use (multiple Tentacles) — division of labor per docs/infra-agent/DESIGN.md §12 (Ansible owns
  the machine; Octopus owns the release). Not yet wired into this plugin.
- **PCI posture:** card manufacturer → corporate IT under **PCI DSS**; the personalization/data-prep
  High Security Area under **PCI Card Production (Logical+Physical) + PCI PIN**. Current PoC is
  corporate-zone only. The HSA/in-zone **tooling** (perso-* agents, runbooks, in-zone dual-control
  gate) is authored as proposals (`knowledge/cpsa-approval.md §1`); in-zone **deployment/go-live**
  remains a later, CPSA-L-gated phase (`knowledge/cpsa-approval.md §2`; docs/infra-agent/DESIGN.md §14 Phase 7).

> The agent should **not assume** beyond this. Unknowns (network segmentation, HSM vendor, exact
> DSS-vs-CP system split) are answered by ingesting your documentation and proposing **cited** answers
> for human confirmation — never by guessing (see §5).

---

## 2. The hard trust boundary (never violate)

These are load-bearing. Everything else is incremental; these are not.

1. **Propose, never dispose.** The agent edits code and opens GitLab MRs. It may trigger CI and a
   **Dev** deploy behind a gate. It **never** runs `ansible-playbook` against test/staging/prod, and
   **never** auto-promotes. Promotion is human-gated (GitLab approvals + Octopus manual intervention).
2. **Never touch the crown jewels.** No cleartext PAN/cardholder data, no cryptographic keys / key
   components, no PINs, no HSM configuration — ever. Those are out-of-band, dual-control human
   operations. The `pan-egress-filter` hook enforces the PAN/secret half at runtime.
3. **Zone separation.** Corporate (DSS) and production/HSA (CP/PIN) are separate deployments.
   CHD-adjacent work runs on the **local-only** model lane; the HSA is air-gapped (no cloud path).
4. **Cite, don't guess.** Scoping/compliance answers come from ingested documentation with a citation
   to the source, surfaced as proposals for human confirmation.

(Justification + citations: docs/infra-agent/DESIGN.md §1–§2, §6–§7; research/pci-card-production.md; research/pci-dss-devops.md.)

---

## 3. Component inventory & status

Legend: ✅ built (baseline) · 🟡 scaffold/stub (TODO to flesh out) · ⬜ not started (TODO to create).

> For authoritative design-vs-as-built status (including the local-lane enforcement
> caveat and what remains HSA/CPSA-gated), see **[`docs/architecture-gap.md`](docs/architecture-gap.md)**.

### Agents (`agents/*.md`, auto-discovered)

| Agent | Model | Status | Role |
|---|---|---|---|
| infra-planner | opus | ✅ | Ambiguous brief → sprint/roadmap with dependency edges + rollback per unit |
| iac-author | opus→sonnet | ✅ | Author Ansible roles/playbooks + `.gitlab-ci.yml` (greenfield opus; routine sonnet) |
| playbook-reviewer | sonnet | ✅ | Severity-tiered review of every MR diff |
| pci-compliance-reviewer | sonnet | ✅ | PCI control checks on changes (no-SAD, PAN-mask, TLS, SoD) |
| infra-auditor | sonnet | ✅ | Read-only discovery + drift/compliance evidence |
| sensitive-local-analyst | haiku (routing shell) | ✅ | Routes CHD-adjacent work to the on-prem local (Ollama) lane; never ingests CHD itself. NOTE: a Claude Code subagent runs on a cloud model, so the actual local inference is enforced by the `sensitivity-router` hook + `OLLAMA_BASE_URL`, not the frontmatter `model:` field. |
| change-scribe | haiku | ✅ | Generate changelog/ADR/Wiki records from merged diffs |
| knowledge-curator | sonnet (corp) / local (in-zone) | ✅ | Ingest+classify docs, answer with citations, maintain instinct ledger |
| iac-debugger | sonnet | ✅ | Diagnose red pipelines / failed runs → cited root cause + proposed fix (read-only) |
| secrets-scanner | haiku | ✅ | Deterministic pre-merge secret/PAN static scan; emits VERDICT for the merge gate |
| perso-iac-author | LOCAL (in-zone) | 🟡 proposal | In-HSA authoring (LOCAL-ONLY); inert until air-gap transfer + CPSA go-live. No PAN/keys/PIN/HSM. |
| perso-iac-reviewer | LOCAL (in-zone) | 🟡 proposal | In-HSA correctness/idempotency review (read-only, VERDICT token) |
| perso-cp-compliance-reviewer | LOCAL (in-zone) | 🟡 proposal | In-HSA PCI CP Logical + PIN compliance review (read-only, VERDICT token) |

> The three `perso-*` agents are **LOCAL-ONLY in-zone proposals** authored under the
> build authorization in `knowledge/cpsa-approval.md §1`. They are not part of the
> corporate routing in `CLAUDE.md`; they run under a separate air-gapped in-zone
> orchestrator only after the CPSA-L go-live sign-off (§2) is filled.

### Skills (`skills/<name>/SKILL.md`, lazy-loaded)

| Skill | Status | Purpose |
|---|---|---|
| ansible-patterns | ✅ | Repo layout, FQCN, idempotency, mixed Win/Linux, no-`command`/`shell` |
| ansible-testing | ✅ | yamllint→ansible-lint→syntax→`--check --diff`→Molecule idempotence |
| gitlab-cicd-pipeline | ✅ | Stages, `environment:`, protected envs, CI components, runner tags |
| octopus-release | ✅ | GitLab→Octopus integration, lifecycles, manual-intervention gate |
| drift-detection | ✅ | Scheduled `--check --diff`, ARA tagging, drift→alert |
| pci-dss-compliance | ✅ | Corporate DSS controls (modeled on ECC healthcare-phi-compliance) |
| pci-cp-compliance | ✅ | Card Production Logical+PIN constraints for in-zone work (docs/infra-agent/DESIGN.md §7) |
| pci-pin-awareness | ✅ (in-zone) | PIN Security recognition vocabulary — recognize/refuse/route PIN data + keys; never handle |
| perso-change-control | ✅ (in-zone) | In-zone test→live dual-control, witnessed sign-off, SoD (CP Logical §6.2–6.6) |
| change-documentation | ✅ | The rework of the `documentation` playbook + auto-doc generation |
| multi-env-promotion | ✅ | dev→test→staging→prod, build-once-promote-one-artifact |
| secrets-vault | ✅ | Vault references, runtime lookups, `no_log`, never plaintext |
| knowledge-curation | ✅ | Doc ingestion + sensitivity classification + cited-answer protocol |
| instinct-promotion | ✅ | Promote observed patterns to governed instincts |
| instinct-rollback | ✅ | Rollback or deactivate instincts with governance |
| iac-sast-scanning | ✅ | Binding CI security gate (ansible-lint/gitleaks/TruffleHog/Checkov, SARIF) |
| pre-commit-and-secret-scanning | ✅ | Fast developer-machine tier; pre-commit ⊆ CI |
| supply-chain-and-sbom | ✅ | SBOM (syft), artifact signing/attestation, dependency pinning (PCI 6.3.2) |
| rollback-and-runbooks | ✅ | Forward-fix vs roll-back, artifact redeploy, runbooks, break-glass |
| ci-pipeline-debugging | ✅ | Safe job-log diagnosis, EE repro, failure-signature table |
| incident-response | ✅ | Bounded agent role for PCI 12.10.x / 12.10.7 (contain/preserve/escalate) |

### Hooks (`hooks/hooks.json` + `scripts/hooks/*.js`, auto-loaded)

| Hook | Event | Status | Function |
|---|---|---|---|
| infra-session-bootstrap | SessionStart | ✅ | Prime session with SPEC/TODO/knowledge + hard rules |
| pan-egress-filter | PreToolUse | ✅ | Block PAN/secret in tool input (DLP) |
| governance-ledger | PostToolUse | ✅ | Append-only, fingerprinted audit record |
| gateguard-fact-force | PreToolUse | ✅ | Demands investigation facts before Edit/Write/Bash (blast radius + rollback) |
| sensitivity-router | PreToolUse | ✅ | Route CHD-adjacent prompts to the local lane |
| governance-capture | PostToolUse | ✅ | Detect secrets/policy violations, log to State Store |
| observe-runner | PostToolUse | ✅ | Capture tool sequences for continuous learning |
| yamllint-hook | PostToolUse | ✅ | Auto-lint YAML files on Edit/Write |
| ansible-syntax-hook | PostToolUse | ✅ | Auto-run ansible-playbook --syntax-check |
| dual-control-promotion-gate | CLI/hook | ✅ | CPSA-gated dual control for HSA instinct promotion; in-zone path requires 2 distinct approvers + citation + `--cpsa-ref` + `INFRAOPS_HSA_ZONE=1` (tests: `tests/unit/dual-control.test.js`) |
| learning-promotion-gate | CLI/hook | ✅ | Block instinct promotion lacking human approval + doc citation (`--promote`/`--validate` CLI) |
| hsa-boundary-guard | PreToolUse (in-zone) | ✅ | In-zone tripwire: deny any tool input referencing PAN/keys/components/PINs/HSM (fail-closed). Registered in the HSA hooks config only (tests: `tests/unit/hsa-guard.test.js`) |
| block-no-verify | PreToolUse (in-zone) | ✅ | Deny Bash attempts to bypass verification hooks (`--no-verify`, `git commit -n`, hooksPath neutralization) |

### Libraries (`scripts/lib/*.js`)

| Library | Status | Purpose |
|---|---|---|
| state-store.js | ✅ | Unified JSON state/governance store (9 collections); single source of truth |
| instinct-ledger.js | ✅ | Instinct persistence (zone-segmented YAML) + governance logging via state-store |
| ollama-router.js | ✅ | Local-only inference lane (built-in http; refuses non-local endpoints) |
| siem-forwarder.js | ✅ | Forward audit/governance events to a SIEM |
| shell-substitution.js | ✅ | Shell variable substitution helper |

### Rules (`rules/**`, paths-scoped)

| Rule | Status |
|---|---|
| common/prompt-defense-baseline.md | ✅ |
| ansible/*.md (coding-style, testing, security) | ✅ |
| gitlab-ci/*, secrets/*, pci/* | ✅ |
| pci/pci-cp-compliance.md | ✅ |

### Commands (`commands/*.md`)

| Command | Status | Purpose |
|---|---|---|
| /infra-discover | ✅ | Run the capture-current-state discovery pass |
| /playbook-review | ✅ | Review a playbook/MR with the reviewer + compliance-reviewer |
| /drift-check | ✅ | Run drift detection and report |
| /knowledge-ingest | ✅ | Ingest a document into the knowledge base (classify + index) |
| /instinct-promote | ✅ | Promote observed pattern to governed instinct |
| /instinct-rollback | ✅ | Rollback or deactivate an instinct |

---

## 4. How to extend (conventions — follow these)

- **Agents:** Markdown + YAML frontmatter (`name`, `description`, `tools`, `model`, optional `color`).
  Open the body with the **Prompt Defense Baseline** (copy from `rules/common/prompt-defense-baseline.md`),
  then Mission / **Skills & Tools** / Workflow / Constraints / Output. Do **not** list agents in
  `plugin.json` (auto-discovered). In **Skills & Tools**, name the skills the agent loads and—when
  the agent authors or reviews library/framework code—grant the Context7 tools
  (`mcp__context7__resolve-library-id`, `mcp__context7__get-library-docs`) and instruct it to fetch
  current docs. Delegation routing lives in [`CLAUDE.md`](CLAUDE.md) (Claude orchestrates; subagents do the work).
- **Skills:** `skills/<name>/SKILL.md` with frontmatter (`name`, `description`) and sections
  **When to Use / How It Works / Examples**. Keep them lazy-loadable (trigger keywords in the description).
- **Hooks:** add to `hooks/hooks.json` (auto-loaded; do **not** add a `hooks` field to `plugin.json`).
  Reference scripts via `${CLAUDE_PLUGIN_ROOT}/scripts/hooks/<name>.js`. Exit 0 on parse/non-critical
  errors; keep PreToolUse hooks fast.
- **Rules:** add a YAML `paths:` glob so the rule loads only for matching files.
- **Commands:** `commands/<name>.md` with a `description:` frontmatter line.
- After adding components, update §3 status and `TODO.md`.

---

## 5. The learning / gap-filling loop (how the agent grows this out)

The agent is meant to **build the rest itself** as it gains context (docs/infra-agent/DESIGN.md §14):

1. **Ingest documentation** (`/knowledge-ingest`): network diagrams, policies, runbooks, CMDB, prior
   CPSA/QSA reports, the existing playbooks. Classify sensitivity on ingest; CHD/CP-sensitive docs
   stay on the local lane. Store under `knowledge/` (gitignored for sensitive content — see `.gitignore`).
2. **Answer the open questions with citations** — turn docs/infra-agent/DESIGN.md §17 unknowns into cited proposals
   for human confirmation.
3. **Governed self-improvement** (observe→propose→verify→promote→rollback): proposals become
   **confidence-scored, evidence-cited instinct entries** (versioned YAML under `knowledge/instincts/`).
   **Promotion requires human approval + (for compliance items) a doc citation** — never silent
   self-modification. Every step is recorded in the governance ledger.

---

## 6. Install

This directory is a self-contained Claude Code plugin **and** a standalone repository.

```bash
# From a checkout of this repo:
claude plugin marketplace add .
claude plugin install infra-ops@infra-ops

# Verify the manifest:
claude plugin validate ./.claude-plugin/plugin.json
```

For development, see [`README.md`](README.md#development) and [`CONTRIBUTING.md`](CONTRIBUTING.md).

Optional environment flags (set in your shell or Claude settings): see [`.env.example`](.env.example) for the local-model
(`OLLAMA_BASE_URL`) and audit-forwarding settings as those phases land.
