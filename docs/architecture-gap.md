# Architecture Gap — design intent vs. as-built

This document is the single source of truth for how the four descriptions of this
plugin relate to each other:

- **DESIGN** — `docs/infra-agent/DESIGN.md` (the full ambition)
- **SPEC** — `SPEC.md` (the buildable subset / intended-as-built)
- **README** — `README.md` (the front door)
- **CODE** — what actually runs

It exists because these artifacts drifted: DESIGN/SPEC overclaimed completion in two
areas, while the README undercounted what was built. Keep this table honest; update it
whenever a component's wiring changes.

Legend: ✅ built & wired · 🟡 partial / advisory · ⬜ documented only (not code) · ➖ n/a

---

## Dimension-by-dimension

| Dimension | DESIGN intends | SPEC claims | README says | CODE (as-built) |
|---|---|---|---|---|
| **Zones / deployments** | Two: corporate (DSS) **and** air-gapped in-HSA | One PoC (corp); HSA "later phase" | One harness + local lane | ✅ corporate zone; 🟡 HSA **tooling authored as proposals** (perso-* agents, runbooks, dual-control gate+tests, `knowledge/cpsa-approval.md`); ⬜ in-zone **deployment/go-live** still gated on CPSA-L sign-off (§2 PENDING) |
| **Local model lane** | Classifier → local Ollama, **egress blocked**; enforced by hooks | Hook enforces local inference | "Local Lane (Ollama)" capability | ✅ `scripts/lib/ollama-router.js` (local-only HTTP, no cloud SDK, refuses non-local) + `sensitivity-router` gate (advisory default, deny under fail-closed). ⚠️ caveat below |
| **PAN/secret DLP** | CHD never enters a model/tool context | `pan-egress-filter` ✅ | DLP ✅ | ✅ Luhn + secret regex; honors `INFRAOPS_DLP_FAIL_CLOSED` |
| **Agents** | ~10–11 (incl. 3 HSA `perso-*`) | 10 | 10 (✅) | ✅ 10 corporate agents (+iac-debugger, secrets-scanner); 🟡 3 HSA `perso-*` agents authored as LOCAL-ONLY proposals (`perso-iac-author`, `perso-iac-reviewer`, `perso-cp-compliance-reviewer`) — inert until air-gap transfer + CPSA go-live |
| **Standards enforcement** | hooks enforce, not prompts | rules + skills + agent checklists | — | ✅ path-scoped `rules/**` auto-inject (deterministic); skills teach; **binding** = hooks + `iac-sast-scanning` CI gate + deterministic merge gate (reviewers advise) |
| **Hooks** | per-zone sets incl. `hsa-boundary-guard`, `block-no-verify` | 11 ✅ | 3 ✅ | ✅ 11 scripts; 9 wired in `hooks.json`; 2 promotion gates are CLI-invoked (not event hooks); some DESIGN-named hooks never built |
| **State Store** | one shared store + append-only ledger | `state-store.js` (7 collections) + SIEM | (omitted) | ✅ unified: `state-store.js` (9 collections) is the one store; gates log through `instinct-ledger.js` → it. `governance-ledger` JSONL audit + `siem-forwarder` are separate **by design** (audit/forwarding, not state) |
| **Learning loop** | observe→propose→verify→promote→rollback, gated | all ✅ | bullet only | ✅ wired: `observe-runner`→store; `/instinct-promote`→`learning-promotion-gate --promote`→`instinct-ledger`→governance event; `/instinct-rollback`→`instinct-ledger --rollback`; HSA dual-control via `--check` |
| **Skills** | per-zone lists | 19 ✅ | 11 🟡 | ✅ 19 (+iac-sast-scanning, rollback-and-runbooks, ci-pipeline-debugging, incident-response, pre-commit-and-secret-scanning, supply-chain-and-sbom; instinct skills rewritten) |
| **Commands** | — | 6 ✅ | 4 🟡 | ✅ 6 (instinct-promote/-rollback added) |
| **CI / tests** | test gates per phase | implied green | `npm test` | ✅ `npm test` runs 4 validators + 3 unit suites (all green); `npm run lint` (eslint flat config + markdownlint) green. Previously broken (missing `run-all.js`, broken hook validator, no lint config) |

---

## The one honest caveat on the local lane

DESIGN §4 imagines the *agent itself* thinking on a local model for sensitive work.
In the Claude Code harness, a hook **cannot** redirect the orchestrator's (or a
subagent's) own inference to Ollama — subagents run on the configured cloud model.

So the **real, buildable** local lane is:

1. `scripts/lib/ollama-router.js` — a local-only inference path (built-in `http`
   only; refuses non-local endpoints) that the `sensitive-local-analyst` agent
   **shells out to** for the actual sensitive processing, keeping that processing
   off the cloud.
2. `sensitivity-router` — detects CHD-adjacent tool calls and, under
   `INFRAOPS_SENSITIVE_FAIL_CLOSED=1`, **denies** them so sensitive content cannot
   proceed on the cloud path; advisory otherwise (to avoid keyword false positives).

This is a genuine boundary, but it is **opt-in enforcement + shell-out**, not
transparent in-context local inference. Treat the frontmatter `model:` field on
"local" agents as a label, not an enforcement mechanism.

---

## What still remains (pre-1.0)

- 🟡 **HSA / in-zone tooling** — the `perso-*` agents, runbooks, and in-zone
  dual-control gate are **authored as proposals** (build authorized per
  `knowledge/cpsa-approval.md §1`) but are inert corporate-side.
- ⬜ **HSA / in-zone deployment (go-live)** — still gated: requires the CPSA-L
  sign-off in `knowledge/cpsa-approval.md §2` (PENDING) before air-gap transfer +
  in-zone activation (DESIGN §14 Phase 7). No crown-jewels material is ever authored
  here (no PAN/keys/PINs/HSM config — CLAUDE.md rule #2, no exception).
- ⬜ **Operational standup** — local Ollama box + model registration; GitLab
  service accounts; `knowledge/environment.md` (the auditor's published map).
- 🟡 **Cited answers to the open scoping questions** (network segmentation,
  DSS-vs-CP split, HSM vendor, Octopus Tentacle inventory) — DESIGN §17.
