# Genetic Architecture Guide — infra-ops as a portable agentic genome

_Generated 2026-06-11 from a deep analysis of plugin v0.14.0._

This guide reframes the infra-ops plugin from "a Claude Code plugin" into a
**genetic architecture**: a framework-agnostic *genome* of architectural genes
(orchestration contract, deterministic gates, hook enforcement, governed learning,
zone separation, …) plus per-framework *expressions* of those genes. The Claude Code
plugin in this repo is then just the **reference expression** of the genome — the
first phenotype, not the architecture itself.

## Why "genetic"?

The system's value is not in `hooks.json` or agent frontmatter — those are harness
syntax. The value is in a set of invariants that survived design review and PCI
scoping: *propose-never-dispose*, *any-BLOCK-blocks*, *fail-closed DLP at the tool
boundary*, *human-gated learning*, *air-gapped zone separation*. Those invariants can
be **expressed** in LangGraph, Microsoft Agent Framework, OpenAI Agents SDK, CrewAI,
Google ADK, or the Claude Agent SDK / Managed Agents — with different fidelity and
different amounts of glue code. Genotype vs phenotype.

## Documents

| Doc | What it answers |
|---|---|
| [`01-deep-analysis.md`](01-deep-analysis.md) | What the plugin actually does, what is load-bearing, what is Claude-Code-coupled vs already portable, and where the genome is strong/weak. |
| [`02-genome.md`](02-genome.md) | The 14 architectural genes, each with: invariant, current expression (file paths), portability class, and conformance test. |
| [`genome.yaml`](genome.yaml) | Machine-readable genome manifest — the canonical gene list a port can be validated against. |
| [`03-framework-adaptation.md`](03-framework-adaptation.md) | Per-framework evaluation (Claude Agent SDK / Managed Agents, LangGraph, Microsoft Agent Framework, OpenAI Agents SDK, CrewAI, Google ADK): gene-by-gene fidelity matrix, trade-offs, recommendation. |
| [`04-porting-playbook.md`](04-porting-playbook.md) | Concrete porting order, what ports verbatim, what must be re-expressed, and the conformance checklist for any target. |

## How to use this guide

- **Extending the current plugin** → read `01` then keep working from
  `docs/superpowers/specs/2026-06-06-gap-analysis.md` as before. Nothing here changes
  the Claude Code expression.
- **Evaluating a port** → read `02` + `03`, pick a target, then run `04`.
- **Building a second expression in parallel** → treat `genome.yaml` as the contract;
  every expression must pass the conformance checklist in `04` regardless of framework.

## Portability classes used throughout

| Class | Meaning | Examples in this repo |
|---|---|---|
| **A — ports verbatim** | Plain data or standalone scripts with no harness dependency | `rules/`, `knowledge/instincts/`, `scripts/merge-gate.js`, `scripts/lib/state-store.js`, `templates/`, `schemas/` |
| **B — re-express** | A pattern that every serious framework can express with its own primitives | agent roster, delegation envelope, review gate topology, model tiering, learning loop wiring |
| **C — harness-coupled** | Bound to Claude Code mechanics; needs redesign per target | `hooks/hooks.json` event bindings, skill/agent frontmatter, `${CLAUDE_PLUGIN_ROOT}`, plugin manifest, path-scoped rule injection |

The headline finding: **roughly 70% of the system by value is class A or B.** The
class-C surface is thin and mostly syntax — and one architectural constraint of the
current harness (the shell-out local-inference lane) actually *improves* under
model-agnostic targets. See `01-deep-analysis.md` §5.
