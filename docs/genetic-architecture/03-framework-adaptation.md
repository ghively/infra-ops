# 03 — Framework Adaptation: weighing the targets

How well the genome (`02-genome.md`, `genome.yaml`) expresses in each major agentic
framework, as of June 2026. Fidelity is judged gene-by-gene: **H** (native primitive,
equal or stronger than today), **M** (expressible with moderate glue), **L** (fights
the framework or needs substantial custom code).

Targets evaluated:

1. **Claude Agent SDK** (programmatic Claude Code) and **Anthropic Managed Agents** (API)
2. **LangGraph** (LangChain ecosystem, stable 1.x)
3. **Microsoft Agent Framework** (1.0 GA Apr 2026 — successor to AutoGen + Semantic Kernel)
4. **OpenAI Agents SDK**
5. **CrewAI** (crews + Flows)
6. **Google ADK** (Agent Development Kit, + A2A)

---

## Fidelity matrix

| Gene | Claude Agent SDK | Managed Agents | LangGraph | MS Agent Fwk | OpenAI Agents SDK | CrewAI | Google ADK |
|---|---|---|---|---|---|---|---|
| G1 orchestrator | **H** | **H** (coordinator) | **H** (supervisor graph) | **H** (workflow) | M (agents-as-tools) | **H** (hierarchical crew / Flow) | **H** (agent tree) |
| G2 roster + isolation | **H** (subagents) | **H** (threads, per-agent config) | **H** (subgraphs) | **H** (agents) | **H** | **H** (roles) | **H** (sub-agents) |
| G3 delegation envelope | M (prose, as today) | M (message + thread) | **H** (typed state schema) | **H** (typed messages) | M (handoff payload types) | M (task descriptions) | M (session state) |
| G4 verdict contracts | M (prompt + parse) | M (+ outcome rubrics) | **H** (structured output per node) | **H** (structured output) | **H** (output_type / structured) | M (task output pydantic) | **H** (output schema) |
| G5 deterministic gate | M (orchestrator runs script — convention) | M (coordinator convention) | **H** (gate = code node + conditional edges) | **H** (gate = executor/edge condition) | M (code around `Runner.run`) | M (Flow router) | M (workflow agents / callbacks) |
| G6 bounded remediation | M (prose cap) | M (`max_iterations` on outcomes ≈ native!) | **H** (cycle + counter in state) | **H** (loop edge + condition) | M (`max_turns` + custom loop) | M (Flow loop) | M (LoopAgent) |
| G7 model tiering | **H** (per-subagent model) | **H** (per-agent model) | **H** (any model per node) | **H** (any provider) | M (OpenAI-first; LiteLLM for rest) | **H** (model-agnostic) | M (Gemini-first; LiteLLM for rest) |
| G8 tool-boundary enforcement | **H** (same hooks: PreToolUse/PostToolUse) | M (permission policies `always_ask`, custom tools host-side; no arbitrary pre-tool code on server tools) | **H** (middleware before/after model + tool wrappers) | **H** (middleware, filters) | **H** (guardrails w/ tripwires + tool hooks) | L–M (task guardrails/callbacks; weak at tool boundary) | **H** (before/after tool+model callbacks) |
| G9 governance ledger | **H** (hooks feed store, as today) | M (event stream + webhooks → ledger; capture moves client-side) | **H** (checkpointer + middleware → store; LangSmith optional) | **H** (OpenTelemetry-native → store/SIEM) | M (tracing API → adapter) | M (callbacks → adapter) | **H** (OTel + Vertex eval/observability) |
| G10 zones / local lane | M (local lane stays a shell-out workaround) | **L** (inference is Anthropic-hosted; no air-gapped lane — self-hosted *sandboxes* move tools, not the model) | **H** (point HSA agents at Ollama natively) | **H** (any endpoint incl. local) | M (LiteLLM → Ollama works; SDK assumes OpenAI) | **H** (Ollama first-class) | M (LiteLLM → Ollama; GCP pull conflicts with air gap) |
| G11 lazy knowledge | **H** (skills + rules native) | **H** (Skills API native) | M (build: prompt index + load-on-demand) | M (build) | M (build) | M (knowledge sources, partial) | M (artifacts/RAG, build) |
| G12 governed learning | **H** (scripts run as-is) | M (memory stores have versions/redact/audit — closest native analog; promotion gates still yours) | M (scripts as graph nodes; store ports as-is) | M (same) | M (same) | M (same; CrewAI "memory" is ungoverned — do not substitute) | M (same) |
| G13 single-level delegation | **H** (subagents can't re-delegate) | **H** (depth > 1 ignored — enforced by API) | **H** (graph topology = enforcement) | **H** (workflow topology) | **L** (peer handoffs are the native idiom; must avoid) | M (hierarchical process keeps depth 1) | M (tree allows depth; convention) |
| G14 deterministic artifacts | **H** (as-is) | M (run CLIs in sandbox/worker) | **H** (as-is, also as nodes) | **H** (as-is) | **H** (as-is) | **H** (as-is) | **H** (as-is) |

---

## Per-framework assessment

### 1a. Claude Agent SDK (programmatic Claude Code) — fidelity ceiling, same constraint

The SDK runs the same machinery (subagents, hooks with the same event names, skills,
MCP, plugins) headlessly, so the genome expresses ~1:1: this is the **lowest-effort
"port"** — closer to a re-hosting than a port. You gain programmatic control (embed the
orchestrator in a service, CI, or GitLab webhook handler) and lose nothing.
**But** it inherits the harness constraint: orchestrator inference is Claude; the HSA
local lane remains the sensitivity-router + shell-out phenotype. Choose this when the
goal is productionizing the *corporate* lane quickly.

### 1b. Anthropic Managed Agents (API) — strong coordinator semantics, wrong zone story

Surprisingly high genome alignment in places: the multiagent coordinator enforces
exactly G13 (delegation depth > 1 is ignored); per-agent versioned configs strengthen
G2; **outcomes with rubrics and `max_iterations` are a hosted G5/G6** (a grader with an
iteration cap is structurally the evaluator→remediation loop); memory stores with
immutable versions, actor provenance, and redaction are the closest any vendor ships to
G12's ledger discipline; vaults + egress substitution exceed today's secret handling.
The dealbreaker is G10: inference runs on Anthropic's orchestration layer. Self-hosted
sandboxes move *tool execution* into your infrastructure — valuable for the corporate
zone (tools touch GitLab inside your network) — but the model itself is never
air-gappable, so the HSA zone cannot live here. Verdict: a credible future host for the
**corporate lane as a service** (especially webhook/cron-driven via deployments), never
for HSA.

### 2. LangGraph — best structural fit for the genome's weakest spot

The genome's biggest gap is that the orchestration contract (G1, G5 topology, G6, G13)
is prose. LangGraph makes all four **structural**: the three reviewers are parallel
nodes fanning into a `merge_gate` node that literally shells out to
`scripts/merge-gate.js` (or imports the truth table); the conditional edge routes on
its exit code; the remediation cycle is a graph cycle with a counter in typed state;
re-delegation is impossible because the edges don't exist. `interrupt()` gives durable
human gates (promotion approvals that can wait days — matching `/instinct-promote`
semantics better than a CLI prompt). Middleware (`before_model`/`after_model`) plus
tool wrappers re-bind G8; checkpointers persist state alongside the existing State
Store. Model-agnostic nodes dissolve the local-lane constraint (G10 → H).
Costs: skills/rules progressive disclosure must be hand-built (M); you own the runtime;
LangChain-ecosystem churn is a real maintenance tax, though 1.x has stabilized.
**Verdict: the strongest port target if the motivation is enforcement-by-construction
plus a native HSA local lane.**

### 3. Microsoft Agent Framework 1.0 — the enterprise/compliance candidate

AutoGen + Semantic Kernel converged into one GA SDK (1.0, April 2026; .NET + Python)
with graph-based workflows, middleware, typed messages, and **OpenTelemetry-native
observability** — which is exactly what a PCI Req 10 story wants to feed a SIEM
(G9 → H with less glue than anywhere else). Gene fidelity is essentially LangGraph-
equivalent (workflows for G1/G5/G6/G13, middleware for G8, any-provider models for
G7/G10). Differentiators: long-term-support posture and first-class .NET — relevant if
the estate's ops tooling is Windows-heavy (it is: mixed Windows/Linux with PowerShell
templates). Costs: 1.0 is young; smaller community than LangChain; Azure-flavored docs
though not Azure-required. **Verdict: co-favorite with LangGraph; pick it if .NET/LTS/
OTel matter more than ecosystem size.**

