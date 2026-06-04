# ECC Model-Selection & Cost Patterns — Reference for Infra-Agent Design

> Mined from `/home/user/ECC/agents/`, `/home/user/ECC/commands/`, and
> `/home/user/ECC/skills/` on 2026-06-03.
> All file:line citations verified against source.

---

## 1. Per-Agent Model Assignment Strategy

### 1.1 Opus — high-stakes, strategic, or safety-critical work

Across the 63-agent catalog, opus is assigned to exactly **8 agents** (count from
`docs/deep-dive/01-agents.md:908-918`). Each falls into one of four rationale buckets:

| Agent | Rationale bucket | Source |
|-------|-----------------|--------|
| `architect` | Strategic reasoning, multi-file trade-off analysis | `agents/architect.md:5` |
| `planner` | Comprehensive feature planning from ambiguous requirements | `agents/planner.md:5` |
| `gan-planner` | Creative product-spec generation ("be deliberately ambitious") | `agents/gan-planner.md:5` |
| `gan-generator` | Novel multi-file implementation in an adversarial loop | `agents/gan-generator.md:5` |
| `gan-evaluator` | Ruthless quality scoring requiring nuanced judgment | `agents/gan-evaluator.md:5` |
| `healthcare-reviewer` | Domain risk: patient-safety errors are worse than false positives | `agents/healthcare-reviewer.md:5` |
| `chief-of-staff` | Complex multi-channel orchestration with persistent state | `agents/chief-of-staff.md:5` |

Selected frontmatter quotes:

```yaml
# agents/architect.md:1-5
name: architect
description: Software architecture specialist for system design, scalability,
  and technical decision-making. Use PROACTIVELY when planning new features,
  refactoring large systems, or making architectural decisions.
model: opus
```

```yaml
# agents/planner.md:1-5
name: planner
description: Expert planning specialist for complex features and refactoring.
  Use PROACTIVELY when users request feature implementation, architectural
  changes, or complex refactoring.
model: opus
```

```yaml
# agents/gan-planner.md:1-7
name: gan-planner
description: "GAN Harness — Planner agent. Expands a one-line prompt into a
  full product specification with features, sprints, evaluation criteria,
  and design direction."
model: opus
color: purple
```

```yaml
# agents/healthcare-reviewer.md:1-5
name: healthcare-reviewer
description: Reviews healthcare application code for clinical safety, CDSS
  accuracy, PHI compliance, and medical data integrity.
model: opus
```

The deep-dive cross-cutting analysis captures the rule explicitly
(`docs/deep-dive/01-agents.md:914-918`):

> **Pattern**: Opus is reserved for agents where:
> 1. Creative ambition matters (GAN trio — generating novel product experiences)
> 2. Strategic reasoning is central (architect, planner)
> 3. Domain risk is high (healthcare-reviewer — patient safety)
> 4. Communication orchestration is complex (chief-of-staff — multi-channel triage)

### 1.2 Sonnet — structured review, resolution, and analysis (the default)

53 of 63 agents use `model: sonnet`. Representative sample:

```yaml
# agents/code-reviewer.md:5
model: sonnet
```
```yaml
# agents/harness-optimizer.md:5
model: sonnet
```
```yaml
# agents/go-reviewer.md:5
model: sonnet
```
```yaml
# agents/java-build-resolver.md:5
model: sonnet
```
```yaml
# agents/network-architect.md:5
model: sonnet
```
```yaml
# agents/homelab-architect.md:5
model: sonnet
```
```yaml
# agents/security-reviewer.md:5
model: sonnet
```

Deep-dive family summaries confirm the pattern. Build Resolvers
(`docs/deep-dive/01-agents.md:798`):

> **Shared template**: 1. `model: sonnet`, full write tools
> `[Read, Write, Edit, Bash, Grep, Glob]`

Language Reviewers (`docs/deep-dive/01-agents.md:780-784`):

> Severity-tiered checklist (CRITICAL → HIGH → MEDIUM → LOW) … Approval criteria:
> Approve (no CRITICAL/HIGH), Warning (MEDIUM), Block (CRITICAL/HIGH)

Specialty Analyzers (`docs/deep-dive/01-agents.md:884`):

> All use `model: sonnet`. Most are read-only …

Network Trio (`docs/deep-dive/01-agents.md:836-842`):

> All use `model: sonnet`, restricted to read-only tools (Read, Grep) …
> Safety rules explicitly forbid recommending ACL removal or firewall disabling
> as diagnostic shortcuts.

### 1.3 Haiku — cheap mechanical / high-frequency tasks

Only **one agent** in the entire catalog uses haiku:

```yaml
# agents/doc-updater.md:5
model: haiku
```

