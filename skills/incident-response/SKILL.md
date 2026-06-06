---
name: incident-response
description: >
  The bounded playbook for when cardholder data or a secret surfaces where it should
  not — e.g. the pan-egress-filter hook fires, or PAN appears in a log/file. Covers PCI
  DSS 12.10.x incident response and 12.10.7 (PAN found in an unexpected location):
  contain, notify, preserve evidence, and the agent's strictly-limited role. Triggers
  on: incident, PAN found, secret leaked, data exposure, pan-egress-filter fired,
  containment, breach, 12.10.7.
origin: infra-ops
---

# Incident Response Skill

## When to Use

Use the moment cardholder data, a PIN, key material, or a live secret appears where it
must not — the `pan-egress-filter` hook denied a tool call, a scan flagged a PAN, or
PAN/SAD turns up in a log, file, or output. This skill defines the agent's **narrow,
safe role** in a PCI incident; it does not make the agent an incident commander.

## How It Works

The agent's role is **stop, preserve, escalate — never exfiltrate or remediate
unilaterally.**

1. **Contain (do no harm)** — stop the action that surfaced the data. Do **not** copy,
   echo, paste, transmit, or "clean up" the value; do not delete the evidence. Any
   further handling moves to authorized humans out-of-band.
2. **Do not expand scope** — do not read more of the offending file/log than already
   surfaced; do not pull the data into the model context or any cloud path. CHD-adjacent
   material routes to the local lane only.
3. **Preserve evidence** — note *where* it was found (path, log, job id, line) **without
   reproducing the value**. The governance ledger already has a fingerprinted record;
   reference it.
4. **Notify / escalate** — surface a concise, redacted incident record to the human
   operator and the security/compliance owner. For PAN in an unexpected location this is
   **PCI DSS 12.10.7**; broader handling follows the org's 12.10.x incident response
   plan (roles, timelines, evidence handling, post-incident review).
5. **Record** — ensure the event reaches the tamper-evident audit trail / SIEM
   (governance-ledger forwards when configured). Recommend the follow-up: rotate any
   exposed credential, hunt for other copies, and a post-incident review.

## Examples

### Redacted incident record (what the agent emits)

```
INCIDENT: suspected CHD/secret exposure
Class: PAN-in-unexpected-location (PCI DSS 12.10.7) | leaked-credential | key-material
Where: <path / job-id / log line>   (VALUE NOT REPRODUCED)
Detected by: pan-egress-filter | secrets-scanner | manual
Containment taken: action halted; value not copied/transmitted; evidence preserved
Escalated to: <human operator / security owner>
Recommended follow-up: rotate exposed credential, search for other copies,
  open IR per 12.10.x, post-incident review
Governance ledger ref: <id>
```

## Trust boundary

- **Never reproduce, transmit, or delete** the exposed PAN/SAD/key/PIN. Cite location only.
- The agent **contains and escalates**; humans run the PCI incident-response plan.
- No autonomous remediation, no prod action, no cloud egress of sensitive data.
- HSA incidents are handled entirely in-zone under dual control — route, do not act.
