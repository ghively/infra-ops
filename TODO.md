# infra-ops — Build Backlog

Ordered, checkbox backlog for building out the plugin. Each item has enough instruction for the agent
to execute when it has context. Follow the conventions in [`SPEC.md §4`](SPEC.md#4-how-to-extend-conventions-follow-these); justify decisions against
[`docs/infra-agent/docs/infra-agent/DESIGN.md`](docs/infra-agent/docs/infra-agent/DESIGN.md). Keep the hard trust boundary ([`SPEC.md §2`](SPEC.md#2-the-hard-trust-boundary-never-violate)) inviolable.

Status legend: `[ ]` todo · `[~]` scaffolded (flesh out) · `[x]` done.

---

## Phase 0 — Foundations (PoC on the single Linux box)
- [x] Plugin manifest + marketplace (`.claude-plugin/`)
- [x] Safety hook: `pan-egress-filter` (PreToolUse DLP)
- [x] Audit hook: `governance-ledger` (PostToolUse, fingerprinted)
- [x] Session primer: `infra-session-bootstrap`
- [ ] Stand up local model on the PoC box (`OLLAMA_BASE_URL`); register a tool-calling model
      (Qwen2.5-Coder-32B or Qwen3-Coder-30B-A3B) — docs/infra-agent/DESIGN.md §5.
- [ ] Create agent **service accounts**: GitLab token = read + branch/MR write only (no protected
      branch, no prod). Document in `knowledge/environment.md`.
- [ ] Decide whether `pan-egress-filter` should be **fail-closed** behind an env flag for sensitive runs.

## Phase 1 — Capture current state + knowledge base
- [~] `infra-auditor` agent: read-only discovery of the GitLab project, the two playbooks, runner
      config, and the lone-box topology. Output a published map → `knowledge/environment.md`.
- [~] `knowledge-curator` agent + `knowledge-curation` skill + `/knowledge-ingest`: ingest your docs,
      classify sensitivity, index locally, answer the `docs/infra-agent/DESIGN.md §17` questions **with citations**.
- [ ] Produce cited draft answers to: network segmentation status, DSS-vs-CP system split, HSM vendor,
      Octopus Tentacle inventory. Surface for human confirmation.

## Phase 2 — Guardrails as code
- [~] `rules/common/prompt-defense-baseline.md` (reused in every agent body).
- [~] `rules/ansible/*` (coding-style, testing, security) — `paths:`-scoped to `**/*.yml`, `**/ansible/**`.
- [ ] `rules/secrets.md`, `rules/gitlab-ci.md`, `rules/pci.md` (paths-scoped).
- [ ] Hook: `infra-gateguard` (DENY→FORCE→ALLOW) — adapt ECC `scripts/hooks/gateguard-fact-force.js`;
      demand blast-radius + rollback before any infra-affecting Edit/Write/Bash. Wire in `hooks.json`.
- [ ] Hook: `sensitivity-router` — route CHD-adjacent prompts to the local lane.

## Phase 3 — CI quality gates
- [~] `ansible-testing` skill + GitLab CI components: `yamllint → ansible-lint → --syntax-check →
      --check --diff → molecule (idempotence)`. Author as reusable CI components.
- [ ] `/drift-check` command + `drift-detection` skill: scheduled `--check --diff`, ARA records tagged
      with commit SHA + pipeline ID, non-empty diff = alert.

## Phase 4 — Authoring + Dev deploy
- [~] `iac-author` + `playbook-reviewer` + `pci-compliance-reviewer` flesh-out.
- [ ] **Rework the `documentation` playbook** (the explicit ask): use `change-documentation` skill;
      make it idempotent, FQCN, OS-aware; generate in-repo docs + publish to GitLab Wiki.
- [ ] Wire CI to deploy to **Dev** behind the gate; never test/staging/prod from the agent.

## Phase 5 — Promotion + Octopus
- [ ] `octopus-release` skill + `multi-env-promotion` skill: dev→test→staging→prod promoting one
      immutable artifact; GitLab approvals + Octopus lifecycle/manual-intervention. docs/infra-agent/DESIGN.md §10–§12.
- [ ] `secrets-vault` skill: Vault references + runtime lookups; agent never sees plaintext.
- [ ] Address the **runner topology gap**: split CI vs deploy vs Windows-build trust levels
      (docs/infra-agent/DESIGN.md §11) — today it's one box doing everything.

## Phase 6 — Drift, audit & docs loop
- [ ] Forward `governance-ledger` + GitLab/Octopus audit to a tamper-evident SIEM; retention per CP §6.4.
- [ ] `change-scribe` auto-docs on merge (in-repo + Wiki publish).

## Phase 7 — In-HSA deployment (heaviest; CPSA-gated)
- [ ] `pci-cp-compliance` skill (CP Logical + PIN). Air-gapped in-zone deployment, local-only model,
      authoring/advisory ONLY, `dual-control-promotion-gate`. **Do not start until a CPSA reviews the
      design** (docs/infra-agent/DESIGN.md §14 Phase 7).

## Phase 8 — Governed self-improvement
- [ ] `learning-promotion-gate` hook: block instinct promotion lacking human approval + doc citation.
- [ ] Instinct ledger as versioned YAML under `knowledge/instincts/`; observe→propose→verify→
      promote→rollback. Zone-sandboxed. docs/infra-agent/DESIGN.md §14.

---

### Always-true guardrails (re-check on every change)
- Agent proposes; humans/pipelines dispose. No prod execution by the agent.
- No PAN / keys / PINs / HSM access, ever. CHD-adjacent → local lane.
- Cite documentation for scoping/compliance claims; never guess.
- New components: update `SPEC.md §3` status + this file.
