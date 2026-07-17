# Close the learning loop (instinct recall) or mark it dormant

- Status: Accepted (2026-07-17)
- Date: 2026-07-17
- Priority: 1 (highest — blocks the value of the entire learning subsystem)
- Deciders: repo owner
- Related: `docs/architecture.md` §8, SPEC §5, `scripts/lib/instinct-ledger.js`, `scripts/hooks/observe-runner.js`

## Context and problem statement

The governed self-improvement loop is built on the **write** side end-to-end:
`observe-runner` captures patterns → candidate → `learning-promotion-gate` /
`dual-control-promotion-gate` → `instinct-ledger.js` writes
`knowledge/instincts/<zone>/<id>.yml` → governance event logged.

There is **no read side.** `instinct-ledger.js` exports writers plus a CLI `list()`;
no hook, agent, or orchestrator path injects *active* instincts into any decision
context (verified: no reader references `knowledge/instincts/` outside write/list/
validate paths). Every promoted instinct is filed and never consulted. The loop is
open — capture without recall — so the entire subsystem (observe-runner, both gates,
zone segmentation, dual-control) currently changes no behavior.

This also blocks schema decisions: how instincts are recalled dictates what fields an
instinct must carry (trigger conditions, applicability scope, injection form).

## Decision drivers

- The subsystem should either influence behavior or stop presenting as "done".
- Recall must respect zone isolation (corporate instincts must never load in HSA and
  vice-versa) and the enforcement hierarchy (instincts are advisory guidance, not
  hard rules).
- Minimize new machinery — prefer an existing injection rail.

## Considered options

1. **SessionStart recall hook** — extend `infra-session-bootstrap` (or a sibling) to
   load active instincts for the current zone into orchestrator context at session
   start.
2. **Rules-rail injection** — compile active instincts into path-scoped `rules/**`
   fragments so the existing deterministic rule-injection mechanism carries them into
   agent context on file match. Reuses a proven rail; naturally scoped.
3. **Explicitly mark dormant** — keep the write side, document the subsystem as
   "capture-only, recall not yet implemented," and remove "self-improvement" from the
   as-built claims until recall lands.

## Decision outcome

**Proposed: Option 2 (rules-rail injection) for corporate, with Option 3 as the
honest interim state until it ships.** The rules rail already does deterministic,
path-scoped, zone-agnostic context injection; instincts are conceptually the same
thing (learned guidance) and should ride it rather than invent a parallel loader.
Option 1 is simpler but injects unconditionally regardless of what the task touches,
bloating the "lean orchestrator." Until recall exists, the docs must say so (Option 3)
rather than imply a closed loop.

### Consequences

- Good: the loop closes on an existing, tested mechanism; scope stays zone-correct.
- Good: forces the instinct schema to carry an applicability scope (a `paths:`-like
  field), which it needs anyway.
- Bad: requires a compile step (instinct YAML → rule fragment) and a decision on
  regeneration timing.
- Neutral: until implemented, the as-built status downgrades honestly.
