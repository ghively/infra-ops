# Infra-Ops Runner Topology

## Overview

This document defines the GitLab Runner topology for the infra-ops environment, separating trust levels to satisfy PCI DSS requirements and implement the principle of least privilege.

## Current State (Gap Identified)

**Current Gap:** Single Linux box hosts both the agent and the GitLab runner. All execution happens at the same trust level — a known gap that must be addressed (TODO.md "runner topology").

## Target Topology

### Trust Zone Separation

```
┌─────────────────────────────────────────────────────────────────┐
│                      Corporate Zone (DSS)                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐     │
│  │ CI Runner    │    │ Deploy Runner │    │ Windows Build│     │
│  │ (Docker)     │    │ (Shell)      │    │ Runner       │     │
│  │              │    │              │    │ (Windows)    │     │
│  │ Tags:        │    │ Tags:        │    │ Tags:        │     │
│  │ - linux      │    │ - deploy     │    │ - windows    │     │
│  │ - docker     │    │ - linux      │    │ - shell      │     │
│  │ - ci         │    │ - ansible    │    │              │     │
│  └──────────────┘    └──────────────┘    └──────────────┘     │
│                                                                   │
│  Trust Level: Medium (CI/CD automation)                         │
│  Access: GitLab CI service account + ops team                   │
│                                                                   │
└─────────────────────────────────────────────────────────────────┘

                            (ISO 27001 boundary)

┌─────────────────────────────────────────────────────────────────┐
│              High Security Area (PCI Card Production + PIN)       │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  ┌──────────────┐    ┌──────────────┐                           │
│  │ HSA Deploy    │    │ Local Only   │                           │
│  │ Runner        │    │ Runner        │                           │
│  │ (Air-gapped)  │    │ (Ollama)      │                           │
│  │               │    │               │                           │
│  │ Tags:         │    │ Tags:         │                           │
│  │ - hsa         │    │ - local       │                           │
│  │ - deploy      │    │ - ai          │                           │
│  │ - ansible     │    │               │                           │
│  └──────────────┘    └──────────────┘                           │
│                                                                   │
│  Trust Level: High (PCI Card Production)                         │
│  Access: CPSA-gated ops team only                                │
│  Network: Air-gapped (no direct internet access)                  │
│                                                                   │
└─────────────────────────────────────────────────────────────────┘
```

## Runner Specifications

### CI Runner (Docker)

**Purpose:** Containerized builds, linting, syntax checking

**Tags:** `linux`, `docker`, `ci`, `ansible`

**Executor:** Docker

**Images:**

- `ansible/ansible-runner:latest` — Ansible execution
- `python:3.11` — Python-based tools
- `node:20` — Node.js-based hooks

**Environment Variables:**

- `ANSIBLE_FORCE_COLOR=0`
- `ANSIBLE_HOST_KEY_CHECKING=False`

**Access:** GitLab CI service account

### Deploy Runner (Shell)

**Purpose:** Ansible deployments to Dev/Test/Staging environments

**Tags:** `linux`, `deploy`, `ansible`

**Executor:** Shell

**Access:**

- GitLab CI service account (for Dev auto-deploy)
- Ops team manual approval (for Test/Staging)

**Limitations:**

- No access to production
- No access to HSA

### Windows Build Runner

**Purpose:** Windows-specific builds, PowerShell tasks

**Tags:** `windows`, `shell`, `powershell`

**Executor:** Shell (PowerShell)

**Access:**

- GitLab CI service account
- Windows build team

**Limitations:**

- No Ansible execution against production

### HSA Deploy Runner (Air-gapped)

**Purpose:** Ansible deployments to Card Production zone

**Tags:** `hsa`, `deploy`, `ansible`

**Executor:** Shell

**Access:** CPSA-gated ops team only

**Network:** Air-gapped (no direct internet access)

**Special Requirements:**

- All playbooks authored in corporate zone
- Transferred via air-gap process
- Local-only model (Ollama) for execution

### Local Only Runner (Ollama)

