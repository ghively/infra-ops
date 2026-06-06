---
name: pci-pin-awareness
description: >
  PCI PIN Security awareness for in-zone (HSA) work: recognize PIN data, PIN
  blocks, and PIN-key operations so they can be REFUSED and routed to a human
  dual-control ceremony — never handled by the agent. Advisory-only; the agent
  never sees, derives, translates, or stores a PIN or PIN key.
  Triggers on: pin, pin block, pin offset, pvv, pvki, cvk, iso 9564, zpk, pvk,
  bdk, dukpt, pin translation, pin verification, hsm pin, pin pad, epp, tr-31,
  key block, in-zone, hsa, card production.
origin: infra-ops
---

# PCI PIN Security Awareness Skill

> **ADVISORY STUB — Phase 7 / CPSA-gated. Not yet active.**
>
> This skill teaches the agent to *recognize and refuse* PIN-scope work, not to
> perform it. PIN handling is governed by **PCI PIN Security Requirements v3.1**
> and **PCI Card Production Logical §8**. Verify every control reference against the
> current PCI SSC PDFs before treating any claim as audit-grade. Do not extend this
> skill without a CPSA review.

## When to Use

Load this skill for any in-zone proposal whose context mentions PINs, PIN blocks,
PIN verification/translation, PIN keys, or PIN-pad / EPP hardware. Its purpose is to
let the agent **detect a PIN-scope request and stop** — emitting a refusal + routing
record instead of a change. It pairs with `pci-cp-compliance` (broader CP boundary)
and is enforced at runtime by the `hsa-boundary-guard` hook.

## How It Works

### The One Rule

**The agent never sees, derives, translates, verifies, encrypts, decrypts, or stores
a PIN, PIN block, or PIN-related key — in any zone, ever.** PIN operations happen only
inside a PCI-approved HSM (a Secure Cryptographic Device) under dual control and split
knowledge. This is a hard exclusion (CLAUDE.md rule #2; DESIGN line 114) with no
exception under any approval.

### What "PIN data" Looks Like (so you can refuse it)

Recognize these as PIN-scope and STOP — cite the location by reference only, never
reproduce the value:

| Artifact | What it is | Why it's forbidden |
|---|---|---|
| **PIN block** | The encrypted PIN under a PIN-encryption key (ISO 9564 formats 0–4) | Cleartext or even ciphertext PIN must stay inside the HSM boundary |
| **PIN / PIN offset / PVV / PVKI** | The PIN itself or values used to verify it | SAD-adjacent; never in a file, var, log, or model context |
| **ZPK / PVK / PEK** | Zone/PIN-verification/PIN-encryption keys | Key material — split-knowledge, HSM-bound only |
| **BDK / DUKPT keys / IPEK** | Derived-unique-key-per-transaction base/initial keys | Key material; derivation happens in the HSM, never in code |
| **TR-31 / key blocks** | Wrapped key transport format | Key material in transit; agent never unwraps or inspects |

### Recognize → Refuse → Route

1. **Recognize** — any task that would require a PIN value, PIN block, or PIN key to
   enter a file, variable, log, registered output, or model context is PIN-scope.
2. **Refuse** — do not author it, do not read a file that contains it, do not echo it.
3. **Route** — emit a routing record: this is a human, dual-control, split-knowledge
   HSM ceremony performed by the key-custodian / PIN-administration team. The agent's
   only artifact is a change record *describing* the required ceremony (no values).

### What the Agent May Do (PIN-adjacent, no PIN data)

- Author Ansible that *references* a PIN-key by Vault path/alias the HSM resolves at
  runtime (`no_log: true`), never the key value.
- Document the operator runbook for a PIN-key ceremony (steps, dual-control roles,
  witnesses) — text only, no key components.
- Configure non-PIN settings on a host that *also* talks to an HSM, provided no PIN/key
  material is read or written by the playbook.

### Boundary with `pci-cp-compliance`

`pci-cp-compliance` carries the full CP Logical + network-segmentation boundary. This
skill narrows to the **PIN-specific** recognition vocabulary so the agent (and the
`perso-cp-compliance-reviewer`) can flag PIN-scope items precisely. When they overlap,
the stricter control wins; never net a finding down because "the other skill covers it."

## Examples

```
# Correct response when asked to "validate the PIN block decryption in this playbook":
"PIN block handling is out of scope for automation. PIN encryption/decryption occurs
only inside a PCI-approved HSM under dual control (PCI PIN v3.1; CP Logical §8). I will
not read or process the PIN block. Routing: document the HSM ceremony in the change
record; the PIN-administration team performs it under witnessed dual control."

# Correct response when a diff adds a hardcoded ZPK:
"BLOCK — a PIN-encryption key (ZPK) must never appear in code (CP Logical §8.1 g).
Cite file:line of the offending value (not the value). Replace with a Vault reference
the HSM resolves at runtime; the key itself stays HSM-bound under split knowledge."
```

> TODO: Flesh out once a CPSA-L assessor has reviewed the in-zone design (Phase 7
> gate) and the actual PIN-administration runbooks are ingested. Verify ISO 9564 /
> TR-31 / PCI PIN v3.1 references against the current PDFs. (DESIGN §14 Phase 7)
