---
name: pci-cp-compliance
description: >
  PCI Card Production Logical + PCI PIN constraints for in-zone work: air-gap,
  read-only-into-HSA, dual-control test-to-live promotion, never touch PAN, keys,
  PINs, or HSM. Advisory-only stub for Phase 7 / CPSA-gated work.
  Triggers on: pci cp, card production, hsa, high security area, cpsa, personalization,
  dual control, split knowledge, hsm, key ceremony, pin, data preparation network,
  perso, in-zone.
origin: infra-ops
---

# PCI Card Production (CP) Compliance Skill

> **ADVISORY STUB — Phase 7 / CPSA-gated. Not yet active.**
>
> This skill encodes hard constraints for work that touches the High Security Area
> (HSA). The in-zone deployment is **Phase 7** of the build plan (DESIGN.md §15) and
> requires **CPSA-L sign-off before go-live**. All content here is advisory, derived
> from the PCI CP Logical Security Requirements v2.0 (normative) and pci-card-production.md.
> Verify every section number against the current **v3.0 (June 2022)** PDF from the PCI
> SSC Document Library before treating any claim as audit-grade.
>
> Do not implement in-zone automation until Phase 7 is approved. Do not extend this
> skill without a CPSA review.

## When to Use

Load this skill when reviewing any proposal that might touch the HSA, data-preparation
network, personalization network, key management, PIN handling, or HSM configuration.
Use it to **reject** out-of-scope requests before they become changes. Also load to
understand the boundary the corporate-zone agent must never cross.

## How It Works

### The Two-Zone Architecture

This organization manufactures cards in-house. Two separate standards apply:

| Zone | Standard | Assessor |
|------|----------|----------|
| Corporate IT (GitLab, Octopus, Ansible, agent) | PCI DSS v4.0.1 | QSA / ISA |
| High Security Area (data-prep + personalization networks, HSMs) | PCI Card Production Logical + Physical v3.0 + PCI PIN v3.1 | CPSA-L / CPSA-P on-site |

PCI CP and PCI DSS are **separate standards for different entity types**. Assessment
is brand-driven (Visa/Mastercard/Amex/Discover/JCB), on-site, by CPSA assessors, with
signed AOC+ROC. Not self-attestation. (pci-card-production.md §1)

### The Hard Exclusions — Non-Negotiable

The agent **must never** (DESIGN.md §2; pci-card-production.md §§4–8):

- Touch **cleartext PAN or cardholder data** (CP Logical §4.3, §5.6 h/i).
- Access, generate, load, back up, destroy, or configure **cryptographic keys, key
  components, or HSMs** (CP Logical §8, §8.14, §8.1 d/g).
- Handle **PINs or PIN-key operations** (PCI PIN v3.1; CP Logical §8).
- **Autonomously deploy to live personalization machines.** Test→live requires CISO
  approval + dual-control, witnessed human sign-off (CP Logical §6.2).
- Act as a **remote administrator into perso/DP networks** — §5.6 requires pre-screened
  human admins with MFA, vendor-approved hardware, and prohibits any path to cleartext
  CHD/keys.
- Send any production data over the internet or to a cloud LLM. The perso/DP networks
  must be "independent of Internet-connected networks" and **VLAN is explicitly not
  sufficient separation** (CP Logical §5.2 e). All in-zone reasoning is local-model only.

### Network Segmentation (CP Logical §5.2)

The corporate-zone agent is, by design, outside the perso/DP networks:

- `(e)` Perso and DP systems on **dedicated networks independent of back-office and
  Internet-connected networks. A VLAN is not considered a separate network.**
- `(g)` Access from within the HSA to anything other than perso/cloud networks must be
  **read-only**.
- `(i)` Write permission to any external system restricted to **VPA-pre-approved,
  no-CHD functions** only.

The agent has no inventory entries, no credentials, and no network path into the
perso/DP zone. (pci-card-production.md §3.1; DESIGN.md §1)

### Change Control in the HSA (CP Logical §6.2)

Even for the in-zone advisory agent (Phase 7):
- All changes require documented CISO approval before deployment.
- Test→live: "both development and production staff must sign off … **witnessed under
  dual control**." This is a human gate that automation cannot replace.
- Emergency change: documented emergency procedure with retrospective approval.
- Monthly config validation against authorized baseline (§6.3).
- Security patches within 30 days (critical/Internet-facing: 7 business days) (§6.3).

