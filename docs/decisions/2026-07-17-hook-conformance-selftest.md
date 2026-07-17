# Hook conformance self-test — verify the enforcers actually enforce

- Status: Proposed
- Date: 2026-07-17
- Priority: 2
- Deciders: repo owner
- Related: `docs/architecture.md` §2 (enforcement hierarchy), §3 (hook pipeline), `hooks/hooks.json`

## Context and problem statement

The architecture stakes its entire safety story on §2: **hooks are binding, prompts
are advisory.** That claim is only as good as the hooks actually running and actually
failing closed. There is currently **no mechanism that verifies either.**

Concrete proof of the risk: `gateguard-fact-force.js` is wired in `hooks.json` as a
bare `node …` invocation but has no `if (require.main === module)` stdin entry point,
so it reads nothing, emits nothing, and exits 0 — a "hard" control that enforces
nothing, while every doc lists it as built and wired. `validate-hooks.js` only checks
that the file exists on disk, not that it behaves.

"Enforced by hooks, not prompts" is unsupportable without a test that the enforcers
enforce.

## Decision drivers

- A wired-but-inert hook is worse than no hook: it produces false assurance.
- The repo already favors deterministic scripted gates (`merge-gate.js`); the same
  philosophy should apply to the hooks themselves.
- Must catch three failure classes: hook never runs, hook runs but no-ops, hook
  fails open when it should fail closed.

## Considered options

1. **Conformance harness (new validator)** — a `tests/ci/validate-hook-conformance.js`
   that, for each event-wired hook, feeds a known-bad payload on stdin and asserts the
   expected `deny` decision (and a known-good payload asserts allow). Runs in the
   19-validator suite.
2. **Runtime self-test at SessionStart** — bootstrap fires each hook with a canary
   payload and warns/aborts if any enforcer no-ops. Catches environment-specific
   breakage the CI harness can't see.
3. **Both** — CI harness for correctness on every change; a lightweight SessionStart
   canary for deploy-time integrity.

## Decision outcome

**Proposed: Option 3.** The CI harness (Option 1) is the primary control — it would
have caught the inert gateguard immediately and belongs in the suite that already
gates changes. The SessionStart canary (Option 2) is a cheap add that catches
integrity loss in a real deployment (missing interpreter, bad `CLAUDE_PLUGIN_ROOT`,
permissions) that a repo-side test cannot. Together they make §2's claim defensible.

### Consequences

- Good: converts "hooks are binding" from an assertion into a tested invariant.
- Good: each hook gains a canonical bad-payload fixture — doubles as documentation of
  what it denies.
- Bad: every new hook must ship a conformance fixture (acceptable tax; enforce in the
  extend-conventions in SPEC §4).
- Bad: SessionStart canary adds a small startup cost (bounded; run once, cache).
