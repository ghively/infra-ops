---
name: octopus-release
description: >
  GitLab→Octopus Deploy integration: push package + build-info + commit SHA,
  create release, deploy Dev only from CI. Lifecycles, phases, channels, manual-
  intervention gate as the human prod gate. Ansible-owns-machine /
  Octopus-owns-release division of labor. Tentacle topology (listening dev/test,
  polling prod over 443). Triggers on: octopus, tentacle, lifecycle, release,
  manual intervention, package, build-info, channel, promote.
origin: infra-ops
---

# Octopus Release Skill

## When to Use

Load this skill when wiring the GitLab CI pipeline to Octopus Deploy, configuring
lifecycles or channels, setting up Tentacle topology, or reasoning about the Ansible
vs Octopus division of labor. Also load when reviewing prod-promotion gates or audit
evidence from Octopus.

## How It Works

### Division of Labor — the Core Principle

**Ansible owns the machine.** OS config, hardening, firewall rules, IIS baseline,
runtimes, service accounts, WinRM settings, Tentacle bootstrap. Idempotent, release-
independent. (octopus-multitentacle.md §5.3)

**Octopus owns the release.** App package deployment, IIS binding per release, config
transforms, Windows services, DB migrations (worker pool), runtime secret injection,
smoke tests, rollback, promotion gates and audit trail. (octopus-multitentacle.md §5.2)

Never use Ansible to deploy application packages while an Octopus deployment is
running against the same machine. Coexistence rule: separate service accounts
(`svc-ansible` for WinRM, `svc-octopus-tentacle` for Tentacle) so compromise of one
channel does not immediately compromise the other. (octopus-multitentacle.md §6.2)

### GitLab CI → Octopus Integration Steps

GitLab CI should:

1. Build and test the artifact.
2. Push the package to the Octopus built-in feed (`octopus package upload`).
3. Push build information (commit SHA, branch, pipeline URL) (`octopus build-information`).
4. Create a release (`octopus release create`).
5. Deploy to **Dev only** (`octopus release deploy --environment Dev`).

**GitLab CI must NOT drive promotion to Test, Staging, or Prod.** Those gates live
inside Octopus lifecycles and manual-intervention steps. The CI service account holds
only `Release Creator` + `Deployment Creator` scoped to Dev. (octopus-multitentacle.md §2.3)

```yaml
# .gitlab-ci.yml (illustrative — CI side of the integration)
push-build-info:
  stage: push-build-info
  script:
    - octopus build-information
        --package-id MyApp
        --version $APP_VERSION
        --file build-info.json   # contains $CI_COMMIT_SHA, $CI_JOB_URL, $CI_PROJECT_URL

create-release:
  stage: release
  script:
    - octopus release create --project MyApp --version $APP_VERSION

deploy-dev:
  stage: deploy-dev
  script:
    - octopus release deploy --project MyApp --version $APP_VERSION
        --environment Dev --wait-for-deployment
```

The `VcsCommitNumber` (= `$CI_COMMIT_SHA`) in build-info is the key join: it links
the GitLab pipeline (who/why) to the Octopus deployment (what/when). (octopus-multitentacle.md §2.4)

### Lifecycles, Phases, and Channels

A **lifecycle** defines the ordered promotion sequence. A release cannot skip phases.

```
Default Lifecycle
  Phase 1 — Dev       [auto-deploy on release creation]
  Phase 2 — Test      [manual deploy; all must complete]
  Phase 3 — Staging   [manual deploy; all must complete]
  Phase 4 — Production [manual deploy; manual intervention required]
```

**Channels** provide parallel promotion tracks (e.g., Default: full chain; Hotfix:
Staging→Prod only; Feature-Branch: Dev only). Use channel version rules (SemVer
regex) to control which package versions are eligible per channel.
(octopus-multitentacle.md §3.3)

### Manual Intervention = the Human Dual-Control Prod Gate

The `Manual Intervention` built-in step:

- Pauses deployment before prod steps.
- Requires a member of the `Production Approvers` team (RBAC-scoped, cannot be the
  pipeline triggerer).
- Captures approver name, user ID, timestamp, and notes — written to deployment log
  and audit trail.
