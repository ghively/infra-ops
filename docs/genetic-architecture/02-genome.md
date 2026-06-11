# 02 — The Genome: 14 Architectural Genes

Each gene is an invariant the system must satisfy regardless of framework. For every
gene: the **invariant** (genotype), the **current Claude Code expression** (phenotype,
with paths), the **portability class** (A ports verbatim / B re-express / C
harness-coupled — see README), and a **conformance test** any expression must pass.
The machine-readable form is [`genome.yaml`](genome.yaml).

---

## G1 — Lean Orchestrator (classify → delegate → assemble)

**Invariant.** One coordinator owns routing and result assembly. Specialist work never
runs inline in the coordinator's context; trivial lookups and routing stay local.
**Expression.** `CLAUDE.md` orchestration contract + delegation map; Task-tool dispatch.
**Class.** B — every framework has a supervisor/coordinator pattern.
**Conformance.** Given an authoring request, the coordinator's transcript contains no
authored file bodies — only the delegation call and the returned contract.

## G2 — Isolated Specialist Roster

**Invariant.** Named specialists with (role, allowed tools, model tier, zone, output
contract); each invocation starts with fresh context; tool allowlists are least-privilege
(reviewers cannot Write; scanners cannot Bash).
**Expression.** `agents/*.md` (16: 10 corporate + 6 `perso-*`), frontmatter `tools:`/`model:`.
**Class.** B (prompt bodies are A — they port verbatim).
**Conformance.** Per-agent tool surface in the target equals the frontmatter allowlist;
a reviewer attempting a write fails structurally, not by convention.

## G3 — Delegation Envelope

**Invariant.** Every delegation carries: Objective (one sentence), Inputs (pointers, not
pasted bodies), Output contract (named sections/verdict token), Boundaries (zone,
propose-only, no-CHD, hand-off target).
**Expression.** Prose protocol in `CLAUDE.md` §How to delegate well.
**Class.** B — becomes a typed message/state schema in most targets (an upgrade).
**Conformance.** Delegations failing schema validation are rejected before dispatch.

## G4 — Machine-Readable Output Contracts

**Invariant.** Specialist output opens with a parseable verdict token
(`VERDICT: PASS|WARN|BLOCK`, `ROOT-CAUSE-FOUND|INCONCLUSIVE`, `ROUTED: YES|NO`) followed
by named sections (findings table with file:line, residual risk).
**Expression.** `## Output` blocks in every agent file; `parseVerdict()` in
`scripts/lib/merge-gate.js`.
**Class.** A/B — token grammar is data; structured-output features in modern frameworks
can enforce it harder than prose does today.
**Conformance.** `parseVerdict()` (or its port) extracts a non-null verdict from every
reviewer run.

## G5 — Deterministic Review Gate (no discretion)

**Invariant.** Three reviewers — correctness, compliance, secrets — run in parallel on
every authored change. Decision is computed, never judged: any BLOCK blocks; missing
verdict = incomplete = BLOCK; WARN is advisory. Exit codes 0 (cleared) / 1 (revise) /
3 (escalate).
**Expression.** `scripts/merge-gate.js` + `scripts/lib/merge-gate.js`; topology in
`CLAUDE.md` (convention, not enforced).
**Class.** A for the decision script; B for the parallel topology. Graph frameworks make
the topology structural — the biggest available upgrade over the current expression.
**Conformance.** Feed verdicts (PASS,WARN,PASS)→0; (PASS,BLOCK,PASS)→1; (PASS,—,PASS)→1;
cycle 3 with BLOCK→3. Identical truth table in every expression.

## G6 — Bounded Remediation Loop

**Invariant.** On BLOCK: consolidated findings return to the author for ONE revision
pass, re-review; cap at 2 cycles; then stop and escalate to a human with open findings.
Never merge around a BLOCK.
**Expression.** `CLAUDE.md` evaluator→remediation loop + `--cycle` arg on merge-gate.
**Class.** B — a loop-with-counter in any framework (LangGraph cycle, MAF workflow edge,
plain `for` loop around an SDK call).
**Conformance.** A change that still BLOCKs after cycle 2 produces a human-escalation
artifact and no merge.

## G7 — Model Tiering by Task Economics

**Invariant.** Frontier model for planning/authoring; mid-tier for review/diagnosis;
small/fast for scanning and scribing; local-only models inside the HSA zone.
**Expression.** `model: opus|sonnet|haiku|inherit` frontmatter per agent.
**Class.** B — trivially expressible everywhere; in model-agnostic frameworks the HSA
tier becomes a real local endpoint instead of a label (see G13).
**Conformance.** Cost/latency telemetry shows tier separation; no frontier-model calls
originate from HSA-zone work.

## G8 — Tool-Boundary Enforcement (guardrails as code)

**Invariant.** Guardrails execute at the tool boundary, not in prompts: (a) DLP — block
Luhn-valid PAN/secrets in any tool input, fail-closed; (b) sensitivity routing — deny
CHD-adjacent operations toward the local lane, fail-closed; (c) investigation gate —
require blast-radius + rollback facts before mutating edits; (d) post-write quality
gates (yamllint, ansible-syntax). Bypassing the orchestrator's judgment must not bypass
these.
**Expression.** `hooks/hooks.json` PreToolUse/PostToolUse bindings →
`scripts/hooks/{pan-egress-filter,sensitivity-router,gateguard-fact-force,yamllint-hook,ansible-syntax-hook}.js`.
**Class.** C bindings / A logic. The detection logic should be treated as a portable
library; each framework re-binds it (middleware, callbacks, guardrails, permission
hooks).
**Conformance.** Red-team test: a tool call containing a test PAN is blocked in every
expression with the harness's strongest available denial (and the event is ledgered).

