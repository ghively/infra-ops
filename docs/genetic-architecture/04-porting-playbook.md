# 04 — Porting Playbook

How to express the genome in a new framework without forking the system's soul.
Framework-specific notes assume the recommended target order from `03` (LangGraph
first, Microsoft Agent Framework as alternate); the phases apply to any target.

---

## Ground rules for every port

1. **The genome is upstream of every expression.** `genome.yaml` + class-A assets
   (`rules/`, `skills/*/SKILL.md` bodies, `knowledge/instincts/`, `templates/`,
   `schemas/`, `scripts/`) live once, in this repo, and are consumed by expressions —
   vendored or as a git submodule. Never copy-edit them per framework.
2. **Port the inner ring first** (G8 tool boundary, G9 ledger, G10 zones). An
   expression with a beautiful graph and advisory DLP is a regression, not a port.
3. **Re-bind, don't rewrite, the hook logic.** Extract the detection cores
   (Luhn/secret patterns from `pan-egress-filter.js`, sensitivity classification from
   `sensitivity-router.js`, fact-gate from `gateguard-fact-force.js`) into
   `scripts/lib/` functions with thin Claude-Code-hook wrappers, then write equally
   thin wrappers for the target (middleware / callbacks / guardrails). One logic, N
   bindings.
4. **Verdict tokens are the ABI — keep them byte-identical.** Reviewer prompts port
   verbatim; the target's structured-output feature may *additionally* enforce the
   schema, but the first-line token stays so `merge-gate.js` keeps working everywhere.
5. **Prompts port verbatim, with one edit pass.** Strip Claude-Code mechanics
   (tool names that don't exist in the target, `mcp__context7__*` references → the
   target's docs-retrieval tool) but keep mission/workflow/severity tiers/false-positive
   blocklists/output contracts untouched.

## Phase plan (any target)

| Phase | Deliverable | Genes | Effort signal |
|---|---|---|---|
| 0 | Substrate wiring: class-A assets consumable from the target repo; CI runs `conformance.js`, `merge-gate.js` truth-table test, instinct-gate negative test | G14, G5, G12 | hours |
| 1 | Roster: define the 16 agents from `agents/*.md` prompts with least-privilege tools + model tiers (HSA agents → local endpoint) | G2, G7, G10 | days |
| 2 | Inner ring: bind DLP / sensitivity / fact-gate / lint at the target's tool boundary, fail-closed; capture every tool call into the State Store (reuse `state-store.js` or write to the same schema) | G8, G9 | days |
| 3 | Topology: orchestrator + author → 3 parallel reviewers → merge-gate node (exit-code routed) → bounded remediation cycle → human escalation; depth-1 delegation enforced by structure | G1, G3, G4, G5, G6, G13 | days–weeks |
| 4 | Knowledge shim: skill index in the system prompt + load-on-demand reads; path-scoped rule injection before file-touching steps | G11 | days |
| 5 | Learning loop: `observe` capture from the target's events; `/instinct-promote`-equivalent stays the existing CLI behind a human gate (graph `interrupt()` or ticket workflow) | G12 | days |
| 6 | Conformance sign-off: run the full checklist below; red-team the inner ring | all | days |

## Target-specific notes

### LangGraph
- State schema = the Delegation Envelope (objective, input pointers, contract,
  boundaries, zone, cycle counter) — G3 becomes typed for free.
- `merge_gate` node: import the truth table from `scripts/lib/merge-gate.js` via a
  child-process call (keeps one source of truth) and route conditional edges on
  0/1/3.
- Reviewers as three parallel nodes (fan-out/fan-in); structured output per node
  enforcing the verdict schema *in addition to* the token line.
- Human gates: `interrupt()` for instinct promotion and the post-cycle-2 escalation —
  resumable days later via checkpointer, matching real approval latency.
- HSA expression: same graph, models resolved to Ollama (`OLLAMA_BASE_URL`), egress
  denied at the network layer; `hsa-boundary-guard` logic becomes a middleware that
  rejects any non-local model config at startup (fail-closed).

### Microsoft Agent Framework
- Workflow = the same topology; middleware chain hosts the G8 bindings.
- Lean on OTel exporters to feed both the State Store and the SIEM directly —
  potentially retiring `siem-forwarder.js` in this expression.
- Consider .NET for the runtime if the Windows estate team owns it; agents/prompts
  are language-neutral markdown either way.

### OpenAI Agents SDK (if chosen despite `03`'s caution)
- **Do not use handoffs.** Agents-as-tools only, called from one orchestrator agent —
  that is the only way to preserve G13.
- Input/output guardrails with tripwires host the DLP and verdict-schema checks;
  tool-level hooks host sensitivity routing.
- LiteLLM for tiering and the Ollama lane.

### CrewAI (prototype only)
- Hierarchical crew for the roster; a Flow for author→review→gate→remediate.
- Accept that G8 is advisory here; do not promote a CrewAI expression to CDE use.

### Managed Agents (corporate lane, when GA)
- Coordinator agent + roster via `multiagent`; outcomes with rubric +
  `max_iterations: 2` as the hosted G5/G6; memory stores for knowledge; vaults for
  GitLab tokens; deployments for scheduled drift checks; webhooks → ledger ingest.
- HSA stays out, permanently (inference is not air-gappable).

## Conformance checklist (gate for calling any expression "done")

- [ ] G5 truth table reproduced: (P,W,P)→clear, (P,B,P)→revise, (P,∅,P)→revise, cycle≥3+B→escalate
- [ ] Test PAN in a tool argument → denied, fail-closed, ledgered (G8/G9)
- [ ] Reviewer agent cannot write a file; scanner cannot exec (G2)
- [ ] Full chain call-graph depth ≤ 1 from orchestrator (G13)
- [ ] Instinct promotion without approver/confidence/citation → non-zero exit, ledger unchanged (G12)
- [ ] HSA expression: zero non-local network egress; zero cloud-model configs (G10)
- [ ] No-LLM CI: `conformance.js`, structure validation, preflight all green (G14)
- [ ] Token telemetry: irrelevant skills/rules not loaded on unrelated requests (G11)
- [ ] Every tool execution in a sample session has a schema-valid `governanceEvents` entry (G9)
- [ ] Hard rules hold under prompt-injection red-team (propose-never-dispose; crown jewels; zones; cite-don't-guess)

## What never gets ported (by design)

- `hooks/hooks.json`, `.claude-plugin/` — packaging for one phenotype.
- Claude Code frontmatter conventions — regenerate per target from the roster data.
- The shell-out local lane (`sensitivity-router` deny + `ollama-router.js`) — in
  model-agnostic targets it is replaced by native local-model agents; the *gene*
  (deny cloud-bound CHD work) survives as a startup/middleware check.
