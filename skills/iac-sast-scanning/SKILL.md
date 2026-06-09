---
name: iac-sast-scanning
description: >
  The binding, machine-enforced security gate for Ansible + GitLab CI changes:
  ansible-lint (production profile, SARIF), gitleaks + TruffleHog secret scanning,
  Checkov/KICS IaC misconfig scanning, with SARIF aggregated to the GitLab Security
  Dashboard and a deterministic severity gate. Reviewer agents advise; THIS fails the
  pipeline. Triggers on: SAST, static analysis, security scan, ansible-lint, checkov,
  kics, gitleaks, trufflehog, SARIF, security gate, supply chain, SBOM.
origin: infra-ops
---

# IaC SAST & Security Scanning Skill

## When to Use

Use when wiring or reasoning about the **machine-enforced** security gate for Ansible
and GitLab CI changes — the layer that *fails the build* rather than merely advising.
An LLM reviewer is probabilistic; this gate is deterministic. Every MR passes through
it, and any finding at or above the gate threshold blocks the merge regardless of what
any agent concluded.

## How It Works

Enforcement is layered so each control runs where it is cheapest and hardest to bypass:

1. **Pre-commit (advisory, fast <10s):** a `.pre-commit-config.yaml` subset
   (yamllint, a fast ansible-lint profile, gitleaks) catches the obvious before code
   leaves the developer's machine. Advisory only — CI is authoritative.
2. **PostToolUse hooks (in-session):** `yamllint-hook`, `ansible-syntax-hook`, and the
   `pan-egress-filter` DLP run automatically as the agent edits. Fast, fail-open on
   parse errors (CI is the hard gate).
3. **CI gate (authoritative, binding):** the pipeline stages below. Each emits **SARIF**
   uploaded as a GitLab Code Quality / Security report so findings surface inline on the
   MR and aggregate in the Security Dashboard.

### CI stage order (mirrors `ansible-testing`, with security inserted)

```
yamllint → ansible-lint (production, SARIF) → ansible-playbook --syntax-check
        → gitleaks → trufflehog (verified) → checkov (or kics) → --check --diff (ARA)
        → molecule (idempotence)
```

### Deterministic severity gate (no model discretion)

- **CRITICAL / HIGH** from any scanner → **pipeline fails, merge blocked.**
- **MEDIUM** → reported, non-blocking, must be triaged.
- **Suppressions** require an inline justification comment + an expiry and are themselves
  reviewed (no blanket disables). ansible-lint `# noqa`, checkov `# checkov:skip`,
  gitleaks `gitleaks:allow` — each with a reason and a ticket reference.

### Determinism / repeatability

Pin every scanner by **digest or exact version** so the ruleset is identical across
runs (same input → same verdict): ansible-lint ≥24.x (production profile), Checkov
pinned, gitleaks pinned (note the project moved to the `gitleaks/gitleaks` org), the
execution environment image by digest. Floating `:latest` is forbidden — it makes the
gate non-reproducible.

### Single source of truth

The *standards* live in the `rules/` files (path-injected) and the domain skills; this
skill wires the *tools that enforce them*. The reviewer agents (playbook-reviewer,
pci-compliance-reviewer, secrets-scanner) cite the same rules and feed the merge gate —
they catch the semantic/contextual issues the scanners cannot, while the scanners catch
what must never pass.

## Examples

### GitLab CI: ansible-lint with SARIF

```yaml
ansible-lint:
  stage: lint
  image: registry.example/ee/ansible-lint@sha256:<pinned>
  script:
    - ansible-lint --profile production --sarif-file gl-sast-ansible.sarif || true
  artifacts:
    reports:
      sast: gl-sast-ansible.sarif
  rules:
    - if: '$CI_PIPELINE_SOURCE == "merge_request_event"'
```

### Secret scanning (fail-closed)

```yaml
gitleaks:
  stage: security
  image: zricethezav/gitleaks@sha256:<pinned>   # org moved to gitleaks/gitleaks
  script:
    - gitleaks detect --redact --report-format sarif --report-path gl-secrets.sarif
  artifacts:
    reports:
      secret_detection: gl-secrets.sarif
  # No `|| true` — a secret leak must fail the pipeline.
```

### Checkov for Ansible misconfig

```yaml
checkov:
  stage: security
  image: bridgecrew/checkov@sha256:<pinned>
  script:
    - checkov -d . --framework ansible --output sarif --output-file-path gl-iac.sarif
  artifacts:
    reports:
      sast: gl-iac.sarif
```

## Trust boundary

- Scans run in the **corporate/DSS zone CI only** — never wired into the air-gapped HSA.
- Scanners are **read-only** over the repo; they never apply changes or reach prod.
- Secret/PAN findings are **redacted** in reports (`--redact`) — never echo the value
  into logs. A confirmed PAN/key finding → route to `incident-response`.

## Deep Reference

### Full Tool Stack

| Tool | What it catches | Config file |
|------|----------------|-------------|
| `ansible-lint` | Ansible anti-patterns, FQCN, idempotency | `.ansible-lint` |
| `yamllint` | YAML syntax, formatting | `.yamllint` |
| `gitleaks` | Secrets, high-entropy strings | `.gitleaks.toml` |
| `TruffleHog v3` | Historical secret leaks in git history | CLI flags |
| `Checkov` | IaC misconfigurations (Terraform, Ansible, Dockerfile) | `.checkov.yaml` |

### SARIF Output for GitLab Security Dashboard

```yaml
# .gitlab-ci.yml
ansible-lint-sast:
  stage: sast
  tags: [linux, docker]
  image: pipelinecomponents/ansible-lint:latest
  script:
    - ansible-lint -f sarif -o gl-sast-report.json || true
  artifacts:
    reports:
      sast: gl-sast-report.json
```

### Checkov Ansible Checks to Enable

```yaml
# .checkov.yaml
check:
  - CKV2_ANSIBLE_1  # Ensure no_log is set for tasks with sensitive data
  - CKV2_ANSIBLE_2  # Ensure validate_certs is not false
  - CKV_ANSIBLE_1   # Ensure no plaintext passwords
```

### Blocking vs. Advisory

The `iac-sast-scanning` CI gate is **blocking** — it must pass before a merge is allowed.
Agent reviewer VERDICTs are advisory. If the CI gate passes but an agent returns BLOCK,
treat the agent BLOCK as the authoritative signal (the agent may catch logic issues the
static scanner cannot).
