# Make dynamic model tiering real, or drop the claim

- Status: Proposed
- Date: 2026-07-17
- Priority: 8 (lowest — clarity/consistency, not safety)
- Deciders: repo owner
- Related: `docs/architecture.md` §5, SPEC §3 (agents table), `agents/iac-author.md`

## Context and problem statement

`iac-author` is documented as **"opus→sonnet"** — greenfield authoring on the higher
tier, routine changes on the lower tier. But an agent's `model:` frontmatter holds a
single static value; the harness dispatches that one model. The dynamic tiering exists
only as prose in the agent body ("the orchestrator picks the tier at dispatch"), with
no described mechanism, so mechanical dispatch always yields the frontmatter default.
The design describes a capability the delivery mechanism does not implement.

## Decision drivers

- The as-built docs should describe what actually happens on dispatch, not an aspiration.
- If dynamic tiering is desired, the override mechanism must be explicit and documented,
  not implied.
- This is a consistency/clarity issue, not a safety one — lowest priority.

## Considered options

1. **Document the override mechanism** — state in CLAUDE.md that the orchestrator may
   pass an explicit model override at Task dispatch (naming the frontmatter value as
   the default and the higher tier as an opt-in for greenfield work), and make that a
   real, described routing rule rather than agent-body prose.
2. **Drop the dynamic claim** — set a single honest default (e.g. the tier that fits
   the common case) and remove "opus→sonnet" from the docs; note that a human can
   override per-invocation if needed.
3. **Two agents** — split into `iac-author` (higher tier, greenfield) and a
   `iac-author-routine` (lower tier), routed by the orchestrator by task type.

## Decision outcome

**Proposed: Option 1.** Dynamic tiering is a reasonable cost optimization and the
orchestrator is the right place to decide it; the only defect is that the mechanism is
undocumented prose. Making the override an explicit, described routing rule turns the
"opus→sonnet" claim true. Option 3 doubles the agent surface (and the drift risk this
whole review keeps flagging) for a routing decision the orchestrator can make. Option 2
is the safe fallback if per-dispatch override proves unreliable in practice.

### Consequences

- Good: the docs match dispatch behavior; the cost optimization is real and explicit.
- Bad: relies on the orchestrator reliably setting the override at Task time — if that
  proves flaky, fall back to Option 2.
- Neutral: no code change to the agent itself; the change is to the routing contract in
  CLAUDE.md.
