# infra-ops — Gap Analysis and Prioritized Backlog

_Generated: 2026-06-06 via deep-init analysis. Check off items as they land._
_Companion: [deep-init-reference.md](./2026-06-06-deep-init-reference.md)_
_Authoritative status: [docs/architecture-gap.md](../../architecture-gap.md)_

---

## Current version: v0.10.0

**What's fully built and wired (tested via `npm test`):**
- All 10 corporate agents, 19 skills, 6 commands
- Full hook set (9 event-wired + 2 CLI gates)
- DLP (`pan-egress-filter`) with fail-closed option
- Local inference lane (`ollama-router.js`) + enforcing `sensitivity-router`
- Unified State Store (9 collections); governed learning loop end-to-end
- SIEM forwarding capability
- CPSA-gated HSA deployment **documentation** (no in-zone code)

**Legend:** `[ ]` todo · `[~]` partial / advisory only · `[x]` done · `[🔒]` CPSA-gated (do not build)

---

## P0 — Operational Blockers (nothing works without these)

These items must land before the plugin can reason about a real estate.

- [ ] **Stand up local model** — register Ollama on the PoC box with a tool-calling
      model (Qwen2.5-Coder-32B or Qwen3-Coder-30B-A3B); set `OLLAMA_BASE_URL`.
      Without this, the local lane is wired but the endpoint is unreachable.
      _Ref: DESIGN §5, SPEC Phase 0._

- [ ] **Create GitLab service accounts** — CI token with read + branch/MR write only
      (no protected branch, no prod). Document permissions in `knowledge/environment.md`.
      _Ref: SPEC Phase 0._

- [ ] **Produce `knowledge/environment.md`** — run `/infra-discover` against the real
      GitLab project and the two existing playbooks. This is the orchestrator's ground
      truth for reasoning about the estate. Currently absent.
      _Ref: SPEC §1, knowledge/README.md._

---

## P1 — Pre-1.0 (blocks full correctness)

- [ ] **Cited answers to the DESIGN §17 open scoping questions** — ingest available
      documentation and produce confidence-scored cited proposals (for human
      confirmation) on:
      - Network segmentation status between corporate and HSA zones
      - DSS-vs-CP system split (which systems are in which scope)
      - HSM vendor and model
      - Octopus Deploy Tentacle inventory (count, targets, environments)
      _Ref: SPEC Phase 1._

- [x] **State Store schema drift** — `schemas/state-store.schema.json` defines 7
      collections but `scripts/lib/state-store.js` implements 9 (`knowledgeBase` and
      `observations` are present in code but absent from the schema). Update the schema
      to match, then add schema-validation to `tests/ci/validate-hooks.js`.

- [x] **Env-var namespace standardization** — some hooks still use `INFRA_OPS_*`
      prefixes (`INFRA_OPS_YAMLLINT`, `INFRA_OPS_ANSIBLE_SYNTAX`) while the standard is
      `INFRAOPS_*`. Standardize before 1.0 to avoid operator confusion.
      _Affected files: `hooks/hooks.json`, `yamllint-hook.js`, `ansible-syntax-hook.js`._

- [x] **Decide `pan-egress-filter` fail-closed posture** — now fail-closed by default.
      `INFRAOPS_DLP_FAIL_CLOSED=0` to loosen. Same for `sensitivity-router`
      (`INFRAOPS_SENSITIVE_FAIL_CLOSED=0`). Both flipped in v0.11.0.

---

## P2 — Quality and Operational Hardening

- [~] **Runner topology split** — the single Linux box currently hosts both the agent
      and the GitLab runner at the same trust level. Target topology (documented in
      `knowledge/runner-topology.md`) separates CI runner (Docker), Deploy runner
      (Shell), Windows Build runner, and HSA runner (air-gapped). Migration path is
      defined in phases:
      - [ ] Phase 1: Register CI Runner (Docker) + Deploy Runner (Shell); tag `.gitlab-ci.yml`
      - [ ] Phase 2: Add Windows Build Runner
      - [ ] Phase 3: 🔒 HSA runners (CPSA-gated — do not build yet)
      - [ ] Phase 4: Decommission single-box topology

- [ ] **Wire SIEM endpoint** — `siem-forwarder.js` is implemented but requires
      `INFRAOPS_AUDIT_FORWARD` to be set to a real SIEM endpoint. Until set, governance
      events are stored in State Store only. Required for PCI CP §6.4 retention.

- [ ] **`knowledge/environment.md` freshness loop** — schedule periodic re-runs of
      `/infra-discover` and establish a process for updating the environment map when
      topology changes. Currently a manual step.