### 4. OpenAI Agents SDK — good guardrails, wrong topology idiom

Guardrails with tripwires are a genuinely good G8 fit (fail-fast input/output checks
≈ fail-closed DLP), structured outputs cover G4, sessions cover working memory, and the
SDK is pleasantly small. But the native multi-agent idiom is **peer handoffs** — the
conversation transfers between agents — which is the opposite of G13's hub-and-spoke;
you must studiously avoid the framework's flagship feature and use agents-as-tools
instead. Model tiering beyond OpenAI models and an air-gapped lane go through LiteLLM
shims (M). **Verdict: viable only if the organization is OpenAI-committed; for this
genome it swims upstream.**

### 5. CrewAI — fastest prototype, weakest enforcement

The roster maps beautifully (roles/goals/backstories ≈ agent files; hierarchical
process ≈ orchestrator; Flows add deterministic routing for G5/G6). Model-agnostic, so
G10 → H. The problem is the inner ring: tool-boundary enforcement is task-level
callbacks and output guardrails, not a fail-closed boundary every tool call must cross
(G8 L–M) — for a CDE that is the load-bearing gene. Its built-in "memory" is ungoverned
and must not be confused with G12. **Verdict: good for a 2-week proof that the genome
expresses elsewhere; not the production CDE target.**

