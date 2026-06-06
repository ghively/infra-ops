# CPSA Authorization Record — Phase 7 Tooling

This is the **citable approval artifact** required by CLAUDE.md hard rule #4
("Cite, don't guess") and DESIGN §14 Phase 7 before any Phase-7 (in-HSA) work
proceeds. It deliberately separates two distinct authorizations that are often
conflated: authorization to **build the tooling** vs. authorization to **deploy
it in-zone (go-live)**.

> Keep this record honest. It is referenced by `scripts/hooks/dual-control-promotion-gate.js`
> (the `--cpsa-ref` field) and by the Phase-7 status in `TODO.md` / `docs/architecture-gap.md`.

---

## 1. Build authorization (GRANTED)

| Field | Value |
|---|---|
| Authorizes | Authoring the Phase-7 in-zone **tooling as proposals** — `perso-*` agent definitions, HSA deployment runbooks, dual-control gate wiring — for review and air-gap transfer into the HSA. |
| Granted by | Repository owner (`genehively@gmail.com`) |
| Date | 2026-06-06 |
| Scope boundary | **Propose, never dispose.** No in-zone deployment, no `ansible-playbook` run against the HSA, no HSM/key/PIN/PAN material authored. Crown-jewels exclusions (CLAUDE.md rule #2) remain absolute and have no exception under this authorization. |
| Mechanism | These artifacts are authored in the corporate zone and are inert until a human reviews them and transfers them across the air gap per the runbook in `knowledge/hsa-deployment.md §Air-Gap Transfer`. |

Under this authorization the artifacts in
[§4 Covered artifacts](#4-covered-artifacts) were built. They change nothing in
the HSA on their own.

---

## 2. Go-live / deployment authorization (PENDING — DO NOT DEPLOY)

In-zone **deployment** remains gated. DESIGN §14 Phase 7 (line 457) requires a
documented **CPSA-L sign-off** "that the agent's design + auditable HSA exclusion
are acceptable, *before* go-live," and that the chain be "defensible to an on-site
CPSA assessor." The following MUST be attached here and verified before any
in-zone deployment:

| Field | Value |
|---|---|
| CPSA-L assessor (name / firm) | *PENDING — attach before go-live* |
| Assessment reference (AOC + ROC / report ID) | *PENDING* |
| Sign-off date | *PENDING* |
| Approved scope (which systems, which zone split) | *PENDING — see DESIGN §17 open scoping questions* |
| Air-gap exclusion evidence reviewed | *PENDING* |

Until every field above is filled from a real assessment, the dual-control gate
should be invoked with a `--cpsa-ref` that points at a **build**-scope reference
only, and **no in-zone deployment may occur**.

---

## 3. Standing exclusions (never waived)

These hold regardless of any authorization above (CLAUDE.md rule #2; DESIGN line 114):

- No cleartext PAN / CHD.
- No cryptographic keys or key components.
- No PINs or PIN blocks.
- No HSM configuration.
- No autonomous / agent-driven deployment in-zone.

Anything touching the above stays a **dual-control, split-knowledge, human**
ceremony on air-gapped hardware. The tooling here only ever *documents* or
*advises*; it never performs these operations.

---

## 4. Covered artifacts

Authored under the §1 build authorization:

- `agents/perso-iac-author.md` — LOCAL-ONLY in-zone authoring agent (proposal).
- `agents/perso-iac-reviewer.md` — LOCAL-ONLY in-zone correctness/idempotency reviewer (proposal).
- `agents/perso-cp-compliance-reviewer.md` — LOCAL-ONLY in-zone PCI CP + PIN compliance reviewer (proposal).
- `knowledge/hsa-deployment.md` — expanded operational runbooks (bring-up, transfer, promotion, rollback).
- `scripts/hooks/dual-control-promotion-gate.js` — in-zone promotion path: requires a CPSA reference, two distinct approvers, a citation, and the in-zone flag.
- `tests/unit/dual-control.test.js` — coverage for the gate's in-zone path.

## References

- CLAUDE.md — hard rules #1 (propose, never dispose), #2 (crown jewels), #4 (cite, don't guess).
- DESIGN §14 Phase 7 (CPSA-L sign-off before go-live); §3 in-zone subagent table; line 114 hard exclusions.
- `knowledge/hsa-deployment.md` — air-gap transfer + in-zone deployment runbooks.
- PCI DSS Req 7.2 (two-person control); PCI Card Production Logical §5.2(e) (air-gap).