**Purpose:** CHD-adjacent work requiring local inference

**Tags:** `local`, `ai`, `ollama`

**Executor:** Shell

**Access:** Corporate zone agents only

**Environment Variables:**

- `OLLAMA_BASE_URL=http://local-ollama:11434`

## Runner Registration

### Corporate Zone Runners

```bash
# CI Runner (Docker)
gitlab-runner register \
  --url https://gitlab.example.com \
  --registration-token $REGISTRATION_TOKEN \
  --executor docker \
  --description "infra-ops CI Runner (Docker)" \
  --tag-list "linux,docker,ci,ansible" \
  --docker-privileged \
  --docker-image "ansible/ansible-runner:latest"

# Deploy Runner (Shell)
gitlab-runner register \
  --url https://gitlab.example.com \
  --registration-token $REGISTRATION_TOKEN \
  --executor shell \
  --description "infra-ops Deploy Runner (Shell)" \
  --tag-list "linux,deploy,ansible"

# Windows Build Runner
gitlab-runner register \
  --url https://gitlab.example.com \
  --registration-token $REGISTRATION_TOKEN \
  --executor shell \
  --description "infra-ops Windows Build Runner" \
  --tag-list "windows,shell,powershell"
```

### HSA Zone Runners

```bash
# HSA Deploy Runner (air-gapped)
gitlab-runner register \
  --url https://gitlab-hsa.example.com \
  --registration-token $HSA_REGISTRATION_TOKEN \
  --executor shell \
  --description "HSA Deploy Runner (Air-gapped)" \
  --tag-list "hsa,deploy,ansible"

# Local Only Runner (Ollama)
gitlab-runner register \
  --url https://gitlab.example.com \
  --registration-token $REGISTRATION_TOKEN \
  --executor shell \
  --description "Local Only Runner (Ollama)" \
  --tag-list "local,ai,ollama"
```

## Security Considerations

### Service Accounts

| Runner Type | Service Account | Permissions |
|-------------|-----------------|-------------|
| CI Runner | `gitlab-ci` | Docker, read-only GitLab API |
| Deploy Runner | `gitlab-deploy` | Dev/Test deploy, no prod |
| Windows Build | `gitlab-windows` | Windows build access |
| HSA Deploy | `gitlab-hsa` | HSA deploy only (CPSA-gated) |
| Local Only | `gitlab-local` | Local inference only |

### PCI DSS Compliance

- **Req 7.2:** Each runner has a unique service account
- **Req 7.3:** No shared credentials across runners
- **Req 8.6:** Runner tokens stored as protected CI/CD variables
- **Req 10.2:** Runner access logged to GitLab audit trail

### Network Segmentation

- Corporate zone runners: Full network access within corporate zone
- HSA runners: Air-gapped, no direct internet access
- Local Only runner: Corporate zone, but routes CHD-adjacent work to local model

## Migration Path

### Phase 1: Split Corporate Zone Runners

1. Register CI Runner (Docker)
2. Register Deploy Runner (Shell)
3. Update `.gitlab-ci.yml` to use specific tags

### Phase 2: Add Windows Build Runner

1. Register Windows Build Runner
2. Update Windows job definitions

### Phase 3: Implement HSA Runners (CPSA-Gated)

1. **STOP** — Require CPSA review before proceeding
2. Set up air-gapped GitLab instance
3. Register HSA Deploy Runner
4. Configure local-only runner with Ollama

### Phase 4: Decommission Single-Box Topology

1. Migrate all jobs to tagged runners
2. Remove shared runner configuration
3. Implement resource groups per environment

## References

- SPEC.md §1 — Environment baseline
- TODO.md — "Address runner topology gap"
- DESIGN.md §11 — Runner topology
- pci-dss-compliance.md — PCI DSS requirements

## Status

**Current:** Gap identified (single box topology)
**Target:** Multi-runner topology with trust zone separation
**Phase:** 5 (Promotion + Octopus) — Partial implementation
**Blocker:** Phase 7 HSA deployment requires CPSA review
