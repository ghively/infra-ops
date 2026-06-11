# 01 — Deep Analysis of the infra-ops Plugin (v0.14.0)

What the system actually does, what is load-bearing, and how tightly each part is
coupled to the Claude Code harness. This is the evidence base for the genome in
`02-genome.md`.

---

## 1. What the system is

infra-ops is a **governed multi-agent orchestration system for PCI-regulated
infrastructure work** (Ansible + self-hosted GitLab CI + Octopus Deploy, card-manufacturer
scope: PCI DSS + PCI Card Production + PIN). It is currently packaged as a Claude Code
plugin, but its design center is *not* "help write playbooks" — it is **making an LLM
agent admissible in a CDE**: every action audited, every dangerous action structurally
impossible, every merge gated deterministically, every learned behavior human-approved.

Three design moves define it:

1. **Lean orchestrator, isolated specialists.** The main thread classifies and routes;
   16 specialist agents (10 corporate, 6 air-gapped HSA) do the work in fresh contexts
   and return structured results. Chaining is owned by the orchestrator; subagents never
   call each other (no fan-out explosions, no context bleed).
2. **Enforcement in code, not prompts.** 9 event-wired hooks + 4 CLI gates sit at the
   tool boundary: a Luhn-validating PAN/DLP filter (fail-closed), a sensitivity router
   that denies CHD-adjacent work toward a local Ollama lane, an investigation gate that
   demands blast-radius/rollback facts before edits, post-edit lint/syntax gates, and
   async governance capture into an append-only State Store (PCI Req 10). The system
   prompt could be ignored entirely and the crown-jewel rules would still hold.
3. **Determinism wherever judgment is dangerous.** The merge decision is not an LLM
   opinion: three reviewers (correctness, PCI compliance, secrets) emit machine-readable
   `VERDICT: PASS|WARN|BLOCK` tokens, and `scripts/merge-gate.js` computes the outcome
   (any BLOCK → blocked; missing verdict → blocked; exit 0/1/3). The remediation loop is
   capped at 2 cycles, then escalates to a human. Scaffolding, structure conformance,
   and deployment policy are likewise scripts, not vibes.

On top of that sits a **governed learning loop** (observations → instinct candidates →
human-gated promotion with confidence floor ≥0.7 + citations for compliance items →
zone-segmented YAML ledger → rollback with dual control for HSA) and a **knowledge
discipline** ("cite, don't guess"; environment map as shared ground truth; Context7 for
current library docs instead of model memory).

## 2. Component map and what each is *for*

| Layer | Components | Architectural job |
|---|---|---|
| Routing | `CLAUDE.md` delegation map, 8 commands, 3 contexts | Classify request → right specialist, right zone, right mode |
| Specialists | `agents/*.md` (16) | Isolated competence + machine-readable output contracts |
| Quality gates | playbook-reviewer + pci-compliance-reviewer + secrets-scanner → `merge-gate.js` | Deterministic, parallel, no-discretion merge decision |
| Enforcement | `hooks/hooks.json` + `scripts/hooks/*` (13) | Tool-boundary guardrails: DLP, zone routing, investigation gate, lint, audit |
| Knowledge | `skills/` (24), `rules/` (13), `knowledge/`, contexts | Lazy-loaded expertise; path-scoped standards; cited ground truth |
| Learning | `observe-runner` → `knowledge-curator` → `/instinct-promote` → `instinct-ledger.js` | Self-improvement that cannot self-promote |
| Memory/audit | `scripts/lib/state-store.js` (9 collections), `siem-forwarder.js` | Append-only governance ledger; PCI Req 10; SIEM egress |
| Determinism | `scaffold.js`, `validate-structure.js`, `conformance.js`, `preflight.js`, `templates/` | Repeatable artifacts independent of any LLM |
| Zones | corporate vs `hsa`, `perso-*` agents, `ollama-router.js`, dual-control gates | PCI CP/PIN air-gap; local-only inference lane |

## 3. What is genuinely good (worth carrying into any port)

- **The verdict-token + deterministic-gate pattern.** Reviewer LLMs produce a parseable
  first line; a 60-line script makes the decision. This converts "LLM-as-judge" into
  "LLM-as-witness, code-as-judge" — the single most transplantable idea in the repo.
- **Fail-closed posture at the tool boundary.** `pan-egress-filter` and
  `sensitivity-router` default fail-closed (since v0.11.0). Most agent frameworks ship
  guardrails as advisory; this repo treats them as load-bearing.
- **The Delegation Envelope.** Every Task call must carry Objective / Inputs (pointers,
  not pasted bodies) / Output contract / Boundaries. This is a wire protocol for
  agent-to-agent work that costs nothing and prevents the two classic failures:
  context bloat and unparseable results.
- **Bounded remediation.** Author → 3 reviewers → at most 2 revision cycles → human.
  Caps are explicit, escalation is an exit code (3), never "try harder."
- **Learning with a constitution.** Instincts are YAML with provenance (evidence,
  citation, approver, confidence); promotion is a gated CLI, not a prompt; HSA
  promotion needs two humans. Rollback is first-class. Nothing learns silently.
- **Zone model as data.** `zone: corporate|hsa` tags on agents/skills/instincts make
  the air-gap a queryable property rather than tribal knowledge.