### 6. Google ADK — strong primitives, gravitational mismatch

Hierarchical agent trees, before/after model/tool callbacks (a clean G8 re-bind),
session state, built-in eval, and unique **A2A** support for cross-framework agent
interop. But the framework's center of mass is Gemini + Vertex AI deployment, while
this estate is self-hosted GitLab + air-gapped HSA; every step fights that pull
(local models via LiteLLM, self-managed runtime). A2A becomes interesting later if
corporate-lane agents (any framework) must talk to in-zone agents across the boundary
through a controlled relay. **Verdict: not now; revisit if GCP enters the estate or
A2A interop becomes a requirement.**

---

## Weighing it: three honest options

**Option 1 — Stay native, deepen the current expression (lowest cost).**
Keep Claude Code / Claude Agent SDK as the only phenotype; spend effort on the P0/P1
gaps instead of a port. Accepts: prose orchestration contract, shell-out local lane.
Right if HSA remains CPSA-blocked anyway (it is) and team bandwidth is the constraint.

**Option 2 — Genome + second expression on a graph framework (recommended when HSA
work unblocks).** Keep this repo as substrate (all class-A assets shared); express the
orchestration layer in **LangGraph** (or **Microsoft Agent Framework** if .NET/LTS/OTel
weigh more). Wins: G5/G6/G13 become enforced structure; G10's local lane becomes
native, which is the *prerequisite* for a real HSA deployment — the current harness
cannot ever provide it. Cost estimate: the matrix says ~10 of 14 genes are H with the
rest M; the M's (lazy knowledge shim, ledger capture points) are days-to-weeks, not
months, because the logic already exists as scripts.

**Option 3 — Corporate lane as a Managed Agents service (watch, don't build yet).**
Deployments (cron), webhooks, vaults, outcome-graded loops, and versioned agents map
startlingly well to the corporate workflow — but it is beta, capture moves client-side,
and it can never host HSA. Re-evaluate at GA.

### Recommendation

Adopt the **genome-first posture now** (costless: this guide + `genome.yaml` + keeping
class-A assets framework-clean), continue on Claude Code for the corporate lane, and
make **LangGraph the designated HSA-zone expression** — prototype it with the existing
`perso-*` prompts, the merge-gate truth table as a node, and Ollama endpoints, since
HSA *development* is explicitly not CPSA-gated (only deployment is). Microsoft Agent
Framework is the named alternate if the Windows side of the estate pulls toward .NET.
Decision checkpoint: revisit after the P0 blockers land and CPSA review is scheduled.

---

## Sources (framework landscape, June 2026)

- [LangGraph docs/wiki — subgraphs, interrupt(), middleware, 1.x status](https://aiwiki.ai/wiki/langgraph); [LangGraph multi-agent patterns 2026](https://dev.to/ottoaria/langgraph-in-2026-build-multi-agent-ai-systems-that-actually-work-3h5)
- [Microsoft Agent Framework 1.0 announcement](https://devblogs.microsoft.com/agent-framework/microsoft-agent-framework-version-1-0/); [migration from SK/AutoGen](https://devblogs.microsoft.com/agent-framework/migrate-your-semantic-kernel-and-autogen-projects-to-microsoft-agent-framework-release-candidate/); [overview](https://learn.microsoft.com/en-us/agent-framework/overview/)
- [OpenAI Agents SDK — agents, handoffs, guardrails, sessions](https://openai.github.io/openai-agents-python/)
- [Agent framework comparisons 2026 — CrewAI Flows, Google ADK, A2A/MCP](https://gurusup.com/blog/best-multi-agent-frameworks-2026); [ADK vs LangGraph vs CrewAI](https://1337skills.com/blog/2026-04-17-agent-framework-wars-google-adk-langchain-crewai-comparison/)
- Anthropic Managed Agents: platform.claude.com/docs/en/managed-agents/* (multiagent
  coordinator depth-1 enforcement, outcomes/rubrics, memory-store versioning, vaults,
  self-hosted sandboxes)
