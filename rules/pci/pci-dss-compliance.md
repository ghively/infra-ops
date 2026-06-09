---
paths:
  - "**/*.yml"
  - "**/*.yaml"
  - "**/.gitlab-ci.yml"
  - "**/ansible/**"
  - "**/playbooks/**"
  - "**/roles/**"
  - "**/inventories/**"
---

# PCI DSS Compliance Rules

## Scope

These rules apply to all infrastructure changes in PCI scope environments.
For Card Production (CP) and PIN scope, see `rules/pci/pci-cp-compliance.md`.

paths:

- "**/*.yml"
- "**/*.yaml"
- "playbooks/**"
- "roles/**"
- "**/ci/**"

---

## PCI DSS Relevant Requirements

### Req 3: Protect Stored Cardholder Data

- No plaintext PAN/cardholder data in logs
- No storage of CVV/CVC under any circumstances
- Encryption of PAN at rest (if stored)

### Req 4: Encrypt Transmission of Cardholder Data

- TLS 1.2 or higher for all data in transit
- No unencrypted protocols (HTTP, FTP, telnet)
- Secure cipher configurations

### Req 7: Restrict Access to System Components

- Unique authentication for each user
- No shared credentials
- Role-based access control (RBAC)

### Req 8: Identify and Authenticate Access

- Strong password policies (12+ characters, complexity)
- MFA for remote access
- No default passwords

### Req 10: Track and Monitor All Access

- Audit trail for all system components
- Tamper-evident logs
- Log review daily

---

## Infrastructure Rules

### 1. Audit Trail

All changes must be logged to `governance-ledger`:

- Who made the change (user ID)
- What was changed (file, MR, commit)
- When (timestamp)
- Why (ticket/MR reference)

### 2. Change Management

- No direct production changes
- All changes via GitLab MR with approval
- Emergency change procedure documented

### 3. Segregation of Duties (SoD)

- Developers cannot approve their own MRs to production
- Separate roles for:
  - Change author (developer)
  - Change reviewer (senior engineer)
  - Change approver (production manager)

### 4. Log Retention

- Audit logs retained for 1 year minimum
- 3 months immediately available for review
- Tamper-evident storage (SIEM forwarding in Phase 6)

### 5. Security Testing

- Quarterly vulnerability scans
- Annual penetration testing
- Code review for security changes

### 6. Configuration Management

- All configuration in version control
- No out-of-band changes
- Configuration drift detection

### 7. Authentication

- SSH keys with passphrases
- No password authentication for SSH
- Vault-encrypted secrets in Ansible

---

## Enforcement

The `governance-ledger` hook records all tool use for PCI Req 10 compliance.

The `pan-egress-filter` hook prevents PAN exfiltration.

The `pci-compliance-reviewer` agent checks MRs for PCI violations.

---

## See Also

- `rules/pci/pci-cp-compliance.md` - Card Production and PIN requirements
- `rules/secrets/secrets-management.md` - Secrets handling
- `SPEC.md §2` - Hard trust boundary rules
