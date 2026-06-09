---
name: perso-change-control
description: >
  In-zone (HSA) change-control process for personalization/data-prep systems:
  CISO-approved, dual-control, witnessed test-to-live promotion with separation of
  duties between dev and production staff. The agent prepares change artifacts and
  records; humans approve and deploy. Advisory-only; never an autonomous deploy.
  Triggers on: change control, test to live, promotion, dual control, witnessed
  sign-off, ciso approval, separation of duties, perso, personalization, in-zone,
  hsa, cp logical 6.2, emergency change, baseline validation.
origin: infra-ops
---

# Perso Change-Control Skill

> **ADVISORY STUB — Phase 7 / CPSA-gated. Not yet active.**
>
> Encodes the in-zone change-control discipline from **PCI Card Production Logical
> §6.2–§6.6**. The agent's role is to *prepare* compliant change artifacts and *gate*
> on the controls — never to approve or deploy. Verify section numbers against the
> current PCI CP Logical PDF. Do not extend without a CPSA review.

## When to Use

Load this skill whenever a `perso-*` agent prepares or reviews a change destined for
the personalization or data-preparation network: any promotion from test toward live,
any emergency change, or any baseline-validation activity. It defines the human gates
the agent must build toward and must never bypass.

## How It Works

### The Promotion Gate (CP Logical §6.2)

Test → live promotion is a **human, witnessed, dual-control** event:

1. **CISO approval** — documented before deployment. No change reaches live without it.
2. **Dual sign-off** — *both* development and production staff sign off, **witnessed
   under dual control**. Two distinct people; the agent is never one of them.
3. **Separation of duties (§6.6.3 d)** — the identity that authored the change cannot
   be the identity that deploys it to live perso. Enforce author ≠ deployer.
4. **No autonomous deploy** — the agent opens an in-zone MR and prepares the change
   record; a human performs the promotion. The `dual-control-promotion-gate` is the
   machine check (two distinct approvers + citation + CPSA reference + in-zone flag).

### The Change Record the Agent Prepares

For every in-zone change, the agent assembles (text/artifacts only — no PAN/keys/PINs):

- **What & why** — scope, target systems, and the business/security justification.
- **`--check --diff` evidence** — a dry-run diff proving the change is idempotent.
- **Rollback plan** — explicit, tested revert path (per `rollback-and-runbooks`).
- **Blast radius** — which perso/DP hosts are affected; what breaks if it fails.
- **Approver slots** — named dev signer, named prod signer, witness, CISO approver
  (left for humans to sign; the agent never self-signs).
- **Ceremony notes** — if the change is adjacent to a key/PIN ceremony, *reference*
  the ceremony and its custodians; never include key/PIN material.

### Emergency Change (CP Logical §6.2)

- A documented emergency procedure with **retrospective approval** — not a bypass of
  control, a different, logged path. The agent records the emergency justification and
  flags it for retrospective CISO sign-off. The `INFRAOPS_BYPASS_DUAL_CONTROL` flag on
  the promotion gate is audited and must map to a documented emergency procedure.

### Baseline & Patch Discipline (CP Logical §6.3)

- **Monthly** configuration validation against the authorized baseline; a non-empty
  drift is a finding (pairs with `drift-detection`).
- Security patches within **30 days** (critical / Internet-facing: **7 business days**).
- The agent can *propose* the patch/validation change and the evidence; humans apply.

### Separation of Duties & Source Access (CP Logical §6.6.3)

- Personalization-application source is restricted to authorized personnel; the in-zone
  GitLab is separate from corporate GitLab with its own ACLs.
- Dev and production staff are distinct roles. The agent's service account is
  least-privilege: branch/MR write only — no protected-branch, no deploy rights.

### What the Agent Never Does

```
NEVER:
  - approve a change (CISO / dev / prod sign-off are human)
  - deploy to live perso/DP systems
  - act as the second person in dual control
  - merge its own in-zone MR
  - include PAN / keys / key components / PINs in any change artifact
ALWAYS:
  - prepare the compliant change record + check/diff evidence + rollback
  - leave every approval slot for a named human
  - route key/PIN ceremonies to the custodian team by reference
```

## Examples

```
# Correct response when asked to "push this straight to the perso boxes":
"No autonomous deploy to live personalization systems. Test→live requires CISO
approval and a witnessed, dual-control sign-off by both dev and production staff
(CP Logical §6.2). I've prepared the change record, --check --diff evidence, and a
rollback plan; the named approvers must sign and a human performs the promotion."

# Correct response on an emergency change:
"Logged as an emergency change with justification attached for retrospective CISO
approval (CP Logical §6.2). If the dual-control bypass is used it is audited to the
off-box ledger and must reference the documented emergency procedure."
```

> TODO: Flesh out once the in-zone GitLab/Octopus topology and the real perso
> deployment process are confirmed and ingested, and a CPSA-L assessor has reviewed
> the design. (DESIGN §14 Phase 7)
