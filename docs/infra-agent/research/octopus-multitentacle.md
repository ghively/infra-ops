# Octopus Deploy Best Practices: Multi-Tentacle, GitLab CI, Ansible, Mixed Windows/Linux, PCI-DSS

> Research date: 2026-06-03. All claims are cited to primary sources. Where a claim is from official Octopus documentation it is linked directly; third-party sources are marked accordingly.

---

## Table of Contents

1. [Tentacle Topology](#1-tentacle-topology)
2. [GitLab CI → Octopus Integration](#2-gitlab-ci--octopus-integration)
3. [Promotion Model: Lifecycles, Phases, Channels](#3-promotion-model-lifecycles-phases-channels)
4. [PCI-DSS and Octopus](#4-pci-dss-and-octopus)
5. [Division of Labor: Ansible vs Octopus](#5-division-of-labor-ansible-vs-octopus)
6. [Windows Specifics: Tentacles and Ansible-over-WinRM](#6-windows-specifics-tentacles-and-ansible-over-winrm)
7. [Recommended Architecture Summary](#7-recommended-architecture-summary)
8. [Sources](#8-sources)

---

## 1. Tentacle Topology

### 1.1 Listening vs Polling Tentacles

Octopus Tentacles operate in two modes whose key difference is the direction of the TCP connection, not the direction of data:

| Property | Listening Tentacle | Polling Tentacle |
|---|---|---|
| Connection initiator | Octopus Server reaches out to Tentacle | Tentacle reaches out to Octopus Server |
| Default port | TCP 10933 (on the Tentacle host) | TCP 10943 on Octopus Server (or port 443 via reverse proxy) |
| Firewall change needed | Open inbound 10933 on the Tentacle host | Open outbound from Tentacle → Octopus only |
| Resource cost | Lower — TCP server, waits passively | Higher — Tentacle polls continuously regardless of workload |
| IP restriction | You can allowlist which IPs may connect to 10933 | Not possible to restrict from the Tentacle side |
| Preferred? | Yes, "wherever practical" per official docs | Use when Tentacles are behind NAT, dynamic IPs, or strict outbound-only firewalls |

Source: [Tentacle communication modes](https://octopus.com/docs/infrastructure/deployment-targets/tentacle/tentacle-communication)

**When polling is clearly better for a PCI or segmented-network environment:**

- The CDE (Cardholder Data Environment) has an outbound-only firewall policy — no inbound TCP from Octopus is permitted.
- Tentacles sit in a DMZ or isolated VLAN where you cannot open inbound ports from the Octopus Server's IP.
- The Tentacle hosts use NAT or dynamic IPs.

In these cases, polling Tentacles emit an **outbound** connection from within the CDE to the Octopus Server, satisfying PCI Requirement 1 (firewall controls) without punching inbound holes into the CDE.

**Port 443 for polling:** Octopus supports running polling Tentacles over HTTPS port 443 via a reverse proxy on the Octopus Server, avoiding the non-standard port 10943 (which is unassigned in IANA and raises firewall-approval flags in regulated environments). This requires Tentacle version 6.3.417+. For self-hosted Octopus, a reverse proxy must be manually configured in front of the Octopus Server.
Source: [Polling Tentacles over port 443](https://octopus.com/blog/polling-tentacles-443)

All Tentacle traffic (both modes) uses **TLS with X.509 certificate mutual authentication**. SSL offloading is not supported — the TLS must remain intact end-to-end.
Source: [Tentacle communication modes](https://octopus.com/docs/infrastructure/deployment-targets/tentacle/tentacle-communication)

### 1.2 Deployment Targets, Target Tags (Roles), Environments

- **Environments** represent the purpose of the infrastructure (dev, test, staging, prod). Keep 2–10 environments per space. Do not put project names or branch names in environment names.
- **Deployment targets** are registered to one or more environments and carry one or more **target tags** (previously called roles). Tags control which deployment steps run on which machines.
- **Target tag naming**: prefer specific application-component tags (e.g., `payment-api`, `checkout-web`) rather than generic architecture tags like `web-server`. Multiple tags on a step use OR logic — a step targeting `payment-api` OR `checkout-web` deploys to any server holding either tag within the selected environment.

Source: [Environments, Deployment Targets, and Target Tags](https://octopus.com/docs/best-practices/deployments/environments-and-deployment-targets-and-roles)

### 1.3 Worker Pools

Workers are Tentacle-based agents that run orchestration-layer steps (scripts, API calls, database migrations) that do not run on a deployment target directly.

- Workers are registered to **worker pools**, not environments.
- Best practice: create one worker pool per environment per data center (e.g., `EU-West-Prod-Workers`), with at least two workers per pool for redundancy.
- Worker pools can be isolated to DMZ segments, enabling database deployment steps to run inside a network zone without touching application targets directly.
- Name workers with a convention encoding purpose, location, and environment — e.g., `p-db-london-worker-01`.
- Configure the Tentacle Windows service to run as a specific Active Directory service account, limiting what the worker can access on the network.
- Use execution containers (Docker) on workers to minimize tooling installed on worker hosts.

Source: [Worker Pools](https://octopus.com/docs/infrastructure/workers/worker-pools), [Worker Configuration Best Practices](https://octopus.com/docs/best-practices/octopus-administration/worker-configuration)

### 1.4 Recommended Topology: Dev / Test / Prod with Multiple Tentacles

```
┌──────────────────────────────────────────────────────────┐
│  Octopus Server (self-hosted, outside CDE)               │
│  - Web portal + HTTP API on HTTPS/443                    │
│  - Listening Tentacle comms on TCP 10933                 │
│  - Polling Tentacle comms on TCP 10943 (or 443 via RP)   │
└────────┬──────────────────────┬───────────────────────────┘
         │                      │
   [Dev/Test zones]         [Prod / CDE zone]
   Listening Tentacles       Polling Tentacles
   (Octopus → Tentacle)      (Tentacle → Octopus)
         │                      │
  ┌──────┴──────┐        ┌──────┴──────┐
  │ dev-web-01  │        │ prod-web-01 │  target tag: payment-web
  │ dev-web-02  │        │ prod-web-02 │  target tag: payment-web
  │ dev-api-01  │        │ prod-api-01 │  target tag: payment-api
  └─────────────┘        └─────────────┘
         │                      │
  Worker Pool:             Worker Pool:
  dev-test-workers         prod-workers
  (Linux VMs in dev VLAN)  (Linux VMs inside CDE)
```

**Rationale:**
- Dev/test have lower compliance requirements — listening Tentacles are simpler and lower overhead.
- Prod/CDE uses polling Tentacles so no inbound ports from Octopus Server need to be opened into the CDE.
- Workers in the prod worker pool run inside the CDE's network boundary to execute privileged steps (DB migrations, config file generation) without exposing those servers as full deployment targets.
- For PCI, consider a **separate Octopus Server instance** for the production CDE (see Section 4.5).

---

## 2. GitLab CI → Octopus Integration

### 2.1 Boundary Principle

The integration boundary is clean:

- **GitLab CI** = build, unit-test, package, push artifact, push build metadata, and optionally trigger a release + dev deploy.
- **Octopus** = create release, promote through environments, apply environment-specific config, run deployment steps on Tentacles, enforce manual approvals, maintain audit trail.

GitLab should **not** drive the promotion decision from dev→test→prod. That gate lives in Octopus lifecycles with manual intervention steps (see Section 3).

### 2.2 Pushing Packages to the Octopus Built-in Feed

The built-in repository accepts packages via:

**Octopus CLI (recommended for CI pipelines):**
```bash
octopus package upload \
  --package ./dist/MyApp.1.2.3.zip \
  --overwrite-mode overwrite \
  --server https://octopus.example.com \
  --apiKey $OCTOPUS_API_KEY \
  --space "Default"
```

**curl (useful when the Octopus CLI container is not available):**
```bash
curl -X POST https://octopus.example.com/api/packages/raw \
  -H "X-Octopus-ApiKey: $OCTOPUS_API_KEY" \
  -F "data=@MyApp.1.2.3.zip"
```

Permissions required: the CI service account needs the built-in **Package Publisher** role, which grants `BuiltInFeedPush`.

Source: [Built-in Octopus Repository](https://octopus.com/docs/packaging-applications/package-repositories/built-in-repository)

**Alternatively**, configure GitLab's NuGet Package Registry or Container Registry as an **external feed** in Octopus (Library → External Feeds). This keeps packages on GitLab's infrastructure. Authentication is via project/group ID and a GitLab deploy token or personal access token.
Source: [Using GitLab Feeds With Octopus Deploy](https://octopus.com/blog/gitlab-external-feeds)

The built-in feed is simpler for most shops; external feeds keep your artifact storage consolidated. For PCI environments, the built-in feed reduces the number of external network calls the Tentacle/worker must make at deploy time.

### 2.3 Creating Releases and Deploying from GitLab CI

Use the **Octopus CLI** in a GitLab CI job. Install it via the official Docker image or download the binary:

```yaml
# .gitlab-ci.yml (illustrative)

stages:
  - build
  - package
  - push-build-info
  - release
  - deploy-dev       # auto-triggered
  - deploy-test      # auto-triggered from Octopus lifecycle
  - deploy-prod      # manual gate in Octopus

variables:
  OCTOPUS_SERVER: "https://octopus.example.com"
  OCTOPUS_SPACE: "Default"
  APP_VERSION: "1.0.$CI_PIPELINE_IID"

package:
  stage: package
  script:
    - dotnet publish -c Release -o ./publish
    - zip -r MyApp.$APP_VERSION.zip ./publish
    - octopus package upload --package MyApp.$APP_VERSION.zip
      --server $OCTOPUS_SERVER --apiKey $OCTOPUS_API_KEY

push-build-info:
  stage: push-build-info
  script:
    # Build the build-information JSON from GitLab CI variables
    - |
      cat > build-info.json << EOF
      {
        "PackageId": "MyApp",
        "Version": "$APP_VERSION",
        "Branch": "$CI_COMMIT_REF_NAME",
        "BuildUrl": "$CI_JOB_URL",
        "BuildNumber": "$CI_PIPELINE_IID",
        "BuildEnvironment": "GitLabCI",
        "VcsCommitNumber": "$CI_COMMIT_SHA",
        "VcsType": "Git",
        "VcsRoot": "$CI_PROJECT_URL"
      }
      EOF
    - octopus build-information
        --package-id MyApp
        --version $APP_VERSION
        --file build-info.json
        --server $OCTOPUS_SERVER
        --apiKey $OCTOPUS_API_KEY

create-release:
  stage: release
  script:
    - octopus release create
        --project MyApp
        --version $APP_VERSION
        --server $OCTOPUS_SERVER
        --apiKey $OCTOPUS_API_KEY

deploy-dev:
  stage: deploy-dev
  script:
    - octopus release deploy
        --project MyApp
        --version $APP_VERSION
        --environment Dev
        --server $OCTOPUS_SERVER
        --apiKey $OCTOPUS_API_KEY
        --wait-for-deployment
```

Note: From GitLab CI you should deploy only to **Dev** automatically. Promotion to Test and Prod is gated by Octopus lifecycle phases and manual intervention steps. Do not add a `deploy-prod` job in `.gitlab-ci.yml` — the prod deploy must happen from inside Octopus to preserve the audit trail and RBAC gates.

Sources: [Build Information construction](https://octopus.com/blog/constructing-build-information), [octopus release deploy CLI reference](https://octopus.com/docs/octopus-rest-api/cli/octopus-release-deploy), [Build Server Integration](https://octopus.com/docs/packaging-applications/build-servers)

### 2.4 Build Information and Commit SHA

The `VcsCommitNumber` field carries the commit SHA. Once pushed, Octopus links work items, commits, and release notes to the release, visible in the Octopus UI and surfaced in deployment logs. For GitLab, the relevant CI variables are:

- `CI_COMMIT_SHA` — full 40-char SHA
- `CI_COMMIT_REF_NAME` — branch or tag name
- `CI_PIPELINE_IID` — pipeline sequence number (good for `major.minor.patch.IID` versioning)
- `CI_JOB_URL` — direct link back to the GitLab job log
- `CI_PROJECT_URL` — repository root URL

Source: [Constructing Build Information](https://octopus.com/blog/constructing-build-information)

### 2.5 Gating Prod Deploys

There are two complementary mechanisms:

1. **Octopus Lifecycle phases** — the lifecycle for a project requires successful deployment in Dev and Test before the Prod phase is accessible. This is enforced by Octopus and cannot be bypassed by a GitLab CI job.

2. **Octopus Manual Intervention step** — placed immediately before the production deployment steps, scoped to the `Production Approvers` team. The deployment pauses; a human must click Proceed (or Abort) in the Octopus UI. The approver's identity, timestamp, and notes are stored in the deployment log and audit trail.

**Do not** use GitLab's `when: manual` gate as the sole prod control — it lacks the team-scoped RBAC, audit trail, and separation-of-duties enforcement that Octopus manual intervention provides.

---

## 3. Promotion Model: Lifecycles, Phases, Channels

### 3.1 Lifecycles

A **lifecycle** defines the ordered sequence of phases a release must traverse. Phases map to environments; phases can require complete deployment to all environments in the phase or a minimum threshold.

Recommended lifecycle for a standard app:

```
Default Lifecycle
  Phase 1 — Dev         [auto-deploy on release creation]
  Phase 2 — Test        [manual deploy; all must complete]
  Phase 3 — Staging     [manual deploy; all must complete]
  Phase 4 — Production  [manual deploy; manual intervention required]
```

A release cannot enter Phase 4 until Phase 3 has a successful deployment. This is enforced by Octopus — it is not configurable away by end users unless they have `LifecycleEdit` permission.

Source: [Lifecycles](https://octopus.com/docs/releases/lifecycles)

### 3.2 Promoting the Same Release Dev → Test → Prod

Octopus's fundamental promise: **the same release artifact is promoted**, not rebuilt. The package version, deployment process snapshot, and variable snapshot taken at release creation are used at every environment. Only variable values change per-environment (scoped variables). This is the key compliance guarantee — what you tested in staging is exactly what you deploy to prod.

To deploy an existing release to the next environment:

```bash
# In Octopus UI: Projects → MyApp → Releases → 1.2.3 → Deploy to Test
# Via CLI:
octopus release deploy \
  --project MyApp \
  --version 1.2.3 \
  --environment Test \
  --server $OCTOPUS_SERVER \
  --apiKey $OCTOPUS_API_KEY
```

### 3.3 Channels

Channels allow a single project to have multiple independent promotion tracks:

| Channel | Lifecycle | Use Case |
|---|---|---|
| Default | Dev → Test → Staging → Prod | Normal releases |
| Hotfix | Staging → Prod (skip dev/test) | Critical security patches |
| Feature-Branch | Dev only (ephemeral) | PR preview environments |

Channel version rules (SemVer ranges + pre-release tag regex) control which package versions are eligible for each channel. For example, a `Hotfix` channel can be restricted to packages tagged `^hotfix-` in their pre-release segment.

Source: [Channels](https://octopus.com/docs/releases/channels)

### 3.4 Manual Intervention and Separation of Duties

The `Manual Intervention` built-in step:

- Pauses the deployment at that point in the process.
- Requires a member of a specified **team** to Proceed or Abort — not just anyone with deploy rights.
- Captures: approver name, user ID, email, timestamp, and any notes entered.
- These are written to the deployment log and the audit trail.
- "Specifying a team makes the step a required step that cannot be skipped."

For PCI separation of duties:
- Create a `Production Approvers` team containing only senior engineers and operations leads.
- Scope a Manual Intervention step to `Production Approvers`, condition `Run only for Production environment`.
- Developers (who triggered the pipeline from GitLab CI) cannot approve their own deploys to prod.

Source: [Manual Intervention and Approval Step](https://octopus.com/docs/projects/built-in-step-templates/manual-intervention-and-approvals)

---

## 4. PCI-DSS and Octopus

### 4.1 PCI Compliance Overview

Octopus Deploy has a dedicated PCI compliance documentation page covering how the platform's automation-first model aligns with PCI DSS controls. Key excerpt: "In Octopus Deploy, everything is scripted which leaves less room for human error or uncontrolled activities."

Source: [PCI Compliance and Octopus Deploy](https://octopus.com/docs/security/pci-compliance-and-octopus-deploy)

Octopus holds ISO 27001:2022, SOC 2 Type II, and SOC 3 certifications. Source: [Octopus Trust Center](https://octopus.com/company/trust)

### 4.2 RBAC and Teams

The RBAC model uses three layers: **Users**, **Roles**, and **Teams**. Teams are the core unit — they combine users, roles, and scope restrictions (project + environment combinations).

Key built-in roles for a PCI shop:

| Role | PCI Use |
|---|---|
| Project Deployer | Dev/Test deployment team |
| Release Creator | CI service account |
| Deployment Creator (scoped to Prod) | Operations team only |
| Environment Manager | Infra team |
| Project Viewer | Auditors, read-only compliance review |

**Environment-scoped Deployment Creator** is the critical control: Developers get `Deployment Creator` scoped to Dev and Test only. Operations gets `Deployment Creator` scoped to Staging and Prod.

Best practices:
- Never share user accounts — audit trails become useless.
- Create dedicated **service accounts** per integration (one for GitLab CI, one for any Ansible orchestration). Rotate API keys every 90 days.
- Use SSO with MFA via Active Directory or an OIDC provider.

Source: [Users, Roles and Teams Best Practices](https://octopus.com/docs/best-practices/octopus-administration/users-roles-and-teams)

### 4.3 Sensitive Variables and Variable Sets

- Sensitive variables are encrypted at rest using **AES-256 in Octopus 2024.4+** (AES-128 in prior versions). They are encrypted with AES-128 in transit and when temporarily stored on deployment targets.
- Once saved, a sensitive variable **cannot be read back** via the UI or REST API — it is write-only. It always renders as `**` in the portal.
- Octopus masks sensitive variable values in deployment logs.
- Only variables with values longer than 3 characters are masked; values 8–30 characters are recommended for reliable masking.
- For production secrets, consider integrating with a proper secrets manager: **HashiCorp Vault**, **AWS Secrets Manager**, **Azure Key Vault**, or **CyberArk Conjur** via community step templates. These retrieve secrets at deploy time and surface them as sensitive output variables — secrets never live in Octopus's database.

Source: [Sensitive Variables](https://octopus.com/docs/projects/variables/sensitive-variables)

**Variable Sets (Library)**: Group related variables into named library sets (e.g., `Payment-Gateway-Prod`, `Notification-Config`). Do not create a single monolithic "global" variable set. Restrict edit permissions to experienced users.

Source: [Variables Best Practices](https://octopus.com/docs/best-practices/deployments/variables)

### 4.4 Audit Log and Retention

Octopus captures every **mutating action** (create/edit/delete) with who, what, and when. Captured events include:
- Deployment task queuing and completion
- Variable changes (value hashed, not stored)
- Environment and target modifications
- User login events
- Certificate downloads

Retention: defaults to **90 days** in the database; configurable to 365 days (or 3,650 days for self-hosted). Older entries are auto-archived as dated JSONL files suitable for data lake ingestion.

**SIEM streaming**: Available from Octopus 2022.4 for Enterprise-tier customers. Streams to Splunk, SumoLogic, Datadog, and others in real time.

Source: [Auditing](https://octopus.com/docs/security/users-and-teams/auditing), [Audit log SIEM](https://octopus.com/industry/financial-services)

### 4.5 Instance Isolation for the CDE

> **Critical for PCI:** It is often easier to satisfy PCI requirements using **separate Octopus Server instances** rather than separate Spaces on a shared instance.

Spaces on a shared instance share the same task queue and the same underlying database. PCI auditors scrutinizing the CDE may require proof that the CDE's deployment toolchain is not co-tenanted with non-CDE systems.

Octopus licenses include up to **three separate instances** at no extra cost to support this pattern. The recommended architecture:

```
Instance A (non-CDE Octopus)
  Spaces: Dev, Test, Staging
  Tentacles: listening mode (dev/test servers)

Instance B (CDE Octopus, inside or adjacent to CDE network)
  Space: Production
  Tentacles: polling mode (prod servers inside CDE)
  Access: restricted to Operations team only
  GitLab CI: service account has Release Creator only — cannot deploy to prod
```

To keep project configurations in sync between instances, use Octopus's instance synchronization features or manage deployment process configurations as code (Config-as-Code / Git-backed projects).

Source: [Isolated Octopus Servers](https://octopus.com/docs/installation/isolated-octopus-deploy-servers), [Partition with Spaces](https://octopus.com/docs/best-practices/octopus-administration/partition-octopus-with-spaces)

---

## 5. Division of Labor: Ansible vs Octopus

### 5.1 The Core Principle

These tools are **complementary, not competing**. The confusion arises because both can run scripts on Windows and Linux targets. The key to avoiding overlap is assigning ownership by concern:

| Concern | Owner | Rationale |
|---|---|---|
| OS-level config (WinRM settings, firewall rules, time sync, DNS, NTP) | Ansible | Idempotent playbooks; agentless via WinRM/SSH; run on-demand or scheduled |
| Software prerequisite installation (.NET runtime, IIS role, VC++ redistributables) | Ansible | Idempotent, declarative — not release-lifecycle-dependent |
| Service accounts, local users, registry baseline | Ansible | Config management, not deployment |
| Application package deployment (MSI, zip, NuGet, Docker image) | Octopus | Release tracking, version history, promotion gates, rollback |
| IIS site/app pool creation and binding | Split — see below | Baseline IIS config is Ansible; release-specific config (app pool name, port per env) is Octopus variables |
| Application configuration files (web.config, appsettings.json) | Octopus | Environment-specific values injected at deploy time from Octopus variables; secrets from sensitive variables |
| Database schema migrations | Octopus (via worker) | Tied to application release version; needs promotion gates and approval |
| Infrastructure provisioning (VMs, networking, security groups) | Ansible / Terraform | Not a deployment concern |
| Post-deploy smoke tests | Octopus | Run as a deployment step after application is live |
| Tentacle agent installation on new Windows hosts | Ansible (bootstrap only) | See Section 6 for the scheduling workaround |

### 5.2 Why Octopus Owns App Deployment

Octopus provides what Ansible does not for application releases:
- **Version-pinned release**: the same artifact bit-for-bit traverses dev→test→prod.
- **Promotion gates**: cannot skip environments.
- **Manual approval**: RBAC-scoped sign-off with full audit trail.
- **Rollback**: re-deploy a previous release version via the UI in seconds.
- **Deployment logs**: per-environment, per-release deployment history retained.
- **Windows MSI/zip/NuGet support via Tentacle**: Octopus handles package extraction, config substitution, IIS deployment, and Windows service management natively.

Ansible lacks this release-lifecycle model. It is stateless and idempotent — ideal for "make this machine look like this spec," not for "deploy version 1.2.3 of this app to these three environments in order."

Source: [Managing Ansible Deployments with Octopus](https://octopus.com/blog/octopus-ansible)

### 5.3 Why Ansible Owns Config Management

Ansible provides what Octopus does not for infrastructure state:
- **Agentless**: no Tentacle required. Useful for bootstrapping new machines or machines where Tentacle cannot yet be installed.
- **Idempotent convergence**: run the same playbook 10 times; the result is the same. Playbooks express desired state.
- **WinRM and SSH support**: works natively against both Windows and Linux.
- **Deep OS-level modules**: `win_feature`, `win_service`, `win_registry`, `win_acl`, `win_firewall_rule`, etc.
- **Inventory-driven**: scale to hundreds of machines without registering each one to Octopus.

Octopus deployment steps are procedural and release-scoped. They are poor choices for standing OS configuration that must remain consistent regardless of whether an app is being deployed.

Source: [Ansible Windows WinRM documentation](https://docs.ansible.com/ansible/latest/os_guide/windows_winrm.html)

### 5.4 Recommended Responsibility Split (Summary)

```
Ansible responsibility surface:
  - OS hardening, patching schedule, Windows Update policy
  - Local firewall rules (Windows Firewall via win_firewall_rule)
  - IIS role enablement, features, global defaults
  - .NET runtime / SDK installation
  - Service account creation, local group membership
  - WinRM configuration (used by Ansible itself)
  - Tentacle bootstrap installation (one-time, via scheduled task — see Section 6)
  - Antivirus / EDR agent deployment
  - Log shipping agent (Splunk Universal Forwarder, etc.)
  - Disk/volume configuration

Octopus responsibility surface:
  - Application package deployment (all environments)
  - IIS website/app pool creation scoped to an application
  - Application configuration file transforms (web.config, appsettings.json)
  - Windows service install/stop/start for deployed services
  - Database schema migrations (run from a worker pool)
  - Secrets injection at deploy time (sensitive variables or Vault)
  - Post-deploy smoke tests and health checks
  - Rollback of application to previous release
  - Full audit trail and promotion gate enforcement
```

---

## 6. Windows Specifics: Tentacles and Ansible-over-WinRM

### 6.1 Deploying Windows Apps via Tentacles

The Windows Tentacle service is a lightweight Windows Service that listens (or polls) for deployment instructions. During a deployment, the Tentacle:

1. Receives the package from the Octopus Server (or downloads from the built-in/external feed).
2. Extracts the package to a deployment directory.
3. Runs pre/post deploy scripts (PowerShell, Bash, or C# script steps).
4. Performs Structured Configuration Variable substitution in `web.config`, `appsettings.json`, JSON, YAML, and XML files.
5. Manages IIS sites and app pools via the built-in `Deploy to IIS` step.
6. Manages Windows Services via the built-in `Deploy a Windows Service` step.

**OS requirements**: Windows Server 2012 through 2025, Windows 10 LTSC 2021. .NET Framework 4.8+ for Tentacle 6.3+. PowerShell 5.1 for Azure steps; PS 3.0/4.0 minimum otherwise.

Source: [Tentacle Windows Requirements](https://octopus.com/docs/infrastructure/deployment-targets/tentacle/windows/requirements)

### 6.2 Coexistence with Ansible-over-WinRM

Ansible manages Windows hosts via **WinRM** (port 5985 HTTP / 5986 HTTPS). Octopus Tentacle runs as a separate Windows service on **TCP 10933** (listening) or connects outbound to TCP 10943 (polling). The two protocols are completely independent and do not conflict.

Practical coexistence rules:

1. **Do not use Ansible to deploy application packages** at the same time as an Octopus deployment is running on the same machine. Use Octopus runbooks or deployment locks to prevent concurrent operations.

2. **Let Ansible own WinRM configuration**: Ansible needs WinRM to be correctly configured (HTTPS transport, trusted certificates, CredSSP or Kerberos for domain environments). Do not let Octopus steps modify WinRM settings — that can break Ansible connectivity.

3. **Use Ansible only for Tentacle bootstrap installation on new Windows machines.** The trick: installing the Tentacle agent via an Ansible `win_shell` or `win_command` task fails silently because certificate generation requires a loaded user profile that WinRM remote sessions don't provide. The workaround: use Ansible's `win_scheduled_task` module to create a one-time scheduled task that runs the Tentacle installer as the local SYSTEM or a domain account with a full interactive profile. This executes with a proper user profile and can access the Windows cryptographic store.
Source: [Octopus Deploy Remote Tentacle Installation via Ansible](https://www.rootisgod.com/2020/Octopus-Deploy-Remote-Tentacle-Installation/)

4. **Service account separation**: Run the Tentacle Windows service under a dedicated service account (`svc-octopus-tentacle`) with minimal rights (read from deploy directory, start/stop the application service). Run Ansible WinRM connections under a separate service account (`svc-ansible`). This means a compromise of one channel does not immediately compromise the other.

5. **IIS baseline vs IIS release config**: Ansible creates and configures IIS at OS-level (enabling Windows features, setting global limits, creating application pools with baseline settings). Octopus then binds specific application releases to those app pools and manages per-environment port bindings via Octopus variables. Define IIS port as an Octopus variable scoped per environment (e.g., `IIS.Port = 8080` in Dev, `80` in Prod) to allow multi-environment deployments without conflicts.

Source: [Ansible WinRM documentation](https://docs.ansible.com/ansible/latest/os_guide/windows_winrm.html), [Ansible Windows intro](https://docs.ansible.com/projects/ansible/latest/os_guide/intro_windows.html)

---

## 7. Recommended Architecture Summary

### Tentacle Topology Recommendation

- **Dev / Test servers**: Listening Tentacles (TCP 10933). Octopus reaches into dev/test networks. Simpler, lower overhead.
- **Staging / Prod / CDE servers**: Polling Tentacles over port 443 (via reverse proxy on Octopus Server). The CDE emits only outbound HTTPS — no inbound holes required.
- **Worker pools**: One per environment, two workers minimum each. Workers live inside the same network segment as the targets they support.
- **Octopus instances**: Two instances — one for Dev/Test/Staging (outside CDE), one for Production (adjacent to or inside CDE). License includes up to 3 instances.

### GitLab → Octopus Integration Recommendation

1. GitLab CI builds, tests, and packages the application.
2. CI pushes the package to the Octopus built-in feed using `octopus package upload`.
3. CI pushes build information (commit SHA, branch, pipeline URL) using `octopus build-information`.
4. CI creates a release using `octopus release create`.
5. CI deploys to **Dev only** using `octopus release deploy --environment Dev`.
6. All subsequent promotions (Test → Staging → Prod) happen **inside Octopus** — triggered by authorized humans — enforced by lifecycle phases and manual intervention steps.
7. The GitLab CI service account has only `Release Creator` + `Deployment Creator` scoped to Dev. It cannot deploy to Prod or Staging.

### Ansible / Octopus Division of Labor Recommendation

**Ansible owns the machine.** It configures the OS, installs prerequisites, and keeps infrastructure state idempotent. Ansible runs independently of any release cycle.

**Octopus owns the release.** It deploys application artifacts, injects secrets at runtime, enforces promotion gates, and maintains the deployment audit trail. Octopus runs as part of the software release lifecycle.

The two never touch each other's domain: Ansible does not install application packages; Octopus does not configure OS-level settings. When both must touch the same resource (e.g., IIS), split it: Ansible creates and configures the IIS site baseline; Octopus binds the application to it and manages per-release config.

---

## 8. Sources

| # | Title | URL |
|---|---|---|
| 1 | Tentacle Communication Modes (Official Docs) | https://octopus.com/docs/infrastructure/deployment-targets/tentacle/tentacle-communication |
| 2 | Polling Tentacles Over Port 443 (Official Blog) | https://octopus.com/blog/polling-tentacles-443 |
| 3 | Exposing Octopus — Network Security (Official Docs) | https://octopus.com/docs/security/exposing-octopus |
| 4 | Environments, Deployment Targets, and Target Tags (Official Docs) | https://octopus.com/docs/best-practices/deployments/environments-and-deployment-targets-and-roles |
| 5 | Worker Pools (Official Docs) | https://octopus.com/docs/infrastructure/workers/worker-pools |
| 6 | Worker Configuration Best Practices (Official Docs) | https://octopus.com/docs/best-practices/octopus-administration/worker-configuration |
| 7 | Built-in Octopus Repository (Official Docs) | https://octopus.com/docs/packaging-applications/package-repositories/built-in-repository |
| 8 | Using GitLab Feeds With Octopus Deploy (Official Blog) | https://octopus.com/blog/gitlab-external-feeds |
| 9 | Build Server Integration (Official Docs) | https://octopus.com/docs/packaging-applications/build-servers |
| 10 | Constructing Build Information (Official Blog) | https://octopus.com/blog/constructing-build-information |
| 11 | octopus release deploy CLI Reference (Official Docs) | https://octopus.com/docs/octopus-rest-api/cli/octopus-release-deploy |
| 12 | Lifecycles (Official Docs) | https://octopus.com/docs/releases/lifecycles |
| 13 | Channels (Official Docs) | https://octopus.com/docs/releases/channels |
| 14 | Manual Intervention and Approval Step (Official Docs) | https://octopus.com/docs/projects/built-in-step-templates/manual-intervention-and-approvals |
| 15 | PCI Compliance and Octopus Deploy (Official Docs) | https://octopus.com/docs/security/pci-compliance-and-octopus-deploy |
| 16 | Users, Roles and Teams Best Practices (Official Docs) | https://octopus.com/docs/best-practices/octopus-administration/users-roles-and-teams |
| 17 | Sensitive Variables (Official Docs) | https://octopus.com/docs/projects/variables/sensitive-variables |
| 18 | Auditing (Official Docs) | https://octopus.com/docs/security/users-and-teams/auditing |
| 19 | Variables Best Practices (Official Docs) | https://octopus.com/docs/best-practices/deployments/variables |
| 20 | Isolated Octopus Servers (Official Docs) | https://octopus.com/docs/installation/isolated-octopus-deploy-servers |
| 21 | Partition Octopus with Spaces (Official Docs) | https://octopus.com/docs/best-practices/octopus-administration/partition-octopus-with-spaces |
| 22 | Managing Ansible Deployments with Octopus (Official Blog) | https://octopus.com/blog/octopus-ansible |
| 23 | Octopus Deploy for Financial Services (Official) | https://octopus.com/industry/financial-services |
| 24 | Octopus Trust Center (Official) | https://octopus.com/company/trust |
| 25 | Tentacle Windows Requirements (Official Docs) | https://octopus.com/docs/infrastructure/deployment-targets/tentacle/windows/requirements |
| 26 | Ansible Windows WinRM (Ansible Official Docs) | https://docs.ansible.com/ansible/latest/os_guide/windows_winrm.html |
| 27 | Ansible Windows Intro (Ansible Official Docs) | https://docs.ansible.com/projects/ansible/latest/os_guide/intro_windows.html |
| 28 | Octopus Deploy Remote Tentacle Installation via Ansible (Third-party) | https://www.rootisgod.com/2020/Octopus-Deploy-Remote-Tentacle-Installation/ |
| 29 | GitLab CI/CD Tutorial — Octopus Deploy (Official) | https://octopus.com/devops/gitlab/gitlab-cicd-tutorial/ |
| 30 | Multi-environment Deployment Strategies (Official) | https://octopus.com/devops/software-deployments/multi-environment-deployments/ |