Deep-dive rationale (`docs/deep-dive/01-agents.md:900`):

> doc-updater is the only agent using `model: haiku` — the cheapest model for
> mechanical documentation tasks.

---

## 2. The `/model-route` Command

`commands/model-route.md` encodes the three-tier heuristic as a slash command:

```markdown
# commands/model-route.md:12-17
## Routing Heuristic

- `haiku`: deterministic, low-risk mechanical changes
- `sonnet`: default for implementation and refactors
- `opus`: architecture, deep review, ambiguous requirements
```

Usage signature (`commands/model-route.md:9-10`):

```
/model-route [task-description] [--budget low|med|high]
```

Required output includes: recommended model, confidence level, why this model
fits, and a fallback model.

---

## 3. Multi-Backend & Multi-Execute Routing

`commands/multi-backend.md` (labeled `/backend`) demonstrates **backend-authority
routing**: Codex is the backend authority ("trustworthy"), Gemini opinions are
"reference only," and Claude is the orchestrator that holds write access
(`commands/multi-backend.md:18-29`):

> **Collaborative Models**:
> - **Codex** – Backend logic, algorithms (**Backend authority, trustworthy**)
> - **Gemini** – Frontend perspective (**Backend opinions for reference only**)
> - **Claude (self)** – Orchestration, planning, execution, delivery

`commands/multi-execute.md` (labeled `/ccg:execute`) routes by task type:

```markdown
# commands/multi-execute.md:129-135
| Task Type  | Detection                               | Route          |
|------------|-----------------------------------------|----------------|
| Frontend   | Pages, components, UI, styles, layout   | Gemini         |
| Backend    | API, interfaces, database, logic        | Codex          |
| Fullstack  | Contains both frontend and backend      | Codex ∥ Gemini |
```

The key sovereignty rule (`commands/multi-execute.md:14-17`):

> **Code Sovereignty**: External models have **zero filesystem write access**,
> all modifications by Claude.

---

## 4. Cost / Budget Skills

### 4.1 `cost-aware-llm-pipeline` — model routing + immutable tracking

`skills/cost-aware-llm-pipeline/SKILL.md` provides four composable Python patterns.

**Model routing by complexity threshold** (`skills/cost-aware-llm-pipeline/SKILL.md:32-41`):

```python
_SONNET_TEXT_THRESHOLD = 10_000  # chars
_SONNET_ITEM_THRESHOLD = 30     # items

def select_model(text_length, item_count, force_model=None):
    if force_model is not None:
        return force_model
    if text_length >= _SONNET_TEXT_THRESHOLD or item_count >= _SONNET_ITEM_THRESHOLD:
        return MODEL_SONNET  # Complex task
    return MODEL_HAIKU  # Simple task (3-4x cheaper)
```

**Immutable cost tracker** (`skills/cost-aware-llm-pipeline/SKILL.md:49-76`):

```python
@dataclass(frozen=True, slots=True)
class CostTracker:
    budget_limit: float = 1.00
    records: tuple[CostRecord, ...] = ()

    def add(self, record: CostRecord) -> "CostTracker":
        """Return new tracker with added record (never mutates self)."""
        return CostTracker(budget_limit=self.budget_limit,
                           records=(*self.records, record))
```

**Pricing reference** (`skills/cost-aware-llm-pipeline/SKILL.md:154-158`):

| Model | Input ($/1M tokens) | Output ($/1M tokens) | Relative Cost |
|-------|---------------------|----------------------|---------------|
| Haiku 4.5 | $0.80 | $4.00 | 1× |
| Sonnet 4.6 | $3.00 | $15.00 | ~4× |
| Opus 4.5 | $15.00 | $75.00 | ~19× |

**Best-practice principles** (`skills/cost-aware-llm-pipeline/SKILL.md:164-168`):

> - **Start with the cheapest model** and only route to expensive models when
>   complexity thresholds are met
> - **Set explicit budget limits** before processing batches — fail early rather
>   than overspend
> - **Use prompt caching** for system prompts over 1024 tokens — saves both cost
>   and latency

**Anti-patterns** (`skills/cost-aware-llm-pipeline/SKILL.md:172`):

> - Using the most expensive model for all requests regardless of complexity

### 4.2 `cost-tracking` — SQLite observability layer

`skills/cost-tracking/SKILL.md` separates write (hook) from read (skill):

> (`skills/cost-tracking/SKILL.md:165-169`) — Separating the "who writes the
> data" (an out-of-band hook) from "who reads the data" (this skill) creates a
> clean observable layer without requiring the skill to intercept tool calls.

Key guardrail (`skills/cost-tracking/SKILL.md:134`):

> Prefer `cost_usd` over hand-calculating pricing. Model prices and cache
> pricing change over time, and the tracker should be the source of truth.

