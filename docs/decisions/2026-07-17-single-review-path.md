# One review path, wired to `/playbook-review`

- Status: Accepted (2026-07-17)
- Date: 2026-07-17
- Priority: 7
- Deciders: repo owner
- Related: `docs/architecture.md` §6 (the review gate), CLAUDE.md (review gate contract), `commands/playbook-review.md`, `scripts/merge-gate.js`

## Context and problem statement

The deterministic three-reviewer merge gate (§6) is the strongest part of the
architecture: `playbook-reviewer` + `pci-compliance-reviewer` + `secrets-scanner` run
in parallel, each returns a `VERDICT:` token, and `merge-gate.js` computes the decision
with no orchestrator discretion (any BLOCK blocks; a missing verdict is incomplete →
BLOCK; 2-cycle cap → escalate).

The flagship `/playbook-review` command implements a **different, weaker** flow: two
reviewers (no `secrets-scanner`), no `VERDICT:` tokens, a non-token vocabulary
("APPROVE / APPROVE WITH CONDITIONS / BLOCK"), and no call to `merge-gate.js`. So the
main human entry point bypasses the very gate the design is built around, and can
"clear" a change the gate would block. There are effectively two definitions of
"reviewed."

## Decision drivers

- There must be exactly one meaning of "reviewed" in the system.
- The command is the human-facing entry point; it should exercise the canonical gate,
  not a parallel approximation.
- `merge-gate.js` already encodes the decision logic deterministically — the command
  should call it, not re-implement judgment in prose.

## Considered options

1. **Rewire `/playbook-review` to the canonical gate** — three parallel reviewers with
   `VERDICT:` first-line tokens, decision computed by `node scripts/merge-gate.js`.
   Delete the command's bespoke vocabulary.
2. **Keep two flows, document the difference** — position `/playbook-review` as a
   "quick two-reviewer sanity check" distinct from the full gate.
3. **Deprecate the command** — fold review invocation into the orchestrator contract
   only, no dedicated command.

## Decision outcome

**Proposed: Option 1.** The design's best idea should be reachable from its front door.
Two definitions of "reviewed" (Option 2) is precisely the ambiguity that lets a change
ship under the weaker one; a "quick check" that can be mistaken for the gate is a
liability, not a convenience. Option 3 throws away a useful entry point. Rewiring the
command to the canonical gate is low effort and makes the system self-consistent.

### Consequences

- Good: one review path; the command and the contract agree; `merge-gate.js` is the
  single decision authority.
- Good: `secrets-scanner` (currently omitted by the command) is no longer skippable via
  the front door.
- Depends on: the reviewer agents explicitly instructing "`VERDICT:` must be the first
  output line" (a related agent-body fix) so `merge-gate.js` parses a real verdict and
  not a template placeholder.
- Bad: none of substance — the weaker flow has no capability the canonical gate lacks.
