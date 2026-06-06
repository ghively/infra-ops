---
description: "Promote an observed pattern to a governed instinct (human approval + citation gated)."
---

# /instinct-promote

Promote a pattern observed by the `observe-runner` hook into a governed instinct in
the zone-segmented ledger under `knowledge/instincts/`. Promotion is **gated**: it
must pass the `learning-promotion-gate` (human approval, minimum confidence, and a
documentation citation for compliance items) before anything is written.

Load the **instinct-promotion** skill for the full protocol.

## Usage

```
/instinct-promote --id <id> --zone <corporate|hsa> --content <pattern> \
  --approver <user> [--confidence <0..1>] [--citation <ref>] [--evidence <ids>]
```

$ARGUMENTS:

- `--id` — unique instinct identifier (e.g. `instinct-fqcn-001`). **Required.**
- `--zone` — `corporate` (PCI DSS) or `hsa` (PCI CP + PIN). **Required.**
- `--content` — natural-language description of the pattern. **Required.**
- `--approver` — approver identifier. **Required.**
- `--confidence` — confidence score 0.0–1.0 (gate floor 0.7, recommended ≥0.85).
- `--citation` — documentation citation; **required** for compliance-related items.
- `--evidence` — comma-separated observation IDs supporting the pattern.

## Workflow

1. **Review the candidate** — confirm the pattern is valid, the confidence is
   sufficient, the zone is correct, and compliance items carry a citation.
2. **For HSA (`hsa`) items, satisfy dual control first:**

   ```bash
   node "${CLAUDE_PLUGIN_ROOT}/scripts/hooks/dual-control-promotion-gate.js" --check \
     --id <id> --zone hsa --approvers <a>,<b> --citation "<ref>"
   ```

3. **Submit for promotion** — invoke the gate CLI. It validates approver,
   confidence, citation, and zone, then (on success) writes the instinct and logs
   to the shared governance store:

   ```bash
   node "${CLAUDE_PLUGIN_ROOT}/scripts/hooks/learning-promotion-gate.js" --promote \
     --id <id> --zone <corporate|hsa> --content "<pattern>" --approver <user> \
     [--confidence <0..1>] [--citation "<ref>"] [--evidence <id,id>]
   ```

   Use `--dry-run` to validate without writing. The command exits non-zero on denial.
4. **On success** — the instinct is written to
   `knowledge/instincts/<zone>/<id>.yml` and the attempt is recorded to the
   governance store (`governanceEvents` collection).

## Trust boundary

- The agent **proposes**; a human **approves**. No instinct is promoted without an
  approver and (for compliance items) a documentation citation.
- HSA-zone promotions must occur in the HSA zone under dual control.
- Never promote an instinct that would encode access to PAN, keys, PINs, or HSM
  configuration.
