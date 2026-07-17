# Disambiguate "local lane" — air-gap vs sensitive-handling path

- Status: Proposed
- Date: 2026-07-17
- Priority: 4
- Deciders: repo owner
- Related: `docs/architecture.md` §4 (zone model + "local lane — honest picture"), SPEC §2 rule #3, `agents/sensitive-local-analyst.md`, `scripts/hooks/sensitivity-router.js`, `scripts/lib/ollama-router.js`

## Context and problem statement

The design uses **"local lane"** for two architecturally different mechanisms:

1. **The air-gapped HSA** — a physically separate, no-cloud-path in-zone orchestrator
   running local Ollama. A genuine data-isolation boundary. Sound.
2. **The corporate-zone CHD-adjacent path** — a *cloud-hosted* subagent
   (`sensitive-local-analyst`) decides sensitivity and shells out to a local Ollama
   endpoint.

Mechanism (2) is not a data-isolation boundary. The sensitivity decision is made by a
keyword hook (`sensitivity-router`) with a hardcoded field allowlist, and it acts at
**tool-call egress** — but in a chat agent the sensitive content enters at the
**prompt/context**, which the cloud orchestrator has already seen before any routing
occurs. It reduces egress risk; it does not prevent CHD from reaching the cloud model.

Calling both "local lane" invites reading (2) as a compliance control it is not.

## Decision drivers

- Compliance claims must not overstate what a mechanism provides (SPEC "cite, don't
  guess" ethos applies to our own architecture claims too).
- The `docs/architecture.md` §4 "honest picture" note already concedes the model-label
  point; this record generalizes it and makes the vocabulary carry the distinction.
- Renaming touches at least three docs (architecture, SPEC, the agent body).

## Considered options

1. **Rename and re-scope** — reserve "air-gap"/"in-zone local inference" for (1); call
   (2) the **"sensitive-handling path"** and document it explicitly as egress-risk
   reduction, *not* CHD isolation. State plainly: the only real CHD isolation is the
   air gap.
2. **Strengthen (2) toward a real boundary** — add an *ingress* classifier that
   refuses CHD-adjacent content before it reaches the cloud orchestrator, making the
   "local lane" name more defensible.
3. **Leave as-is** — keep one vocabulary; rely on the existing honest-picture note.

## Decision outcome

**Proposed: Option 1 now, Option 2 as a later enhancement.** The immediate risk is a
*claims* risk — a PoC path being mistaken for a compliance control — and that is fixed
by naming and honest scoping, cheaply, today. Option 2 is the architecturally correct
long-term move (put the boundary at intake, not exhaust) but is real new work and is
not required for corporate-zone development, which is where the PoC lives. Option 3
leaves a foreseeable misread in place.

### Consequences

- Good: the two isolation mechanisms stop sharing a name that implies equivalence.
- Good: aligns the written architecture with what the code actually guarantees.
- Bad: doc churn across three files; must keep the zone-token glossary consistent.
- Neutral: Option 2 remains available and is recorded here as the eventual target.