## G9 — Append-Only Governance Ledger

**Invariant.** Every tool execution, decision, approval, promotion, and rollback is
appended to a structured store (9 collections incl. `governanceEvents`, `observations`,
`skillRuns`, `decisions`); capture is non-blocking; events forwardable to SIEM
(PCI Req 10).
**Expression.** PostToolUse async hooks → `scripts/lib/state-store.js`
(`~/.infra-ops/state-store/`), `schemas/state-store.schema.json`, `siem-forwarder.js`.
**Class.** A store + schema / C capture points. Targets with OpenTelemetry-native
tracing (MAF, ADK, LangSmith) can *feed* the ledger rather than replace it.
**Conformance.** Replay a session; every tool invocation has a matching
`governanceEvents` entry; schema-validates.

## G10 — Zone Separation and the Local Lane

**Invariant.** Two zones: `corporate` (PCI DSS, cloud inference allowed) and `hsa`
(PCI CP + PIN, air-gapped, local inference only). Zone is a data property on agents,
skills, instincts. Crown jewels (PAN/CHD cleartext, keys, PINs, HSM config) are
untouchable in *both* zones. HSA governance actions need dual control.
**Expression.** Zone tags; `perso-*` agent suite; `ollama-router.js` +
`sensitivity-router` (shell-out workaround); `hsa-boundary-guard.js`,
`dual-control-promotion-gate.js`. CPSA gate blocks HSA *deployment* (not development).
**Class.** B — and the one gene whose expression *improves* off-harness: model-agnostic
frameworks run HSA agents on local models natively.
**Conformance.** Static: no HSA-zone component references a cloud endpoint or Context7.
Dynamic: network egress from the HSA expression is empty.

## G11 — Lazy Knowledge (skills + path-scoped rules)

**Invariant.** Expertise is not preloaded. Skills (24) load on demand by task; rules
(13) inject when a matching file type is in scope; the authoritative standard is the
rule file, and reviewer checklists defer to it ("if it diverges from a rule, the rule
wins").
**Expression.** `skills/*/SKILL.md` frontmatter triggers; path-scoped `rules/**`
injection by the harness.
**Class.** A content / C loading mechanism. Ports need a shim: system-prompt index +
read-on-demand, retrieval, or the target's skill feature (Claude Agent SDK / Managed
Agents have one natively).
**Conformance.** Token telemetry: a request touching no Ansible files loads no Ansible
rules/skills.

## G12 — Governed Learning Loop (no silent self-modification)

**Invariant.** Observation capture is automatic; *behavior change is not*. Candidates
get confidence scores and evidence; promotion requires a human approver, confidence
≥ 0.7, and citations for compliance items; instincts are zone-segmented YAML with full
provenance; rollback is first-class; HSA/compliance promotions need two approvers.
**Expression.** `observe-runner.js` → `knowledge-curator` → `/instinct-promote` →
`learning-promotion-gate.js` / `dual-control-promotion-gate.js` →
`knowledge/instincts/<zone>/*.yaml` via `instinct-ledger.js`; `/instinct-rollback`.
**Class.** A — the entire loop is CLIs + YAML + store collections. Rare among agent
frameworks (none ship an equivalent); this gene is a differentiator worth preserving
byte-for-byte.
**Conformance.** Attempted promotion without approver/confidence/citation exits
non-zero and leaves the ledger unchanged.

## G13 — Single-Level Delegation (no re-delegation, no loops)

**Invariant.** Specialists return to the orchestrator; they never call each other.
Chains (plan → author → review → scribe) are orchestrator-owned. Prevents runaway
fan-out and token blow-up.
**Expression.** Prose rule in `CLAUDE.md` (subagents lack the Task tool, which gives it
structural teeth in Claude Code).
**Class.** B. Notably, Anthropic's Managed Agents multiagent API enforces exactly this
(delegation depth > 1 is ignored), and supervisor topologies in LangGraph/MAF/ADK can
encode it; OpenAI-style peer *handoffs* actively fight it.
**Conformance.** Call-graph audit of a full chain shows depth ≤ 1 from the coordinator.

## G14 — Deterministic Artifact Discipline

**Invariant.** Artifact shape is never the model's choice: scaffolding from canonical
templates, structure validation against a spec, deployment-policy validation, preflight
checks — all scripts with exit codes, all runnable in CI without any LLM.
**Expression.** `scaffold.js`, `validate-structure.js` + `structure-spec.js`,
`validate-deployment.js`, `conformance.js`, `preflight.js`, `templates/**`,
`.gitlab-ci/components/structure-conformance`.
**Class.** A — zero harness dependency today.
**Conformance.** `npm test` / CI conformance job green with no model in the loop.

---

## Reading the genome

Three meta-observations the per-gene table hides:

1. **The genes compose into two enforcement rings.** Inner ring: G8/G9/G10 (tool
   boundary, ledger, zones) — must hold even if every prompt is ignored. Outer ring:
   G1–G6, G13 (orchestration shape) — currently conventions, candidates for structural
   enforcement in graph targets. A port that only re-implements the outer ring has
   missed the point.
2. **Verdict tokens are the system's ABI.** G4 is what lets G5 be deterministic and G6
   be bounded. Any expression that replaces tokens with free-form review prose breaks
   three genes at once.
3. **The learning loop is the rarest gene.** Frameworks ship memory; none ship
   *governed* memory with promotion gates, provenance, and dual control. Treat G12's
   scripts and YAML as shared substrate across all expressions rather than re-deriving
   per framework.
