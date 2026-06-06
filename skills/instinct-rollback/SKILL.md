---
name: instinct-rollback
description: >
  Roll back a governed instinct to a previous version or deactivate it, with
  two-person approval for compliance/HSA instincts and a full governance-ledger audit
  trail. Triggers on: instinct rollback, deactivate instinct, revert instinct,
  rollback pattern, /instinct-rollback.
origin: infra-ops
---

# Instinct Rollback Skill

## When to Use

Use this skill when a promoted instinct turns out to be incorrect, harmful, or no
longer applicable and must be **reverted to a prior version** or **deactivated**. Reach
for it on prompts like "roll back that instinct", "deactivate the instinct", or
`/instinct-rollback`. Deactivation takes effect for the **next** session — it does not
retroactively undo work already produced under the instinct.

## How It Works

Rollback is governed and audited; the agent never hand-edits ledger files. The
`scripts/lib/instinct-ledger.js` CLI updates the entry (`status` plus a `rollback:` or
`deactivated:` block) and logs an `instinct-rollback` event to the unified State Store.

Approval rules:

- **Routine instinct** — at least one `--approver`.
- **Compliance-related or HSA (`hsa`/`in-zone`) instinct** — **two distinct
  approvers** (dual control). The CLI rejects a single-approver rollback for these.
- **Reactivation** of a deactivated compliance instinct is at least as strict as its
  rollback (re-promote through `/instinct-promote` with the same gate; HSA needs dual
  control again).

Zones are `corporate` / `hsa` (legacy `corpor` / `in-zone` accepted).

## Examples

### List, then roll a corporate instinct back a version

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/lib/instinct-ledger.js" --list --zone corporate
node "${CLAUDE_PLUGIN_ROOT}/scripts/lib/instinct-ledger.js" --rollback \
  --id fqcn-001 --zone corporate --version 2 \
  --reason "Caused false positives on legacy roles" --approvers senior-op-1
```

### Deactivate a compliance/HSA instinct (dual control enforced)

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/lib/instinct-ledger.js" --rollback \
  --id perso-x --zone hsa --deactivate \
  --reason "Pattern conflicts with operator-only requirement (PCI CP §X)" \
  --approvers senior-op-1,cpsa-assessor
# A single approver here is rejected: compliance/HSA rollback needs two distinct approvers.
```

## Trust boundary

- The agent **proposes** the rollback; humans **approve** it. Compliance/HSA items are
  never rolled back or reactivated on a single approval.
- Reasons must be specific; for compliance items state the compliance impact.
- Every rollback/deactivation is recorded in the governance ledger.