- "Specifying a team makes the step a required step that cannot be skipped."

For PCI SoD: developers who triggered the pipeline from GitLab cannot approve their
own prod deploys. The manual-intervention gate is the complement to GitLab's MR
approval gate — together they enforce author ≠ approver ≠ prod-deployer.
(octopus-multitentacle.md §3.4; pci-dss-devops.md §8; DESIGN.md §12)

### Tentacle Topology

| Zone | Mode | Port | Rationale |
|------|------|------|-----------|
| Dev / Test | Listening | TCP 10933 | Simpler, lower overhead |
| Staging / Prod / CDE | **Polling** over 443 | TCP 443 (via reverse proxy) | Outbound-only; no inbound holes into CDE |

Separate Octopus instance for Production (CDE). License includes up to 3 instances.
Keeping the prod Octopus instance isolated satisfies PCI auditors who require the
CDE's deployment toolchain to not be co-tenanted with non-CDE systems.
(octopus-multitentacle.md §4.5; DESIGN.md §12)

All Tentacle traffic uses TLS with X.509 mutual authentication; SSL offloading is
not supported. (octopus-multitentacle.md §1.1)

### RBAC for PCI

| Role | Scope | Use |
|------|-------|-----|
| Release Creator | All | CI service account |
| Deployment Creator | Dev only | CI service account |
| Deployment Creator | Staging + Prod | Ops team only |
| Project Viewer | All | Auditors (read-only) |

Prefer **OIDC / short-lived access tokens** (or service-account API keys with an
expiry) over static keys where the Octopus version supports it; treat 90-day static
keys as the fallback and rotate them. Use SSO+MFA via AD/OIDC. Never share user
accounts — audit trails become useless. (octopus-multitentacle.md §4.2)

### Config-as-Code, Runbooks, and Deployment Freezes (Octopus 2025.x)

- **Config-as-Code (OCL):** store the deployment process and variables — and, in
  2025.1+, **runbooks** — as version-controlled OCL in Git. For a PCI estate this makes
  the deployment *process itself* peer-reviewable and change-controlled like the Ansible
  repo. Secrets stay in Octopus/Vault, **never** in OCL.
- **Runbooks (first-class):** operational actions (restart, rotate, DR, break-glass) are
  RBAC-gated, audited Octopus **runbooks**, distinct from the deploy process. See the
  `rollback-and-runbooks` skill. Rollback = re-deploy the previous **release** (Octopus
  keeps the exact prior package) through the manual-intervention gate.
- **Deployment Freezes (GA, project-level):** use native deployment freezes for
  change-freeze / maintenance windows instead of ad-hoc disabling of jobs.

### Build Once, Promote the Same Immutable Artifact

The same package version, deployment process snapshot, and variable snapshot taken
at release creation are used at every environment. Only scoped variable values
(environment-specific secrets from Vault, per-env ports) change per environment.
(octopus-multitentacle.md §3.2; multi-env-versioning.md §4.3)

### Trust Boundary

- The agent triggers CI and may create releases + deploy to Dev.
- Promotion to Test/Staging/Prod requires a human with the correct Octopus role.
- Prod requires the Manual Intervention gate + the `Production Approvers` team sign-off.
- Agent must never hold `Deployment Creator` scoped to prod. (SPEC.md §2; DESIGN.md §12)

## Examples

```bash
# CI script: full GitLab→Octopus chain
octopus package upload --package ./dist/MyApp.$APP_VERSION.zip
octopus build-information --package-id MyApp --version $APP_VERSION --file build-info.json
octopus release create --project MyApp --version $APP_VERSION
octopus release deploy --project MyApp --version $APP_VERSION --environment Dev \
  --wait-for-deployment

# Human: promote from Octopus UI (or CLI with appropriate role)
octopus release deploy --project MyApp --version $APP_VERSION --environment Test
```

> TODO: Confirm Octopus server URL and space name from CMDB/environment discovery.
> TODO: Confirm prod Octopus instance isolation — separate instance vs separate Space
> (separate instance preferred for PCI audit defensibility). (octopus-multitentacle.md §4.5)
> TODO: Verify Tentacle topology (listening vs polling) per environment once network
> diagram is ingested. (DESIGN.md §17 Q2)