### 4.3 `token-budget-advisor` — depth-gating before response

`skills/token-budget-advisor/SKILL.md:49-57`: Intercepts before answering to
offer four depth levels (25/50/75/100%). Complexity-based multiplier ranges
used for token estimation — no real tokenizer required.

### 4.4 `ecc-tools-cost-audit` — operational burn audit

`skills/ecc-tools-cost-audit/SKILL.md:88-95` prioritizes audit and fix order
by burn impact, not code neatness:

> #### Premium-model leakage
> - inspect model selection, tier branching, and provider routing
> - verify whether free or capped users can still hit premium analyzers when
>   premium keys are present

Fix priority order (`skills/ecc-tools-cost-audit/SKILL.md:99-105`):

> 1. stop automatic PR multiplication
> 2. stop quota bypass
> 3. stop premium leakage
> 4. stop duplicate-job fanout and pointless retries

---

## 5. `harness-optimizer` Agent — Reliability, Cost, Throughput

Full frontmatter (`agents/harness-optimizer.md:1-7`):

```yaml
name: harness-optimizer
description: Analyze and improve the local agent harness configuration for
  reliability, cost, and throughput.
tools: ["Read", "Grep", "Glob", "Bash", "Edit"]
model: sonnet
color: teal
```

Mission statement (`agents/harness-optimizer.md:22-24`):

> Raise agent completion quality by improving harness configuration, not by
> rewriting product code.

Workflow (`agents/harness-optimizer.md:26-32`):

> 1. Run `/harness-audit` and collect baseline score.
> 2. Identify top 3 leverage areas (hooks, evals, routing, context, safety).
> 3. Propose minimal, reversible configuration changes.
> 4. Apply changes and run validation.
> 5. Report before/after deltas.

Constraints (`agents/harness-optimizer.md:34-38`):

> - Prefer small changes with measurable effect.
> - Preserve cross-platform behavior.
> - Avoid introducing fragile shell quoting.
> - Keep compatibility across Claude Code, Cursor, OpenCode, and Codex.

The choice of **sonnet for harness-optimizer** — despite its "reliability, cost,
throughput" remit — reflects that this is structured analysis work, not
open-ended creative or safety-critical reasoning.

---

## 6. `agentic-engineering` Skill — Canonical Model Routing Ladder

`skills/agentic-engineering/SKILL.md:34-37` provides the most explicit
three-tier routing rule in the codebase:

```
## Model Routing

- Haiku: classification, boilerplate transforms, narrow edits
- Sonnet: implementation and refactors
- Opus: architecture, root-cause analysis, multi-file invariants
```

Cost discipline rule (`skills/agentic-engineering/SKILL.md:63`):

> Escalate model tier only when lower tier fails with a clear reasoning gap.

---

## 7. Recommended Model Tiers for Proposed Infra Subagents

The five proposed subagents, their recommended tier, and the ECC precedent
that justifies each recommendation:

---

### 7.1 Primary Author / Orchestrator — **opus**

**Recommendation:** `model: opus`

**Justification:** The primary author agent owns open-ended requirements decomposition,
multi-resource trade-off analysis, and initial Terraform/Ansible authoring from
ambiguous briefs. This maps directly onto ECC's `architect` agent
(`agents/architect.md:5 model: opus`) — "system design, scalability, and technical
decision-making" — and `planner` (`agents/planner.md:5 model: opus`), which handles
complex feature planning from ambiguous inputs. The `agentic-engineering` skill
(`skills/agentic-engineering/SKILL.md:36`) assigns opus to "architecture, root-cause
analysis, multi-file invariants," exactly what an IaC orchestrator must perform when
translating a vague "set up a 3-tier VPC with PCI-scoped subnets" brief into a
modular Terraform plan. Per the cost-discipline rule (`skills/agentic-engineering/
SKILL.md:63`), opus is justified here because no lower tier can resolve structural
ambiguity without a clear reasoning gap.

---

### 7.2 Code / Playbook Reviewer — **sonnet**

**Recommendation:** `model: sonnet`

