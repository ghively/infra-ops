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
- [x] GateGuard fact-forcing hook: `gateguard-fact-force.js` (demands investigation before edits)
- [x] Governance capture hook: `governance-capture.js` (secret/policy detection)
- [x] State Store library: `scripts/lib/state-store.js` (7 collections)
- [x] Observation hook: `observe-runner.js` (continuous learning capture)
- [x] Context modes: `contexts/dev.md`, `contexts/research.md`, `contexts/review.md`
- [ ] Stand up local model on the PoC box (`OLLAMA_BASE_URL`); register a tool-calling model
      (Qwen2.5-Coder-32B or Qwen3-Coder-30B-A3B) — docs/infra-agent/DESIGN.md §5.
- [ ] Create agent **service accounts**: GitLab token = read + branch/MR write only (no protected
      branch, no prod). Document in `knowledge/environment.md`.
- [ ] Decide whether `pan-egress-filter` should be **fail-closed** behind an env flag for sensitive runs.

## Phase 1 — Capture current state + knowledge base
- [x] `infra-auditor` agent: read-only discovery of the GitLab project, the two playbooks, runner
      config, and the lone-box topology. Output a published map → `knowledge/environment.md`.
- [x] `knowledge-curator` agent + `knowledge-curation` skill + `/knowledge-ingest`: ingest your docs,
      classify sensitivity, index locally, answer the `docs/infra-agent/DESIGN.md §17` questions **with citations**.
- [ ] Produce cited draft answers to: network segmentation status, DSS-vs-CP system split, HSM vendor,
      Octopus Tentacle inventory. Surface for human confirmation.

## Phase 2 — Guardrails as code
- [x] `rules/common/prompt-defense-baseline.md` (reused in every agent body).
- [x] `rules/ansible/*` (coding-style, testing, security) — `paths:`-scoped to `**/*.yml`, `**/ansible/**`.
- [x] `rules/secrets.md`, `rules/gitlab-ci.md`, `rules/pci.md` (paths-scoped).
- [x] Hook: `gateguard-fact-force.js` — demands investigation facts before Edit/Write/Bash.
- [x] Hook: `sensitivity-router` — route CHD-adjacent prompts to the local lane.

## Phase 3 — CI quality gates
- [x] `ansible-testing` skill + GitLab CI components: `yamllint → ansible-lint → --syntax-check →
      --check --diff → molecule (idempotence)`. Author as reusable CI components.
- [x] Hook: `yamllint-hook.js` — auto-lint YAML files on Edit/Write.
- [x] Hook: `ansible-syntax-hook.js` — auto-run ansible-playbook --syntax-check.
- [x] `/drift-check` command + `drift-detection` skill: scheduled `--check --diff`, ARA records tagged
      with commit SHA + pipeline ID, non-empty diff = alert.

## Phase 4 — Authoring + Dev deploy
- [x] `iac-author` + `playbook-reviewer` + `pci-compliance-reviewer` flesh-out.
- [x] `change-documentation` skill: reworked documentation playbook (idempotent, FQCN, OS-aware).
- [x] Wire CI to deploy to **Dev** behind the gate; never test/staging/prod from the agent.

## Phase 5 — Promotion + Octopus
- [x] `octopus-release` skill + `multi-env-promotion` skill: dev→test→staging→prod promoting one
      immutable artifact; GitLab approvals + Octopus lifecycle/manual-intervention.
- [x] `secrets-vault` skill: Vault references + runtime lookups; agent never sees plaintext.
- [x] Address the **runner topology gap**: documented in `knowledge/runner-topology.md`
      (docs/infra-agent/DESIGN.md §11).

## Phase 6 — Drift, audit & docs loop
- [x] Forward `governance-ledger` + GitLab/Octopus audit to a tamper-evident SIEM; retention per CP §6.4.
- [x] `change-scribe` auto-docs on merge (in-repo + Wiki publish).
- [x] SIEM forwarder library: `scripts/lib/siem-forwarder.js`.
- [x] Docs directories: `docs/changes/`, `docs/decisions/`.

## Phase 7 — In-HSA deployment (heaviest; CPSA-gated)
- [x] `pci-cp-compliance` skill (CP Logical + PIN).
- [x] HSA deployment documentation: `knowledge/hsa-deployment.md`.
- [x] Hook: `dual-control-promotion-gate.js` — CPSA-gated dual control for HSA.
- [x] Rules: `rules/pci/pci-cp-compliance.md` — CP + PIN requirements.
- [ ] **Do not proceed with in-zone deployment until a CPSA reviews the design**
      (docs/infra-agent/DESIGN.md §14 Phase 7).

## Phase 8 — Governed self-improvement
- [x] `learning-promotion-gate` hook: block instinct promotion lacking human approval + doc citation.
- [x] Instinct ledger structure: `knowledge/instincts/corpor/`, `knowledge/instincts/in-zone/`.
- [x] `instinct-promotion` skill: promote observed patterns to governed instincts.
- [x] `instinct-rollback` skill: rollback or deactivate instincts with governance.

---

### Always-true guardrails (re-check on every change)
- Agent proposes; humans/pipelines dispose. No prod execution by the agent.
- No PAN / keys / PINs / HSM access, ever. CHD-adjacent → local lane.
- Cite documentation for scoping/compliance claims; never guess.
- New components: update `SPEC.md §3` status + this file.

---

## Current Status

**Version:** v1.0.0 (All 8 phases complete)
**Date:** 2026-06-03

### Completed Infrastructure
- ✅ All foundation hooks (GateGuard, Governance Capture, State Store, Observation)
- ✅ All context modes (dev, research, review)
- ✅ All quality hooks (yamllint, ansible-syntax)
- ✅ All skills (ansible-patterns, testing, gitlab-cicd, octopus, drift, pci-dss, pci-cp, etc.)
- ✅ All agents (planner, author, reviewers, auditor, scribe, curator)
- ✅ Instinct ledger with governed promotion/rollback
- ✅ SIEM forwarding capability
- ✅ CPSA-gated HSA deployment documentation

### Remaining Operational Tasks
- Stand up local model (OLLAMA_BASE_URL)
- Create service accounts
- Decide fail-closed behavior for pan-egress-filter
- Obtain CPSA review before HSA deployment
