---
name: instinct-promotion
description: >
  Promote an observed pattern to a governed instinct in the zone-segmented ledger
  (knowledge/instincts/corpor or in-zone). Enforces human approval, a minimum
  confidence score, and a documentation citation for compliance items via the
  learning-promotion-gate. Triggers on: instinct promote, promote pattern, governed
  instinct, instinct ledger, learning promotion, /instinct-promote.
origin: infra-ops
---

# Instinct Promotion Skill

## When to Use

Use this skill when a pattern observed by the `observe-runner` hook is ready to be
promoted to a governed instinct, and the promotion must pass the human-approval +
documentation-citation gate before it is written to the ledger. Reach for it on
prompts like "promote this pattern", "add an instinct", or `/instinct-promote`.

## How It Works

This skill manages the promotion of observed patterns to instincts in the instinct ledger. All promotions are gated by human approval and documentation citation.

## Usage

```
/instinct-promote --id <id> --zone <zone> --content <pattern>
```

## Parameters

| Parameter | Required | Description |
|-----------|----------|-------------|
| `--id` | Yes | Unique instinct identifier (e.g., `instinct-001`) |
| `--zone` | Yes | Target zone: `corpor` or `in-zone` (HSA) |
| `--content` | Yes | Natural language description of the pattern |
| `--confidence` | No | Confidence score (0.0-1.0, default: from evidence) |
| `--citation` | Conditional | Documentation citation (required for compliance items) |
| `--approver` | Yes | Approver identifier (username) |
| `--evidence` | No | Array of observation IDs and citations |

## Requirements

Before an instinct can be promoted, the following must be satisfied:

1. **Human Approval**: Approver identifier and signature/timestamp
2. **Minimum Confidence**: 0.7 (recommended: 0.85)
3. **Documentation Citation**: Required for compliance-related instincts
4. **Zone Verification**: Promotion must occur in the target zone
5. **Supporting Evidence**: At least one observation supporting the pattern

## Workflow

### 1. Observation

Patterns are observed by the `observe-runner` hook and stored in the State Store `observations` collection.

### 2. Proposal

Based on observations, propose instinct candidates:

```
/instinct-proposal --zone corpor
```

This reviews observations and proposes candidates for promotion.

### 3. Review

Review the proposed instinct:

- Verify the pattern is valid and useful
- Check confidence score is sufficient
- Ensure compliance items have citations
- Verify zone assignment is correct

### 4. Promotion

Promote the instinct:

```
/instinct-promote \
  --id instinct-001 \
  --zone corpor \
  --content "Always use FQCN in Ansible playbooks" \
  --confidence 0.85 \
  --citation "Ansible Best Practices" \
  --approver user-123 \
  --evidence obs-001,obs-005
```

### 5. Verification

The learning-promotion-gate hook validates:

- All requirements are met
- Human approval is valid
- Documentation citation exists (for compliance)
- Zone sandbox verification passes

### 6. Activation

On success, the instinct is written to the ledger:

- `knowledge/instincts/corpor/instinct-001.yml` (corporate zone)
- `knowledge/instincts/in-zone/instinct-001.yml` (HSA zone)

## Zone Separation

Instincts are zone-segmented to prevent cross-contamination:

- **corpor/**: Corporate zone instincts (DSS-scoped)
- **in-zone/**: HSA zone instincts (PCI Card Production zone)

Instincts promoted for the HSA zone MUST be promoted from within the HSA zone (air-gapped).

## Compliance-Related Instincts

For instincts related to PCI compliance, the following additional requirements apply:

- Documentation citation MUST reference specific PCI requirements (e.g., "PCI DSS Req 7.2")
- Dual control MAY be required (handled by dual-control-promotion-gate)
- Zone verification MUST confirm HSA zone for HSA instincts

## Example

```bash
# Observe pattern from State Store
# Observation: "Users who forget FQCN have more playbook errors"

# Propose instinct
/instinct-proposal --zone corpor

# Review shows candidate:
# - Content: "Use FQCN for all Ansible modules"
# - Confidence: 0.85
# - Evidence: obs-001, obs-005

# Promote instinct
/instinct-promote \
  --id instinct-fqcn-001 \
  --zone corpor \
  --content "When authoring Ansible playbooks, always use FQCN (Fully Qualified Collection Name) for all modules. This ensures compatibility across Ansible versions and improves playbook readability." \
  --confidence 0.85 \
  --citation "Ansible Best Practices Documentation" \
  --approver senior-op-1 \
  --evidence obs-001,obs-005

# Result: Instinct written to knowledge/instincts/corpor/instinct-fqcn-001.yml
```

## Rollback

If an instinct is found to be incorrect or harmful, use `/instinct-rollback` to revert to a previous version or deactivate the instinct.

## Governance

All instinct promotions are logged to the `governanceEvents` collection in the State Store with:

- Timestamp
- Instinct ID
- Zone
- Approver
- Result (allowed/denied)
- Reason (if denied)

## References

- `scripts/hooks/learning-promotion-gate.js` - Validation logic
- `scripts/hooks/dual-control-promotion-gate.js` - Dual control for HSA
- `knowledge/instincts/` - Instinct ledger storage
- `scripts/hooks/observe-runner.js` - Observation capture
