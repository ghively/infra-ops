---
name: pci-dss-compliance
description: >
  PCI DSS v4.0.1 controls for corporate IT: classify→access→audit, scoping and
  segmentation, change control via GitLab MR, least-privilege service accounts,
  CHD never in model context, TLS everywhere, SoD (author≠approver≠prod-deployer),
  log retention, no PAN in logs. Triggers on: pci dss, cardholder data, pan, chd,
  pci requirement, segmentation, audit trail, separation of duties, compliance,
  service account, vault pci, tls certificate.
origin: infra-ops
---

# PCI DSS Compliance Skill (Corporate Zone)

Modeled on the ECC `healthcare-phi-compliance` tri-layer pattern: **classify** (what
is sensitive), **access** (who can touch it), **audit** (who did touch it, and when).

This skill covers the **corporate zone (PCI DSS v4.0.1)**. For the High Security Area
(card production floor), see the `pci-cp-compliance` skill.

## When to Use

Load this skill when authoring or reviewing any change that touches corporate IT systems
under PCI DSS scope: GitLab pipelines, Ansible playbooks, Octopus configuration,
CI runner hardening, or any code that could interact with CHD-adjacent systems.

## How It Works

### Data Classification

| Class | Examples | Agent posture |
|-------|---------|---------------|
| **CHD / SAD** | PAN, full track data, CVV/CVC, cardholder name + expiry as combined record | **Never enters agent context, prompts, or any model call** — local or remote |
| **DSS-sensitive** | System configs, audit logs, Vault secrets, service-account creds | Local lane for CHD-adjacent; cloud tier only for non-sensitive |
| **Public/Internal** | IaC code, playbook logic, non-secret variables | Normal cloud tier |

"Sending CHD into a prompt to a third-party/cloud LLM exports that data to a third
party … expand third-party risk." (VGS: AI and PCI Compliance 2026)
The safest posture: **prevent AI systems from touching raw card data at all**.
(pci-dss-devops.md §4; DESIGN.md §4)

### Access Control

**Least privilege, deny-by-default, unique IDs per account:**

- Agent runs as a uniquely-identified, non-interactive service account scoped to the
  minimum needed: write to feature branch, open MR, trigger non-prod deploy.
- Author ≠ MR approver ≠ prod deployer — three distinct gates. The agent occupies the
  **author/proposer** role only.
- Protected environments (GitLab) or Octopus manual-intervention step enforce SoD.
- Service accounts: `no shared/generic accounts`; rotate credentials on a TRA-defined
  cadence (PCI DSS 8.6.3); interactive login prevented (8.6.1).
- MFA required for any human access path to CDE-adjacent systems (8.4.2).

(pci-dss-devops.md §3; DESIGN.md §2)

### Audit Trail (Three Streams → SIEM)

Every production change must produce an auditable chain:

1. **Signed commit** on feature branch (provenance).
2. **MR** with required reviewers + green pipeline (lint / Molecule / `--check` diff).
3. Merge to **protected branch** with protected CI/CD variables gating prod secrets.
4. Deploy job targets a **protected environment** → required approvals recorded (who/when).
5. **ARA run** tagged with `$CI_COMMIT_SHA` + `$CI_PIPELINE_ID` (what/when detail).
6. **Octopus audit log** (who deployed to which env, with which approvals).
7. **Agent governance ledger** (every proposal/action, append-only, off-box).

Forward all three streams to a tamper-evident SIEM with FIM on log files (PCI DSS
10.3.4). Common NTP source across all systems (10.6). Retain 12 months, 3 months hot
(10.5.1). (pci-dss-devops.md §5; DESIGN.md §13)

### Change Control (Req 6)

Versioned, peer-reviewed IaC **is** the change-control evidence:

- GitLab MR + CODEOWNERS + protected branch = peer review + independent checkpoint.
- `environments/prod/**` CODEOWNERS-gated to `@ops-team`.
- MR creator cannot approve their own MR (GitLab default).
- The pipeline is the approved change path — the agent must never be a self-approving
  deployer or circumvent the MR flow.
- Maintain an SBOM/dependency inventory for all bespoke automation (Ansible roles,
  scripts, Octopus templates) + third-party components — satisfies PCI DSS 6.3.2.
  Make it actionable: generate with `syft` for EE images and a collection/role
  inventory from `requirements.lock.yml`; attach it per release (see the
  `supply-chain-and-sbom` skill). Boundary note: 6.4.3 / 11.6.1 (client-side
  payment-page script integrity / tamper detection) are out of scope for this skill.

(pci-dss-devops.md §2; DESIGN.md §7)

### No PAN in Logs or Agent Context

```yaml
# Correct: no_log on any task that might surface CHD
- name: Apply configuration with credentials
  ansible.builtin.template:
    src: db.conf.j2
    dest: /etc/myapp/db.conf
  no_log: true

# PreToolUse hook enforces this at runtime:
# pan-egress-filter blocks any tool input containing a Luhn-valid PAN
# (DESIGN.md §3 / hooks/hooks.json)
```

Logs (ARA, GitLab job logs, Octopus task logs) must be PAN-free. Add masking on any
captured stdout/stderr that could contain CHD. The `pan-egress-filter` hook scans every
tool input for PAN (Luhn algorithm) before any cloud call. (pci-dss-devops.md §4)

### TLS Everywhere (Req 4)

- Agent↔GitLab, agent↔Octopus, runner↔Ansible target, runner↔Vault: TLS 1.2+ only.
- WinRM: always TLS listener (`ansible_port: 5986`); Kerberos over WinRM-HTTPS.
- Octopus: Tentacle communication is mTLS with X.509 (no SSL offloading).
- Maintain a cert/key inventory (4.2.1.1): track expiry, revocation, rotation dates.
- `ansible.builtin.uri` tasks: always `validate_certs: true`.