**Justification:** A reviewer that applies a fixed severity-tiered checklist
(CRITICAL/HIGH/MEDIUM/LOW) to diffs of Terraform, Ansible, or CI/CD playbooks is
structurally identical to ECC's `code-reviewer` (`agents/code-reviewer.md:5 model:
sonnet`), which reviews code for quality, security, and correctness using the same
four-gate checklist. Sonnet is also the model for `security-reviewer`,
`network-config-reviewer`, and all 12 build resolvers — all of which apply a known
rule set against known inputs. The routing heuristic in `/model-route`
(`commands/model-route.md:14-15`) confirms: "sonnet: default for implementation and
refactors." Cost-wise, sonnet is ~4× cheaper than opus
(`skills/cost-aware-llm-pipeline/SKILL.md:155-158`); for a task that runs on every
PR (high frequency), this difference compounds quickly and the cost-aware pipeline
skill explicitly flags "using the most expensive model for all requests regardless of
complexity" as an anti-pattern.

---

### 7.3 Read-Only Auditor (compliance / drift detection) — **sonnet**

**Recommendation:** `model: sonnet`

**Justification:** A read-only auditor that compares live cloud state against declared
IaC and reports drift or compliance findings parallels ECC's `harness-optimizer`
(`agents/harness-optimizer.md:5 model: sonnet`) — which "analyzes and improves the
local agent harness configuration for reliability, cost, and throughput" entirely
through read-only passes before proposing reversible changes. It also mirrors the
Network Trio's `network-config-reviewer` (`docs/deep-dive/01-agents.md:836-842 model:
sonnet`), which performs "read-only review only — do not apply configuration" with
explicit safety rules against recommending ACL removal. Opus would be overkill for a
rule-bound comparison task; haiku would risk missing nuanced compliance implications.
Sonnet provides the structured-reasoning depth needed without the 19× cost premium
of opus (`skills/cost-aware-llm-pipeline/SKILL.md:157`).

---

### 7.4 Planning Agent (sprint / sprint-zero IaC roadmap) — **opus**

**Recommendation:** `model: opus`

**Justification:** A planning agent that translates business requirements into a
sprint-structured IaC roadmap — assigning dependency edges, rollback strategies, and
stage gates — is the infra equivalent of ECC's `planner` agent
(`agents/planner.md:5 model: opus`): "Expert planning specialist for complex features
and refactoring." The GAN planner (`agents/gan-planner.md:5-6 model: opus`) adds
another data point: opus is chosen precisely because planning requires "deliberate
ambition," creative decomposition, and the ability to hold a full product brief in
context while structuring 12-16 work items with dependency ordering. The
`agentic-engineering` skill's 15-minute unit rule
(`skills/agentic-engineering/SKILL.md:27-31`) requires each unit to be independently
verifiable with a single dominant risk — a decomposition task that itself requires
opus-level multi-file reasoning. A planning agent runs infrequently (once per
sprint/feature), so the cost premium is justified and bounded.

---

### 7.5 Local Ollama Agent for PCI Data — **local model (Ollama)**

**Recommendation:** local Ollama model (no cloud tier; data never leaves the host)

**Justification:** PCI DSS scope requires that cardholder data (CHD) and sensitive
authentication data (SAD) not be transmitted to external APIs. This is a hard
compliance boundary, not a cost preference. ECC's `healthcare-reviewer`
(`agents/healthcare-reviewer.md:5 model: opus`) establishes the precedent for
domain risk driving model selection: patient-safety data requires the strongest
available reasoning, but the healthcare-reviewer's tools are intentionally
read-only (`tools: ["Read", "Grep", "Glob"]`) to minimize exposure surface. The
infra analogue inverts this: for PCI-scoped work, the network boundary constraint
(data must stay on-prem) supersedes the reasoning-quality preference. The agent
should use the most capable local model available via Ollama (e.g., a 70B-parameter
instruct model). The `ecc-tools-cost-audit` skill's "premium-model leakage" audit
category (`skills/ecc-tools-cost-audit/SKILL.md:88-95`) — "verify whether free or
capped users can still hit premium analyzers when premium keys are present" — is
directly analogous: the audit concern here is whether PCI data can accidentally
reach a cloud model when API keys are present in the environment. Configuration
must guarantee the Ollama endpoint is the only route for this agent's sessions.

---

## 8. Summary Table

| Subagent | Tier | ECC Precedent | Cost Principle |
|----------|------|---------------|----------------|
| Primary Author / Orchestrator | opus | `architect`, `planner` (both `model: opus`) | Escalate only when lower tier fails with clear reasoning gap |
| Code / Playbook Reviewer | sonnet | `code-reviewer`, `security-reviewer` (both `model: sonnet`) | Sonnet is default for structured rule application; ~4× cheaper than opus |
| Read-Only Auditor | sonnet | `harness-optimizer`, `network-config-reviewer` (both `model: sonnet`) | 53/63 ECC agents use sonnet; haiku risks nuance gaps, opus is 19× cost premium |
| Planning Agent | opus | `planner`, `gan-planner` (both `model: opus`) | Planning is infrequent and requires multi-file invariant reasoning |
| Local Ollama (PCI) | local | `healthcare-reviewer` (domain risk → strongest available) | PCI network boundary supersedes cost; audit for premium-model leakage (`ecc-tools-cost-audit`) |
