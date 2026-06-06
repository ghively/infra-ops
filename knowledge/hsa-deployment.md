# Infra-Ops HSA Deployment Guide

## Overview

This document describes the air-gapped deployment architecture for the High Security Area (HSA) where PCI Card Production operations occur. This zone handles Card Production Logical (CP) data and requires CPSA-gated access.

## ⚠️ CRITICAL: CPSA Review Required

**STOP** — Before implementing any HSA deployment, the following MUST be reviewed and approved by a Certified Payment Card Industry Security Assessor (CPSA):

- Air-gap isolation and network segmentation
- HSM interaction and key handling procedures
- Local-only model configuration (Ollama)
- Dual-control promotion gate implementation
- PIN block handling procedures

## Architecture

### Physical Separation

```
┌─────────────────────────────────────────────────────────────────┐
│                      Corporate Zone (DSS)                          │
│                      (Internet-connected)                          │
│                                                                   │
│  Authoring workstation  →  GitLab (Corporate)  →  Review         │
│                                                                   │
└─────────────────────────────────────────────────────────────────┘
                              ↑
                              │ Air-gap transfer
                              │ (sneakernet, secure USB)
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│            High Security Area (PCI Card Production + PIN)          │
│                     (Air-gapped, No Internet)                       │
│                                                                   │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐     │
│  │ HSA Deploy    │    │ Local Only   │    │ HSM          │     │
│  │ Runner        │    │ Runner        │    │ (Thales/      │     │
│  │ (Air-gapped)  │    │ (Ollama)      │    │ SafeNet)     │     │
│  │               │    │               │    │              │     │
│  │ Tags:         │    │ Tags:         │    │              │     │
│  │ - hsa         │    │ - local       │    │              │     │
│  │ - deploy      │    │ - ai          │    │              │     │
│  │ - ansible     │    │               │    │              │     │
│  └──────────────┘    └──────────────┘    └──────────────┘     │
│                                                                   │
└─────────────────────────────────────────────────────────────────┘
```

### Trust Levels

| Zone | Trust Level | Network Access | Personnel Access |
|------|-------------|----------------|------------------|
| Corporate | Medium (DSS) | Internet + Corp Network | Ops team |
| HSA | High (CP/PIN) | Air-gapped | CPSA-gated ops team only |

## Deployment Workflow

### Phase 1: Authoring (Corporate Zone)

1. Playbooks authored in corporate zone
2. Reviewed using `/context review` mode
3. Validated with quality hooks (yamllint, ansible-syntax)
4. Approved via GitLab MR with dual control

### Phase 2: Air-Gap Transfer

**Procedure:**

1. Build deployment artifact in corporate zone
2. Verify artifact hash (SHA-256)
3. Transfer via authorized media (encrypted USB, secure file transfer)
4. Verify hash in HSA zone before deployment
5. Destroy transfer media after verification

**Media Requirements:**

- FIPS 140-2 Level 2 certified USB drives
- Full-disk encryption (AES-256)
- Chain of custody documentation
- Single-use only (destroy after transfer)

### Phase 3: In-Zone Deployment (HSA)

1. Load artifact onto HSA Deploy Runner
2. Run `ansible-playbook` with `--check` (dry-run) first
3. Review diff for unexpected changes
4. Execute deployment with dual-control approval
5. Log all actions to audit trail

## Local-Only Model (Ollama)

### Purpose

CHD-adjacent prompts and work must be processed by a local model to prevent data exfiltration. The Ollama instance runs entirely within the HSA zone with no external connectivity.

### Configuration

```bash
# Install Ollama (air-gapped installation)
curl -fsSL https://ollama.com/install.sh | ollama install

# Pull model (from local registry, not internet)
ollama pull qwen2.5-coder:32b

# Configure environment
export OLLAMA_BASE_URL=http://localhost:11434
export OLLAMA_HOST=127.0.0.1:11434
```

### Model Selection

**Recommended:** Qwen2.5-Coder-32B or Qwen3-Coder-30B-A3B

**Why:**

- Strong coding capabilities for Ansible playbook review
- Runs efficiently on available hardware
- No external dependencies after initial pull

### Usage

```bash
# Route CHD-adjacent work to local model
/context hsa-local

# Verify local model is in use
ollama list
```

## Dual-Control Promotion Gate

### Purpose

Prevent unauthorized instinct or role promotion within the HSA zone. All promotions require two-person approval and documentation citation.

### Implementation

See: `scripts/hooks/dual-control-promotion-gate.js`

### Approval Workflow

1. **First Approval:** Senior HSA operator
2. **Second Approval:** CPSA assessor or different senior operator
3. **Documentation Citation:** Reference to compliance requirement (e.g., PCI DSS Req 7.2)
4. **Verification:** Gate hook validates all requirements before allowing promotion

### Example

```bash
# Attempt instinct promotion
/instinct-promote --id instinct-003 --zone hsa

# Gate requires:
# 1. First approver: senior-op-1 (signature + timestamp)
# 2. Second approver: cpsa-assessor (signature + timestamp)
# 3. Citation: "PCI DSS Req 7.2 - Two-person control for critical systems"
# 4. Zone verification: instinct.zone == 'hsa'
```

## HSM Interaction

### Rules (Authoring/Advisory ONLY)

**CRITICAL:** The infra agent NEVER directly interacts with HSMs. All HSM work is:

1. Playbook authoring in corporate zone (no live HSM access)
2. Documentation generation (HOWTO, runbooks)
3. Advisory guidance only (commands for operators to execute manually)
4. No automated key handling

### HSM Configuration (Operators Only)

**Operators manually configure:**

- Thales/SafeNet Network HSMs
- Partition and client certificates
- Key management workflows
- Backup and recovery procedures

**Agent provides:**

- Example configurations (in playbooks)
- Validation scripts (syntax-check only)
- Documentation (HSM-specific runbooks)

## Audit Trail

All HSA zone activities are logged to:

1. **GitLab audit log** (HSA instance, air-gapped)
2. **ARA records** (Ansible Run Analysis)
3. **State Store** (`governanceEvents` collection)
4. **Physical logbook** (for manual procedures)

### Log Retention

- HSA zone logs: 5 years (PCI requirement)
- Corporate zone logs: 1 year (PCI requirement)
- Audit trail exports: Quarterly to WORM storage

## CPSA Review Checklist

Before implementing HSA deployment, CPSA must review:

- [ ] Network segmentation and air-gap architecture
- [ ] HSM interaction procedures (operator-only, no automation)
- [ ] Local-only model configuration (Ollama, isolated)
- [ ] Dual-control promotion gate implementation
- [ ] PIN block handling procedures (if applicable)
- [ ] Key lifecycle management (generation, rotation, destruction)
- [ ] Audit trail completeness (5-year retention)
- [ ] Incident response procedures for HSA zone
- [ ] Chain of custody for air-gap transfers
- [ ] Personnel vetting for HSA zone access

## References

- PCI DSS Req 1.2.1 - Network segmentation
- PCI DSS Req 2.3 - Secure data deletion procedures
- PCI DSS Req 7.2 - Two-person control for critical systems
- PCI DSS Req 8.6 - Unique credentials for each personnel
- PCI DSS Req 10.2 - Audit trail for all system components
- PCI PIN Security Requirements v3.0

## Status

**Current:** Documentation complete
**Implementation:** Requires CPSA approval
**Phase:** 7 - CPSA GATED