- [ ] **Molecule test coverage for existing playbooks** — the `ansible-testing` skill
      defines the Molecule idempotence pipeline but existing playbooks (updates,
      documentation) have no Molecule scenarios yet. New roles ship with tests per
      SPEC §4; retrofit backlog for existing ones.

---

## P3 — Future / Gated

- [🔒] **HSA in-zone deployment** — do not build until a CPSA reviews the design
      (DESIGN §14 Phase 7). When unblocked:
      - Deploy plugin to air-gapped in-zone GitLab instance
      - Build `perso-*` agents for personalization workloads
      - Wire `dual-control-promotion-gate` for HSA instinct promotion
      - Validate `knowledge/hsa-deployment.md` against actual HSA topology

- [x] **`perso-*` agent suite** — perso-planner, perso-reviewer, perso-auditor, perso-scribe built as full design artifacts; CPSA gates deployment only, not development.

---

## Per-component status table

### Agents

| Agent | Built | Wired | Next action |
|-------|-------|-------|-------------|
| infra-planner | ✅ | ✅ | — |
| iac-author | ✅ | ✅ | — |
| playbook-reviewer | ✅ | ✅ | — |
| pci-compliance-reviewer | ✅ | ✅ | — |
| secrets-scanner | ✅ | ✅ | — |
| infra-auditor | ✅ | ✅ | Run `/infra-discover` to produce environment.md (P0) |
| sensitive-local-analyst | ✅ | 🟡 advisory | Set OLLAMA_BASE_URL + INFRAOPS_SENSITIVE_FAIL_CLOSED=1 (P0) |
| knowledge-curator | ✅ | ✅ | Ingest docs once environment.md exists (P1) |
| change-scribe | ✅ | ✅ | — |
| iac-debugger | ✅ | ✅ | — |
| perso-planner / perso-reviewer / perso-auditor / perso-scribe | ✅ | ⬜ | CPSA gates deployment; development complete |

### Skills

All 19 skills: ✅ built. No gaps.

### Hooks

| Hook | Built | Wired | Notes |
|------|-------|-------|-------|
| infra-session-bootstrap | ✅ | ✅ | — |
| pan-egress-filter | ✅ | ✅ | Fail-closed by default (v0.11.0) |
| sensitivity-router | ✅ | ✅ fail-closed | Fail-closed by default (v0.11.0) |
| gateguard-fact-force | ✅ | ✅ | — |
| governance-capture | ✅ | ✅ | — |
| observe-runner | ✅ | ✅ (async) | — |
| governance-ledger | ✅ | ✅ (async) | — |
| yamllint-hook | ✅ | ✅ | Env var uses `INFRA_OPS_*` — standardize (P1) |
| ansible-syntax-hook | ✅ | ✅ | Env var uses `INFRA_OPS_*` — standardize (P1) |
| learning-promotion-gate | ✅ | CLI only | — |
| dual-control-promotion-gate | ✅ | CLI only | Only meaningful once HSA is operational |

### Commands

All 6 commands: ✅ built. `/infra-discover` needs running against real estate (P0).

### Libraries

| Library | Built | Notes |
|---------|-------|-------|
| state-store.js | ✅ | 9 collections |
| instinct-ledger.js | ✅ | Zone-segmented, governance-logged |
| ollama-router.js | ✅ | Requires OLLAMA_BASE_URL to be operational |
| siem-forwarder.js | ✅ | Requires INFRAOPS_AUDIT_FORWARD endpoint (P2) |
| shell-substitution.js | ✅ | — |

---

## Known design constraints and caveats

### Local lane is shell-out, not in-context inference
Claude Code hooks cannot redirect the orchestrator's own inference to Ollama. The local
lane boundary is `sensitivity-router` denial + `ollama-router.js` shell-out. The `model:`
frontmatter on `sensitive-local-analyst` is a label. This is a permanent architectural
constraint of the Claude Code harness, not a fixable gap.

### CPSA gate is a hard prerequisite for HSA
The in-zone deployment, perso-* agents, and HSA runner registration must not proceed
without CPSA sign-off. This is a compliance requirement, not a technical gap.
Do not route around it.

### Single-box topology is a known PCI gap
Co-locating the agent host and GitLab runner at the same trust level violates the
principle of least privilege for a CDE. The runner topology split (P2) resolves this.
Until resolved, treat the PoC as corporate-zone development only.

### Env-var namespace drift — resolved in v0.11.0
Both hooks now use `INFRAOPS_YAMLLINT` and `INFRAOPS_ANSIBLE_SYNTAX` as canonical names.
`INFRA_OPS_*` back-compat aliases are retained for existing deployments.