- **Everything deterministic is a Node CLI with exit codes.** That choice — probably
  made for hook compatibility — is what makes the genome portable: CI, LangGraph nodes,
  MAF executors, and OpenAI tool functions can all shell out to the same scripts.

## 4. Weaknesses and risks (independent of framework)

- **The orchestration contract is prose.** The delegation map, review-gate topology,
  and no-re-delegation rule live in `CLAUDE.md` as instructions to a model. They are
  *conventions* the orchestrator is asked to follow, only partially backed by code
  (merge-gate is enforced; "always run three reviewers in parallel" is not). Graph
  frameworks would make this structural — see `03`.
- **Referenced spec is missing.** `CLAUDE.md` points to
  `docs/superpowers/specs/2026-06-06-deep-init-reference.md`, which does not exist in
  the repo (only the gap-analysis does). Onboarding currently depends on a dead link.
- **Hook semantics are mostly single-threaded through Node + stdin JSON.** Fine for
  Claude Code; but the rule logic (e.g., Luhn matching) is embedded in hook scripts
  rather than exposed as a library-with-adapters, so each port re-wraps it.
- **State Store is local JSON with TTL/size pruning** (~/.infra-ops, 30 days, 1000
  entries/collection). Adequate for a PoC; a Req-10-grade deployment needs the SIEM
  forwarder wired (P2 in gap analysis) or a real append-only backend.
- **P0 operational blockers remain** (no local model registered, no GitLab service
  accounts, no `knowledge/environment.md`) — the genome is built; the organism hasn't
  eaten yet.

## 5. Coupling analysis — Claude Code-specific vs portable

### Class C (harness-coupled, thin layer)

| Artifact | Coupling | Port cost |
|---|---|---|
| `.claude-plugin/plugin.json`, `marketplace.json` | Plugin packaging | Trivial — re-package per target |
| `hooks/hooks.json` (SessionStart/PreToolUse/PostToolUse, matchers, `${CLAUDE_PLUGIN_ROOT}`) | Claude Code hook events + stdin/stdout protocol | Low–medium — *bindings* are per-framework; the logic inside the scripts is portable |
| Agent `.md` frontmatter (`tools:`, `model:`, `color:`) and Task-tool dispatch | Claude Code subagent mechanics | Low — prompts port verbatim; dispatch re-expressed |
| Skills auto-trigger + path-scoped rule injection | Harness loading behavior | Medium — most frameworks have no native progressive disclosure; needs a retrieval/system-prompt shim |
| `sensitive-local-analyst` "local lane" via shell-out | **Permanent constraint of Claude Code**: hooks cannot redirect the orchestrator's own inference to Ollama; `model:` on that agent is a label (gap-analysis §known constraints) | **Negative cost** — model-agnostic frameworks route the agent itself to Ollama natively, which *fixes* this |

### Class B (patterns to re-express)

Orchestrator contract; 16-agent roster + delegation envelope; 3-reviewer parallel gate
topology; 2-cycle remediation loop; model tiering (opus/sonnet/haiku per task economics);
learning-loop wiring; zone routing; human gates.

### Class A (ports verbatim — the majority of the repo's mass)

`rules/**` (13 files), `skills/**` markdown bodies (24), `knowledge/**` incl. instinct
YAML + zones, `templates/**` (8 unit types), `schemas/state-store.schema.json`,
`scripts/merge-gate.js`, `scripts/lib/*` (state-store, instinct-ledger, siem-forwarder,
deployment-policy, structure-spec, retry), `scaffold.js`, `validate-structure.js`,
`conformance.js`, `preflight.js`, `.gitlab-ci/components/**`, `tests/**`. None of these
import anything from the harness; they are Node CLIs and data.

### The pivotal observation

The system was *accidentally* built genome-first: because Claude Code hooks demand
standalone executables and agents demand markdown-with-contracts, almost everything
load-bearing is already framework-neutral text or scripts. The Claude Code-specific
surface is wiring, not substance. That is what makes the genetic-architecture framing
honest rather than aspirational.

## 6. The one constraint a port can dissolve

The gap analysis records as *permanent*: "Claude Code hooks cannot redirect the
orchestrator's own inference to Ollama. The local lane boundary is sensitivity-router
denial + ollama-router.js shell-out." In any model-agnostic framework (LangGraph,
CrewAI, Microsoft Agent Framework, Google ADK — or a custom Claude Agent SDK harness
pointed at a local OpenAI-compatible endpoint), the HSA/CHD-adjacent agents simply
*are* local-model agents: the same roster, with `model:` resolved to a Qwen-coder
endpoint, inside the air gap. The sensitivity-router gene survives (you still deny
cloud-bound calls), but the awkward shell-out phenotype disappears. This is the
strongest single argument for maintaining a second expression of the genome.

## 7. Verdict

The plugin is a complete, internally consistent *reference expression* of a governance
architecture that is mostly framework-independent already. The highest-value next steps
are (a) extracting the contract into a canonical genome manifest (done — `genome.yaml`),
(b) deciding whether the second expression should target a graph framework that turns
the prose orchestration contract into enforced structure, and (c) keeping the class-A
assets as the shared substrate for every expression. The framework evaluation in `03`
weighs those options.
