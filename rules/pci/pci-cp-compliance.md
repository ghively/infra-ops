# PCI Card Production (CP) & PIN Compliance Rules

## Scope

This rule set applies to infra-ops operations within the High Security Area (HSA) where PCI Card Production (CP) and PIN block data may be present.

## ⚠️ CPSA GATED

**CRITICAL:** Before implementing any CP/PIN-related systems, procedures, or playbooks, a Certified Payment Card Industry Security Assessor (CPSA) MUST review and approve the implementation.

## Card Production (CP) Logical Requirements

### CP-1: Network Segmentation

Card Production systems MUST be isolated from the corporate network.

**Requirements:**
- Air-gap or strict one-way DIEM (Data Isolation Enforcement Module)
- No direct internet access from CP zone
- No routing from CP zone to other network segments except via controlled interfaces

**Implementation Check:**
- Playbooks targeting CP systems MUST use dedicated inventory
- Inventory MUST be tagged with `zone: hsa` or `zone: cp`
- No cross-zone SSH access in playbooks

### CP-2: HSM Interaction

HSM (Hardware Security Module) operations MUST be operator-only, never automated.

**Requirements:**
- NO automated HSM key handling
- NO automated PIN block encryption/decryption
- Agent provides advisory guidance ONLY
- Operators manually execute HSM commands

**Implementation Check:**
- No `ansible` module calls to HSM APIs
- No `expect` or `pexpect` scripts for HSM interaction
- HSM procedures documented as operator runbooks, not automated tasks

### CP-3: Key Lifecycle

Cryptographic keys MUST follow secure lifecycle management.

**Requirements:**
- Key generation: Performed on HSM or by certified CSP
- Key storage: HSM or validated FIPS 140-2 Level 3+ device
- Key rotation: According to PCI PIN Security Requirements
- Key destruction: Secure wipe with verification

**Implementation Check:**
- Playbooks NEVER include plaintext keys
- Keys referenced as HSM slot IDs or key labels only
- Key rotation procedures documented with operator verification steps

### CP-4: Audit Trail

All CP system access MUST be logged with tamper-evident storage.

**Requirements:**
- 5-year log retention (PCI requirement)
- WORM (Write Once, Read Many) storage for audit logs
- Logs include: user, timestamp, action, affected resources, result
- Log integrity verification (hash chaining, digital signatures)

**Implementation Check:**
- All Ansible playbooks for CP zone include `ARA` integration
- ARA records tagged with commit SHA and pipeline ID
- Audit logs exported quarterly to WORM storage

## PIN Security Requirements (v3.0)

### PIN-1: PIN Block Processing

PIN block encryption/decryption MUST occur within HSA zone only.

**Requirements:**
- NO PIN block processing outside HSA zone
- NO PIN block storage in clear text
- PIN blocks encrypted with zone-encrypting key (ZEK)
- PIN blocks transmitted via secure channels only

**Implementation Check:**
- Playbooks for PIN processing tagged `sensitivity: pin-block`
- PIN block handling procedures include operator verification
- Agent routes PIN-adjacent work to local model only (`/context hsa-local`)

### PIN-2: PIN Entry Device Security

PIN entry devices (PEDs) MUST meet PCI PTS requirements.

**Requirements:**
- PEDs MUST be PCI PTS approved
- Secure authentication between PED and acquirer
- PIN encryption at point of entry
- NO tampering with PED hardware or firmware

**Implementation Check:**
- PED configuration managed via approved vendor tools
- Agent provides documentation, not direct PED interaction

### PIN-3: Key Management for PINs

PIN encryption keys MUST follow PCI PIN Security Requirements.

**Requirements:**
- ZEK (Zone-Encrypting Key) management per PIN Security v3.0
- Key distribution via secure channels
- Dual control for key activation/loading
- Key separation for different PIN processing functions

**Implementation Check:**
- Key management procedures documented with dual-control steps
- Agent validates dual-control requirements before key operations

### PIN-4: PIN Transmission

PIN blocks MUST be transmitted securely.

**Requirements:**
- Encrypted transmission using approved algorithms
- NO PIN block transmission over public networks
- Secure channel establishment before PIN transmission
- PIN block format validation

**Implementation Check:**
- Transmission playbooks use approved encryption modules
- Agent validates encryption parameters before transmission commands

## Infra Agent Behavior Rules