(pci-dss-devops.md §4; DESIGN.md §7)

### Scoping and Segmentation (Req 1)

- Corporate CI/CD (GitLab, Octopus, Ansible control node, agent) lives in a **separate
  management network** with deny-by-default firewalling to the CDE.
- A VLAN alone is not segmentation — enforcement must be by purpose-built controls
  (firewall, ACL). A separate physical or software-defined network is required.
- Test segmentation controls ≥ annually (or every 6 months for service providers) per
  Req 11.4.5.
- Confirm annual scope re-confirmation (12.5.2).
- Self-hosted GitLab keeps source, CI, and audit data on-prem — avoids third-party
  scope expansion (Req 12.8).

(pci-dss-devops.md §1; DESIGN.md §7)

### v4.0.1 Future-Dated Requirements (All in Force as of 31 Mar 2025)

Key items affecting this pipeline:

| Req | Impact |
|-----|--------|
| 6.3.2 | Maintain SBOM for all custom automation + 3rd-party components |
| 6.5.3/6.5.4 | Pre-prod separated from prod; roles separated (dev ≠ prod approver) |
| 8.6.1/8.6.2/8.6.3 | Non-interactive service accounts; no hard-coded passwords; rotate on TRA cadence |
| 8.4.2 | MFA for ALL access into the CDE |
| 10.4.1.1 | Automated daily log review (forward to SIEM with analytics) |
| 12.3.1/12.3.2 | TRAs for every periodic control and for any customized approach |
| 12.10.7 | IR plan for PAN found in unexpected locations (e.g., in a log the agent surfaces) |

(pci-dss-devops.md §7)

### Trust Boundary

- **CHD/SAD must never enter the agent's context, prompts, or any model call.**
- Agent = author/proposer only; structurally incapable of approving its own change or
  deploying to prod.
- All secrets via Vault at runtime; no hardcoded credentials anywhere.
- `pan-egress-filter` hook enforces this at the tool boundary. (SPEC.md §2)

## Examples

```yaml
# Compliant Ansible task pattern
- name: Apply hardened config (no secret in log, TLS validated)
  ansible.builtin.uri:
    url: "https://api.internal.example.com/config"
    method: POST
    body_format: json
    body: "{{ lookup('community.hashi_vault.vault_kv2_get', 'ansible/prod/api_config') }}"
    validate_certs: true
  no_log: true
```

> TODO: Expand with org-specific scope boundary document once the network topology
> diagram and DSS scoping assessment are ingested (DESIGN.md §17 Q1).
> TODO: Add TRA cadence table for service-account rotation (8.6.3) once the risk
> management policy is ingested.
> TODO: Confirm whether this organization qualifies as a "service provider" or
> "merchant" (affects 11.4.5 segmentation-test cadence).

## Deep Reference — PCI DSS v4.0.1

### Requirement 3 — Protect Stored Account Data
- **3.3.1:** Do not store SAD after authorization (CVV, full track, PIN block)
- **3.4.1:** PAN must be unreadable anywhere it is stored (hashing, truncation, or strong encryption)
- In Ansible context: any task writing to a database or file that could contain PAN must use an encrypted destination; never log PAN in registered vars

### Requirement 4 — Protect Cardholder Data in Transit
- **4.2.1:** Use strong cryptography (TLS 1.2+) for transmitting PAN over open networks
- `validate_certs: false` in Ansible tasks targeting PCI-scope systems is always a HIGH finding
- Weak cipher patterns to flag: RC4, DES, 3DES, MD5, SHA-1 (for signing)

### Requirement 6 — Develop and Maintain Secure Systems
- **6.3.2:** Maintain an inventory of all bespoke and custom software — this is what `supply-chain-and-sbom` covers
- **6.4.1:** All public-facing web applications must be protected against OWASP Top 10
- **6.5.x:** Change control must include: documented impact analysis, sign-off by authorized parties, back-out plan

### Requirement 7 — Restrict Access to System Components
- **7.2.x:** Access is granted on a need-to-know basis; all access is denied by default
- In Ansible: `become: true` without explicit `become_user` grants root — always HIGH finding
- Service accounts: one service account per service; no shared accounts

### Requirement 8 — Identify Users and Authenticate
- **8.3.x:** MFA required for all access to the CDE
- **8.6.x:** System/application accounts and credentials managed via policy — no hardcoded creds

### Requirement 10 — Log and Monitor All Access
- **10.2.x:** Audit logs must capture: individual user access to CHD, all actions by root/admin, use of identification mechanisms, invalid access attempts, use of/changes to audit logging, system-level object creation/deletion/modification
- **10.3.x:** Protect audit logs from destruction and unauthorized modification (append-only, SIEM forwarding)
- In Ansible: any task that disables syslog, auditd, or modifies log rotation config is a CRITICAL finding

### Requirement 12 — Support Information Security Policies
- **12.10.x:** Incident response plan must be maintained and tested annually
- **12.10.7:** Incident response procedures for detection of unauthorized storage of SAD

### NIST 800-53 Mapping (for DSS control crosswalk)
| PCI DSS Req | NIST 800-53 Control |
|-------------|---------------------|
| 3.3 (no SAD) | SI-12 (Information Management) |
| 4.2 (TLS) | SC-8 (Transmission Confidentiality) |
| 7.2 (least priv) | AC-6 (Least Privilege) |
| 8.3 (MFA) | IA-2 (Identification and Authentication) |
| 10.2 (audit logging) | AU-2, AU-3, AU-12 |
| 6.5 (change control) | CM-3, CM-4 |