### Key Management Exclusion (CP Logical §8, §8.14)

All key lifecycle activities (generation, loading, distribution, backup, destruction):
- Split knowledge + dual control — **no single person** (human or agent) can have
  access to all key components (§8.1 b/c).
- Component PCs: air-gapped, powered down when not in use, managed under dual control
  (§8.1 d) — **no network connection ever**.
- All symmetric and private keys exist only inside an HSM (SCD) or as split components
  (§8.2/§8.3).
- HSMs must be PCI-approved or FIPS 140-2 Level 3+ (§8.14).
- **No hard-coded keys in software** (§8.1 g).

The agent treats HSMs as opaque appliances it never configures. Key ceremonies are
out-of-band, human-only, dual-control, split-knowledge operations.
(pci-card-production.md §4; DESIGN.md §8)

### Remote Access into the HSA (CP Logical §5.6)

In Phase 7, even the in-zone agent operates under strict §5.6 constraints:
- Only from pre-authorized source systems using vendor-approved hardware.
- **No personally owned hardware** (§5.6 d).
- **MFA** required (§5.6.2 g), 5-minute idle timeout, lockout after 3 failures.
- **Prohibited to any system where cleartext CHD is being processed** (§5.6 h/i).
- All remote access logged; logs reviewed **weekly** (§5.6 k).
- Non-vendor remote admins must meet HSA-staff pre-screening standards (§5.6 k).

A non-human agent that cannot be pre-screened, badged, and held to HSA-staff standards
cannot hold remote-admin into perso. (pci-card-production.md §3.2)

### Separation of Duties in the HSA (CP Logical §6.6.3)

- Source code for personalization-network applications is **restricted to authorized
  personnel only** (§6.6.3 a).
- **Separation of duties between development and production staff** (§6.6.3 d) — same
  identity cannot author and deploy to live perso.
- In-zone GitLab (Phase 7) is separate from the corporate GitLab.

### Phase 7 — What In-Zone Work Looks Like

The in-zone agent is **authoring/advisory only**:
- Runs on an air-gapped, local-only LLM (no internet egress — mandatory).
- Uses an in-zone GitLab instance with restricted access (perso source repo ACL).
- Opens MRs; never merges or deploys autonomously.
- Prepares change artifacts and records for human, dual-control, §6.2 promotion.
- Every action recorded in an append-only governance ledger forwarded off-box to
  an internal SIEM (never to a cloud log store from the HSA).

**This phase does not begin until:**
1. Phases 0–6 are stable.
2. Hardware (in-HSA air-gapped inference box) is procured and hardened.
3. A **CPSA-L assessor has reviewed the design** and confirmed acceptability.

(DESIGN.md §15 Phase 7)

### Trust Boundary Summary

```
AGENT MUST NEVER:
  - touch PAN / CHD / SAD
  - touch keys, key components, PINs, HSM configuration
  - autonomously deploy to live perso/DP systems
  - be a remote admin into the HSA as a self-directed actor
  - use a cloud/internet-egressing LLM for any in-zone reasoning
  - be the approving authority for test→live promotion

AGENT MAY (corporate zone, DSS scope only):
  - author IaC for corporate servers
  - author dev-side perso software (respecting §6.6.3 SoD)
  - prepare change artifacts for human promotion
  - read non-CHD systems for inventory/discovery
```

## Examples

```
# Correct response when asked to configure an HSM:
"HSM configuration is out of scope for automation. All HSM key-management
activities require dual-control, split-knowledge human ceremonies with no
network-connected systems present (CP Logical §8.14, §8.1 d). This request
should be routed to the key-custodian team. Proposal: document the required
ceremony in the change record."

# Correct response when asked to deploy to the perso network:
"Deployment to the personalization network requires CISO approval and a
dual-control, witnessed test→live promotion by both development and
production staff (CP Logical §6.2). Opening a change record and change
artifact for human review is the correct action. No autonomous deploy."
```

> TODO: This entire skill is a STUB. Flesh out once:
> - The CPSA-L assessor has reviewed the in-zone design (Phase 7 gate).
> - The in-HSA hardware (air-gapped inference box) is procured.
> - The in-zone GitLab and runner topology are confirmed.
> - The actual perso software stack and deployment process are ingested from
>   vendor documentation and internal runbooks.
> - Section numbers are verified against the current PCI CP Logical v3.0 PDF.
> (DESIGN.md §15 Phase 7; pci-card-production.md §0)