### AGENT-1: Authoring/Advisory ONLY

The infra agent NEVER directly operates on CP/PIN systems.

**Permitted:**
- Authoring Ansible playbooks for operator use
- Generating documentation (runbooks, HOWTOs)
- Advisory guidance based on compliance requirements
- Validation of playbook syntax and structure

**Prohibited:**
- Direct `ansible-playbook` execution against CP systems
- Automated HSM interaction
- Automated key handling
- Direct PIN block processing

### AGENT-2: Local-Only Routing

CHD-adjacent and PIN-adjacent prompts MUST route to local model.

**Routing Rules:**
- CHD-adjacent → `/context hsa-local` → Ollama (local)
- PIN-adjacent → `/context hsa-local` → Ollama (local)
- CP architecture questions → `/context research` (acceptable for corporate zone)

**Implementation:**
- `sensitivity-router` hook detects CHD/PIN keywords
- Routes to local lane with appropriate context mode
- No external API calls for CHD/PIN processing

### AGENT-3: Dual-Control Enforcement

All critical operations require two-person approval.

**Requires Dual Control:**
- Instinct promotion in HSA zone
- Role promotion affecting CP systems
- Key operation procedures
- HSM configuration changes

**Implementation:**
- `dual-control-promotion-gate` hook validates requirements
- Two distinct approvers required
- Documentation citation required for compliance items
- Approval signature and timestamp logged

### AGENT-4: Documentation Citation

Compliance answers MUST cite specific PCI requirements.

**Required Citations:**
- PCI DSS requirement numbers (e.g., "PCI DSS Req 7.2")
- PCI PIN Security Requirements section numbers
- Relevant PA-DSS requirements if applicable
- Council-approved compensating controls (if applicable)

**Format:**
```
According to PCI DSS Req 7.2: "Two-person control...
Reference: https://www.pcisecuritystandards.org/documents/PCI-DSS-v4-0.pdf
```

## Playbook Requirements

### PLAYBOOK-1: Inventory Tagging

CP system inventories MUST include zone tags.

**Required Tags:**
- `zone: hsa` or `zone: cp`
- `sensitivity: pin-block` (if applicable)
- `classification: card-production` or `classification: pin-processing`

**Example:**
```yaml
[hsa_card_production]
card-prod-01.example.com zone=hsa classification=card-production
pin-process-01.example.com zone=hsa classification=pin-processing sensitivity=pin-block
```

### PLAYBOOK-2: Idempotency

CP system playbooks MUST be idempotent.

**Requirements:**
- No state-dependent failures on re-run
- Check mode support (`--check`)
- Diff reporting for changes
- Rollback capability documented

### PLAYBOOK-3: FQCN Compliance

All modules MUST use Fully Qualified Collection Name.

**Format:**
```yaml
tasks:
  - name: Configure CP system
    ansible.builtin.file:
      path: /etc/cp/config
      state: directory
```

### PLAYBOOK-4: no_log for Sensitive Parameters

All sensitive parameters MUST use `no_log: true`.

**Apply To:**
- Passwords
- Keys (references, not values)
- PIN block configurations
- HSM initialization values

**Example:**
```yaml
- name: Configure HSM client
  hsm_client_config:
    client_cert: "{{ hsm_client_cert }}"
    no_log: true
```

## Verification Checklist

Before approving any CP/PIN-related playbook:

- [ ] Playbook targets HSA zone inventory only
- [ ] No direct HSM API calls (operator-only procedures)
- [ ] Sensitive parameters use `no_log: true`
- [ ] Dual-control requirements documented where applicable
- [ ] All citations reference specific PCI requirements
- [ ] Agent provides advisory guidance, not automation
- [ ] CHD/PIN-adjacent work routes to local model
- [ ] Audit trail integration (ARA) configured
- [ ] Rollback procedure documented

## References

- PCI DSS v4.0
- PCI PIN Security Requirements v3.0
- PCI PTS (PIN Transaction Security) Requirements
- PA-DSS (Payment Application Data Security Standard)
- PCI SSC Software Security Framework
- NIST SP 800-53 (Security and Privacy Controls)

## Status

**Current:** Rules defined
**Implementation:** Requires CPSA approval
**Phase:** 7 - CPSA GATED

---

⚠️ **REMINDER:** Do not implement CP/PIN systems without CPSA review and approval.
