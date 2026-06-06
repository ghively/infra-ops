---
name: instinct-rollback
description: >
  Roll back a governed instinct to a previous version or deactivate it, with
  two-person approval for compliance-related instincts and a full governance-ledger
  audit trail. Triggers on: instinct rollback, deactivate instinct, revert instinct,
  rollback pattern, /instinct-rollback.
origin: infra-ops
---

# Instinct Rollback Skill

## When to Use

Use this skill when a promoted instinct is found to be incorrect, harmful, or no
longer applicable and must be reverted to a prior version or deactivated. Reach for
it on prompts like "roll back that instinct", "deactivate the instinct", or
`/instinct-rollback`.

## How It Works

This skill manages the rollback of instincts to previous versions or deactivation. All rollbacks require two-person approval for compliance-related instincts and are logged to the governance ledger.

## Usage

```
/instinct-rollback --id <id> [--version <n>] [--deactivate]
```

## Parameters

| Parameter | Required | Description |
|-----------|----------|-------------|
| `--id` | Yes | Instinct identifier to rollback |
| `--version` | No | Target version (default: previous) |
| `--deactivate` | No | Deactivate instinct instead of rollback |
| `--reason` | Yes | Reason for rollback/deactivation |
| `--approver1` | Yes | First approver identifier |
| `--approver2` | Conditional | Second approver (required for compliance-related) |

## Requirements

Before an instinct can be rolled back, the following must be satisfied:

1. **Valid Instinct**: Instinct must exist and be active
2. **Reason**: Clear reason for rollback must be provided
3. **Approval**: At least one approver (two for compliance-related)
4. **Version**: If rolling back to specific version, version must exist

## Workflow

### 1. Identify Issue

Identify the instinct causing issues:

```bash
# List active instincts
/instinct-list --zone corpor

# Show instinct details
/instinct-show --id instinct-fqcn-001
```

### 2. Determine Action

Choose rollback or deactivation:

- **Rollback**: Revert to previous version (if versions exist)
- **Deactivate**: Mark instinct as inactive (removed from active use)

### 3. Get Approvals

For compliance-related instincts, obtain two-person approval:

- Approver 1: Senior operator or CPSA assessor
- Approver 2: Different senior operator or CPSA assessor

### 4. Execute Rollback

```bash
# Rollback to previous version
/instinct-rollback \
  --id instinct-fqcn-001 \
  --version 2 \
  --reason "Pattern causes false positives for legacy playbooks" \
  --approver1 senior-op-1 \
  --approver2 senior-op-2

# Or deactivate
/instinct-rollback \
  --id instinct-fqcn-001 \
  --deactivate \
  --reason "Pattern no longer applicable after Ansible 3.0 upgrade" \
  --approver1 senior-op-1
```

### 5. Verification

The rollback operation:

1. Validates instinct exists
2. Checks approval requirements
3. Performs rollback or deactivation
4. Logs to governance events
5. Updates instinct ledger

## Compliance-Related Instincts

For instincts related to PCI compliance, the following additional requirements apply:

- **Two-person approval** required
- **Reason must cite specific issue** with compliance impact
- **Audit trail logged** with both approvers

## Example

```bash
# Issue: Instinct causes unexpected behavior
/instinct-rollback \
  --id instinct-hsm-001 \
  --deactivate \
  --reason "HSM interaction pattern violates operator-only requirement" \
  --approver1 senior-op-1 \
  --approver2 cpsa-assessor

# Result:
# - Instinct marked as status: deactivated
# - Logged to governance events
# - No longer used in active operations
```

## Rollback File Format

When rolling back, the instinct file is updated:

```yaml
id: instinct-001
version: 2  # Reverted from version 3
confidence: 0.85
evidence:
  - observation_id: obs-xxx
    citation: "docs/..."
promoted_at: "2026-06-01T12:00:00Z"
promoted_by: "user-approval"
status: active
rollback:
  from_version: 3
  at: "2026-06-03T14:30:00Z"
  by: ["senior-op-1", "senior-op-2"]
  reason: "Pattern caused false positives"
content: |
  Original pattern content
```

## Deactivation

When deactivating, the instinct file is updated:

```yaml
id: instinct-001
version: 3
confidence: 0.85
evidence: [...]
promoted_at: "2026-06-01T12:00:00Z"
promoted_by: "user-approval"
status: deactivated  # Changed from 'active'
deactivated:
  at: "2026-06-03T14:30:00Z"
  by: ["senior-op-1"]
  reason: "Pattern no longer applicable"
content: |
  Original pattern content
```

## Governance

All instinct rollbacks are logged to the `governanceEvents` collection:

- Timestamp
- Instinct ID
- Action (rollback/deactivate)
- Approver(s)
- Reason
- Result

## Reactivation

To reactivate a deactivated instinct:

```bash
/instinct-reactivate --id instinct-001 --reason "Issue resolved"
```

This requires the same approval process as promotion.

## References

- `scripts/hooks/learning-promotion-gate.js` - Promotion gate
- `scripts/hooks/dual-control-promotion-gate.js` - Dual control validation
- `knowledge/instincts/` - Instinct ledger storage
