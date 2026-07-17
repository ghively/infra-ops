# Disambiguate "local lane" — air-gap vs sensitive-handling path

- Status: Accepted (2026-07-17) — chose Option 2 (build the ingress classifier now)
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

**Accepted: Option 2 (build the ingress classifier now).** Rather than defer the real
boundary to "later," the intake classifier is built up front: CHD-adjacent content is
refused *before* it reaches the cloud orchestrator, so the corporate sensitive-handling
path becomes an actual data boundary — not merely egress-risk reduction. The
naming/honest-scoping work from Option 1 is still done alongside it (reserve "air-gap"
for the HSA; call the corporate path the "sensitive-handling path"), but the "local
lane" claim is made defensible by the *mechanism*, not only by re-wording. This is more
work than a rename, accepted deliberately: putting the boundary at intake rather than
exhaust is the architecturally correct placement, and doing it now avoids shipping a
path that reads like a control it isn't.

Design note for implementation: an ingress classifier in a chat-based agent cannot sit
at the tool-call boundary (that's egress, and too late — the orchestrator has already
seen the content). It must gate content *entering* the orchestrator's context. Confirm
the harness hook point that can intercept intake before committing the approach; if no
such hook point exists, this decision reopens and falls back to Option 1 (rename +
honest scoping) plus a documented harness limitation.

### Consequences

- Good: the two isolation mechanisms stop sharing a name that implies equivalence.
- Good: aligns the written architecture with what the code actually guarantees.
- Bad: doc churn across three files; must keep the zone-token glossary consistent.
- Neutral: Option 2 remains available and is recorded here as the eventual target.
