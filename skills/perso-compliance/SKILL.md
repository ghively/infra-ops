---
name: perso-compliance
description: Use when reviewing infrastructure changes in the card personalization zone for PCI Card Production Logical + PIN compliance. Covers CP section controls for personalization infrastructure — not personalization operations themselves (key ceremonies, PIN blocks, HSM config are out-of-scope for any agent).
---

# Personalization Compliance Skill

## When to Use

Load this skill for:
- Reviewing HSA infrastructure changes against PCI Card Production controls
- Auditing HSA zone configuration for compliance evidence
- Proposing compliance-annotated change records for HSA MRs

## How It Works

This skill provides a severity-tiered checklist of PCI Card Production Logical + PIN
controls that apply to HSA infrastructure changes. Load it alongside `perso-compliance`
when reviewing HSA MRs. Each finding must cite a CP section, a file:line, and a failure
mode before being included in the verdict.

## Scope Boundary (critical)

This skill covers **infrastructure** in the personalization zone — compute, storage,
networking, OS config, service deployment. It does NOT cover:
- Key ceremonies or key loading (dual-control human operation, no agent involvement)
- PIN block generation or verification (out of scope for any agent)
- HSM configuration (out of scope — no agent may touch HSM config)
- Actual cardholder data processing (operations function, not infrastructure)

If a review item touches any of those areas, flag it as out-of-scope and route to
a human CPSA reviewer.

## Key PCI Card Production Controls for Infrastructure

### CP Logical §3 — Access Control
- All access to personalization infrastructure requires individual authentication
  (no shared accounts, no shared SSH keys)
- Service accounts must have the minimum privilege necessary
- Every privileged action must emit to the audit trail
- Ansible `become: true` must specify `become_user` (never become root without explicit scope)

```yaml
# CORRECT
- name: Configure perso-engine
  ansible.builtin.template:
    src: engine.conf.j2
    dest: /etc/perso-engine/engine.conf
  become: true
  become_user: perso-engine  # scoped service account

# WRONG
- name: Configure perso-engine
  ansible.builtin.template:
    src: engine.conf.j2
    dest: /etc/perso-engine/engine.conf
  become: true  # becomes root — flag as HIGH
```

### CP Logical §4 — Audit Logging
- All infrastructure changes must emit to the tamper-evident audit trail
- Log retention: per CP §6.4 (confirm with CPSA for specific retention period)
- Logs must be forwarded to the SIEM before any log rotation can occur
- Tasks that disable, redirect, or clear logs are CRITICAL findings

```yaml
# Flag any task modifying syslog/auditd config — must be reviewed:
- name: Configure auditd  # REQUIRES: verify forwarding to SIEM is preserved
  ansible.builtin.template:
    src: auditd.conf.j2
    dest: /etc/audit/auditd.conf
```

### CP Logical §5 — Integrity Monitoring
- System files in the personalization zone must be covered by file integrity monitoring
- Playbooks that modify monitored paths must update the FIM baseline
- Never disable FIM without an approved change window

### CP Logical §6 — Change Management
- All changes must have an approved change record before deployment
- The per-change YAML record (produced by perso-scribe) must be attached to the MR
- Dual control: MR author cannot be the sole approver

### No SAD / No PAN in Infrastructure
- Infrastructure configs must never contain PAN, SAD, or PIN values
- Connection strings to personalization systems must use service account references
  (Vault lookups), never embedded credentials
- Log configs must mask or exclude cardholder fields

## Severity Tiers

- **CRITICAL** — block merge immediately: PAN/SAD/PIN in any file, HSM config referenced,
  FIM disabled without change window, audit logging removed/redirected
- **HIGH** — block unless explicitly accepted: `become: true` without `become_user`,
  hardcoded credentials, no change record reference in MR
- **MEDIUM** — should fix: missing `no_log: true` on secret-adjacent task,
  unscoped service account privilege, missing FIM baseline update
- **LOW** — note: style divergence, missing task name, TODO without ticket

## Verdict Format

```
VERDICT: PASS | WARN | BLOCK

## Perso Compliance Review: <MR>
| Severity | CP Control | File:Line | Finding |
|----------|------------|-----------|---------|
...
```
