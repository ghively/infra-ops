# Enforce "propose, never dispose" at the tool boundary

- Status: Proposed
- Date: 2026-07-17
- Priority: 3
- Deciders: repo owner
- Related: SPEC §2 (hard trust boundary, rule #1), CLAUDE.md hard rules, `docs/architecture.md` §2

## Context and problem statement

Hard rule #1 — **propose, never dispose**: the agent never runs `ansible-playbook`
against test/staging/prod and never auto-promotes; promotion is human-gated.

Rule #2 (no crown jewels / no PAN) is enforced by a real PreToolUse hook
(`pan-egress-filter`). **Rule #1 has no hook at all.** The only `ansible-playbook`
reference in the hook set is `ansible-syntax-hook`, which *runs* `ansible-playbook
--syntax-check`. Prod-execution prevention exists solely as CLAUDE.md prose (the
softest enforcement layer) plus `validate-deployment.js`, which inspects `.gitlab-ci.yml`
*structure*, not runtime command execution.

This is an architectural asymmetry: two equally load-bearing rules, one enforced at
the tool boundary and one enforced by prompt convention. The rule that keeps the agent
out of production is the one without a hard control.

## Decision drivers

- Rule #1 is designated "load-bearing … not incremental" in SPEC §2 — it belongs in
  the hardest enforcement layer, consistent with rule #2.
- The hook must distinguish an allowed **Dev** deploy from a forbidden
  test/staging/prod execution and from an auto-promotion.
- False positives (blocking legitimate Dev work) must be recoverable, like other
  hooks' env toggles.

## Considered options

1. **New PreToolUse hook `prod-execution-guard`** — denies Bash tool calls invoking
   `ansible-playbook`/promotion commands against non-dev inventories (deny by default;
   allow only explicit dev inventory targets). Fail-closed with an env override,
   mirroring `pan-egress-filter`.
2. **Extend `sensitivity-router`** — fold prod-execution detection into the existing
   router rather than add a hook.
3. **Leave as prose + CI structure validation** — accept that runtime prevention is
   out of scope for a propose-only agent that "shouldn't" run playbooks anyway.

## Decision outcome

**Proposed: Option 1.** Rule #1 deserves its own dedicated, single-responsibility hook
symmetric with the PAN filter, not a bolt-on to a router with a different job (Option 2
muddies two concerns and inherits the router's field-allowlist limitations). Option 3
is the current state and is exactly the asymmetry this record exists to close — "the
agent shouldn't" is a prompt, not a control. Deny-by-default with an allowlist of dev
inventory patterns matches the propose-never-dispose posture.

### Consequences

- Good: the two hard rules are now both enforced at the tool boundary; the architecture's
  own §2 principle is applied consistently.
- Good: pairs naturally with the hook-conformance harness (record 2) — this hook ships
  with a bad-payload fixture proving it denies a staging run.
- Bad: requires knowing the dev-inventory naming convention, which is estate-specific
  and lives in `knowledge/environment.md` (not yet produced) — interim: deny all
  non-dev and allow an explicit `INFRAOPS_DEV_INVENTORY` allowlist.
- Bad: another PreToolUse hook in the chain (keep it fast; it only parses Bash command
  strings).
