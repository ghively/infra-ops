---
name: instinct-promotion
description: >
  Promote an observed pattern to a governed instinct in the zone-segmented ledger
  (knowledge/instincts/corporate or hsa). Enforces human approval, a minimum
  confidence score, and a documentation citation for compliance items via the
  learning-promotion-gate. Triggers on: instinct promote, promote pattern, governed
  instinct, instinct ledger, learning promotion, /instinct-promote.
origin: infra-ops
---

# Instinct Promotion Skill

## When to Use

Use this skill when a pattern observed by the `observe-runner` hook (recorded in the
State Store) has proven itself and should become a **governed instinct** — a durable,
versioned, evidence-cited rule the agent applies going forward. Reach for it on
prompts like "promote this pattern", "make this an instinct", or `/instinct-promote`.

A pattern is **promotable** only when all of these hold (otherwise it is noise):

- it recurs across multiple observations (not a one-off),
- it has a clear, statable rule and a measurable benefit,
- its blast radius is understood (what it changes about future behavior),
- for compliance-related rules, it is backed by a **specific** documentation citation
  (doc + section/revision — not "best practices").

## How It Works

Promotion is **governed**: the agent never writes the ledger directly. The flow is

```
observe-runner → candidate → /instinct-promote → learning-promotion-gate
   → (HSA only) dual-control-promotion-gate → instinct-ledger writes the entry
   → governance event recorded in the unified State Store
```

The `learning-promotion-gate` enforces, and **denies** the promotion unless:

1. **Human approval** — an `--approver` identifier is present.
2. **Minimum confidence** — `>= 0.7` (recommended `>= 0.85`).
3. **Documentation citation** — required when the content is compliance-related
   (mentions pci/dss/pin/chd/card-production/hsm/cpsa).
4. **Valid zone** — `corporate` (PCI DSS) or `hsa` (PCI CP + PIN). HSA promotions must
   run in the HSA zone (`INFRA_HSA_ZONE=1`) and additionally pass dual control
   (two distinct approvers) via `dual-control-promotion-gate`.

On success the entry is written to `knowledge/instincts/<zone>/<id>.yml` with
`status: active`, and the attempt (allow or deny) is logged to the State Store
`governanceEvents` collection. Zone tokens `corpor`/`in-zone` are accepted as legacy
aliases for `corporate`/`hsa`.

## Examples

### Promote a corporate-zone instinct

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/hooks/learning-promotion-gate.js" --promote \
  --id fqcn-001 --zone corporate \
  --content "Author Ansible modules with their FQCN to stay version-stable." \
  --confidence 0.9 --approver senior-op-1 --evidence obs-001,obs-005
# → writes knowledge/instincts/corporate/fqcn-001.yml ; exits non-zero on denial
```

### Validate without writing (dry run)

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/hooks/learning-promotion-gate.js" --promote \
  --id tls-min --zone corporate --content "Enforce TLS 1.2+ on all services." \
  --confidence 0.9 --approver op1 --citation "PCI DSS v4.0.1 Req 4.2.1" --dry-run
```

A compliance-related content string (here it mentions TLS/PCI) is **denied without a
`--citation`** — and the citation must be specific (`"PCI DSS v4.0.1 Req 4.2.1"`), not
vague ("best practices").

### HSA-zone instinct (requires dual control first)

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/hooks/dual-control-promotion-gate.js" --check \
  --id perso-x --zone hsa --approvers senior-op-1,cpsa-assessor \
  --citation "PCI CP Logical Security v3.0 §X"
# then, in-zone (INFRA_HSA_ZONE=1):
INFRA_HSA_ZONE=1 node "${CLAUDE_PLUGIN_ROOT}/scripts/hooks/learning-promotion-gate.js" \
  --promote --id perso-x --zone hsa --content "…" --confidence 0.9 \
  --approver senior-op-1 --citation "PCI CP Logical Security v3.0 §X"
```

## Trust boundary

- The agent **proposes**; a human **approves**. No silent self-promotion.
- Never promote an instinct that encodes access to PAN, keys, PINs, or HSM config.
- Rollback/deactivation is governed too — see the `instinct-rollback` skill.
