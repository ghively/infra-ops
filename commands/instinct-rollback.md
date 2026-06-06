---
description: "Roll back or deactivate a governed instinct (two-person approval for compliance items)."
---

# /instinct-rollback

Revert a governed instinct to a previous version or deactivate it. Compliance-related
instincts require **two-person approval**, and every rollback is recorded to the
governance ledger.

Load the **instinct-rollback** skill for the full protocol.

## Usage

```
/instinct-rollback --id <id> --reason <text> --approver1 <user> \
  [--version <n>] [--deactivate] [--approver2 <user>]
```

$ARGUMENTS:

- `--id` — instinct identifier to roll back. **Required.**
- `--reason` — clear reason for the rollback/deactivation. **Required.**
- `--approver1` — first approver identifier. **Required.**
- `--version` — target version to revert to (defaults to previous).
- `--deactivate` — mark the instinct inactive instead of reverting a version.
- `--approver2` — second approver; **required** for compliance-related instincts.

## Workflow

1. **Identify** the instinct and confirm it exists and is active:

   ```bash
   node "${CLAUDE_PLUGIN_ROOT}/scripts/lib/instinct-ledger.js" --list --zone <zone>
   ```

2. **Choose** rollback (revert to a prior version) or deactivation (mark inactive).
3. **Collect approvals** — one approver for routine instincts, two distinct
   approvers for compliance-related or HSA (`hsa`) instincts.
4. **Execute** — invoke the ledger CLI. It updates the entry (`status` plus a
   `rollback`/`deactivated` block) and logs to the shared governance store:

   ```bash
   node "${CLAUDE_PLUGIN_ROOT}/scripts/lib/instinct-ledger.js" --rollback \
     --id <id> --zone <zone> --reason "<text>" --approvers <a>[,<b>] \
     [--version <n>] [--deactivate]
   ```

   HSA/compliance rollbacks are rejected without two distinct approvers.

## Trust boundary

- The agent **proposes** the rollback; humans **approve** it. Compliance items are
  never rolled back on a single approval.
- Reasons must be specific; for compliance items the reason must state the
  compliance impact.
