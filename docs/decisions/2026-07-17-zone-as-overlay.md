# Zone as an overlay, not a parallel agent roster

- Status: Proposed
- Date: 2026-07-17
- Priority: 5
- Deciders: repo owner
- Related: `docs/architecture.md` §5, SPEC §3 (agents), the six `agents/perso-*.md`

## Context and problem statement

The HSA zone is implemented as a near-mirror of the corporate roster:
`perso-iac-author` ↔ `iac-author`, `perso-iac-reviewer` + `perso-cp-compliance-reviewer`
↔ `playbook-reviewer` + `pci-compliance-reviewer`, `perso-planner`/`-auditor`/`-scribe`
↔ their corporate counterparts. Six hand-written agents duplicate corporate agents with
zone-specific constraints layered in.

Because the HSA is air-gapped, the perso-* agents must exist as *separate runtime
deployments* — that part is unavoidable. But maintaining them as **hand-authored
copies** guarantees drift: every improvement to a corporate agent must be manually
re-applied to its perso twin. The reviews already found the drift this predicts —
inconsistent `model:` frontmatter and skill-wiring mismatches between twins.

## Decision drivers

- Air-gap requires separate *artifacts* at deploy time, but not separate *sources* at
  authoring time.
- One source of truth per agent role prevents the twin-drift failure mode.
- Zone-specific constraints (local-only, no-cloud, CP+PIN rules, dual-control) are a
  small, well-defined delta over the corporate body.

## Considered options

1. **Overlay + generation** — author each agent role once (corporate body) plus a
   zone-overlay fragment (the CP/PIN/local-only constraints); generate the perso-*
   artifact by applying the overlay. Regeneration is a build step; the generated files
   may still be committed for air-gap transfer.
2. **Shared includes** — keep two agent files but factor the common body into a shared
   rules/partial both include, so only the delta is duplicated.
3. **Leave as parallel roster** — accept manual mirroring; add a validator that flags
   divergence between twins.

## Decision outcome

**Proposed: Option 1 (overlay + generation).** It eliminates the drift class entirely
by making the twin a *derived artifact*, not a maintained one, while still producing a
committed file that can cross the air gap. Option 2 reduces but does not remove
duplication (frontmatter and wiring still diverge, as observed). Option 3 institutionalizes
the drift and only detects it after the fact. The overlay delta is small enough that
generation is straightforward.

### Consequences

- Good: one source of truth per role; corporate improvements propagate to HSA by
  regeneration, not memory.
- Good: the zone delta becomes an explicit, reviewable artifact (what *exactly* changes
  in-zone).
- Bad: introduces a generation step and a rule that perso-* files are generated, not
  hand-edited (enforce in SPEC §4 conventions + a validator that the committed artifact
  matches regeneration).
- Bad: one-time refactor of six existing agents into body + overlay form.
