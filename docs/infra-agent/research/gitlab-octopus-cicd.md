# GitLab Self-Managed CI/CD + Ansible + Octopus Deploy: Best-Practices Research

> **Scope.** Research to inform a Claude Code *infra agent* that manages a DevOps workflow built on
> **self-hosted GitLab CI/CD**, **Ansible**, and **Octopus Deploy**, in a **mixed Windows + Linux**
> environment. Target shop size: one DevOps engineer, ~**3 GitLab runners**, open to simplifying or
> replacing Octopus.
>
> **Currency.** Reflects GitLab 17.x / 18.x conventions (CI/CD Components GA in 17.0), Ansible
> `ansible-core` 2.18+ (experimental Windows SSH), Octopus 2024.x (Git triggers), and 2024–2026
> guidance. Citations inline and in [Sources](#9-sources).

---

## 1. GitLab CI/CD pipeline design for Ansible / IaC

### 1.1 Recommended stage progression

The community converges on a **lint → syntax → check/dry-run → molecule test → plan → deploy →
verify** progression. The key principle: **fail fast and cheap on the left**, gate expensive and
risky operations on the right. ([GitLab DevSecOps IaC blog][gl-iac], [Molecule CI docs][mol-ci],
[OneUptime: test Ansible roles with GitLab CI][ou-roles])

| Stage | Purpose | Typical tooling | Runs on |
|-------|---------|-----------------|---------|
| **lint** | Style, unsafe modules, best-practice violations; surface as Code Quality report | `ansible-lint`, `yamllint`, `pre-commit` | every MR |
| **syntax** | Parse playbooks/inventories | `ansible-playbook --syntax-check` | every MR |
| **check / dry-run** | Show *what would change* without applying | `ansible-playbook --check --diff` | every MR |
| **molecule test** | Converge + idempotence + verify a role in a throwaway container/VM | `molecule test` (Docker/Podman driver), matrix over scenarios/distros | every MR (role repos) |
| **plan** | For Terraform-fronted IaC: `terraform plan` artifact reviewed before apply | `terraform plan -out` | MR / pre-deploy |
| **deploy** | Apply against a real environment, gated by `environment:` + approvals | `ansible-playbook` (real inventory) | protected branch/tag, manual or approved |
| **verify** | Post-deploy smoke/health checks; the "did it actually work" gate | `ansible` ad-hoc, `--check` re-run for drift, app health probes | after deploy |

Notes that matter:

- **`--check --diff` is the reviewer's friend.** Run it on every MR so a human (and the agent) can
  read the would-be diff before approving. A second `--check` *after* deploy is a cheap **drift
  detector** for the verify stage. ([GitLab IaC blog][gl-iac])
- **Molecule + GitLab is a natural fit** because GitLab's Docker executor and Molecule's Docker
  driver compose cleanly; use a **parallel matrix** over scenarios/distros, `retry` for flaky
  converges, and `artifacts` to keep logs. ([Molecule CI docs][mol-ci],
  [OneUptime: Molecule with GitLab CI][ou-mol], [Whitlock/Medium][whitlock])
- **Execution Environments (EEs)** — containerized Ansible with collections/roles baked in — are the
  modern way to pin a reproducible Ansible toolchain for both CI and operators. Build the EE image
  once, reference it as the job `image:`. ([GitLab IaC blog][gl-iac])

### 1.2 `.gitlab-ci.yml` structure

- **Define `stages:` explicitly** in the documented order; keep each job's `stage:` accurate so the
  DAG reads top-to-bottom.
- **Use `workflow:` to control *whether a pipeline runs at all*** (e.g., run on MRs and on the
  default/protected branches, skip duplicate detached/branch pipelines), and **`rules:` to control
  *whether an individual job runs***. Prefer `rules:` over the legacy `only/except`.
- **Reusable structure via `extends:` + YAML anchors / `!reference`** for shared `before_script`,
  tags, and image; promote anything shared across repos to a **CI/CD Component** (§1.4).
- **`environment:` on deploy jobs** to register deployments, drive protected-environment rules, and
  produce a per-environment deployment history (audit value — §4).

### 1.3 Parent/child pipelines

- Use **child pipelines** (`trigger: include:`) to split a monorepo of many roles/stacks so each
  component gets an isolated sub-pipeline, and to keep the parent `.gitlab-ci.yml` readable.
- Use **dynamic child pipelines** (generate YAML in an early job, then `trigger` it) when the set of
  things to deploy is computed at runtime (e.g., "only the roles that changed").
- Reserve **multi-project pipelines** for cross-repo orchestration (app build repo → infra deploy
  repo).

### 1.4 Reusable CI components / templates

- **CI/CD Components** (GA in **GitLab 17.0**) are the current, preferred reuse mechanism — versioned,
  catalog-listed units with typed `spec:inputs:`. They supersede ad-hoc `include:` of raw templates.
  ([GitLab CI/CD components docs][gl-comp], [GitLab blog: refactor template→component][gl-comp-blog])
- Best practices: keep components **small and single-purpose**, make them **self-contained** (a
  component **cannot** use `spec:include`), pass behavior via **inputs**, and **release with semver**
  so consumers pin a version. ([GitLab components docs][gl-comp])
- Concrete pattern for this shop: author components like `ansible-lint`, `ansible-check`,
  `molecule-test`, `ansible-deploy` in a single internal "ci-components" project, version them, and
  `include:` them from every role/stack repo. This is the DRY backbone the agent should manage.

### 1.5 Environments, approvals, protected branches/tags

- **Protected environments** restrict who can deploy to e.g. `production`, and can **require manual
  approvals** before a deployment proceeds. ([Protected environments][gl-protenv],
  [Deployment approvals][gl-approvals])
- **Deployment approvals**: deployments are **blocked until all required approvals are given**;
  configure **multiple approval rules**, **approver groups** (must be invited to the project), and a
  **required count** per environment. A user gives **only one approval per deployment** even across
  multiple groups; by default the **pipeline triggerer cannot self-approve** (admin can opt in). After
  approval you **still manually run the job**. Approval history (who/when) is visible per deployment —
  direct audit value. ([Deployment approvals][gl-approvals])
- **Protected branches/tags** + **protected CI/CD variables**: production credentials live in
  protected variables that are only exposed on protected refs, so a feature branch can never read prod
  secrets. ([Deployment safety][gl-safety])

---

## 2. GitLab Runner architecture & security

### 2.1 Runner scopes

GitLab has three runner scopes ([Runners docs][gl-runners], [Runner scope][gl-scope]):

- **Instance (shared) runners** — available to every project; registered by admins. Highest
  convenience, **largest blast radius**.
- **Group runners** — shared across a group's projects.
- **Project (dedicated) runners** — bound to one project; smallest blast radius.

**Security principle: register at the lowest practical level** to minimize blast radius, and **require
tags** on all runners so jobs must explicitly opt in. ([Runner security][gl-runner-sec])

### 2.2 Tags route Windows vs Linux

**Tags are the only mechanism to filter which runner picks up a job.** Give each runner descriptive
tags and require them in jobs. ([Runners docs][gl-runners], [Runner security][gl-runner-sec])

```yaml
# Linux Ansible job
molecule-test:
  tags: [linux, docker]          # routed to the Linux Docker runner
# Windows-targeting job (e.g., build an MSI, run Pester, push a package)
windows-build:
  tags: [windows, shell]         # routed to the Windows shell/PowerShell runner
```

### 2.3 Executors

([Executors overview][gl-exec], [Shell executor][gl-shell], [Windows install][gl-win-install])

| Executor | Use it for | Security posture |
|----------|------------|------------------|
| **Docker** | Default for Linux CI (lint, syntax, molecule, ansible-playbook in an EE image) | Good — run **non-privileged, non-root**, drop SETUID/SETGID, `cap_drop` |
| **Docker Autoscaler / Instance** | Ephemeral, auto-scaled VMs via *fleeting*/*taskscaler* (AWS/GCP/Azure) | **Best** — one job per VM, destroyed after |
| **Shell** (Linux or **Windows/PowerShell**) | Windows jobs (no native Windows Docker for most needs), or host-level tasks | **Weakest** — runs as runner user, jobs share host; use only for trusted code on a host you own |
| **Kubernetes** | Larger shops with a cluster | Pod-per-job isolation |

**Maintenance-mode executors** (SSH, Shell, VirtualBox, Parallels, Custom) receive security fixes but
no new features — don't build new architecture on them where Docker/Autoscaler fit.

### 2.4 Hardening checklist (from GitLab's own guidance)

([Runner security][gl-runner-sec], [GitLab hardening][gl-hardening], plus
[PulseSecurity: attacking shared runners][pulse], [Cycode advisory][cycode])

- **Don't use privileged Docker-in-DinD** unless required; if you must, **dedicate** an **ephemeral**
  runner to it and run it **only on protected branches**.
- **Run Docker jobs non-root, non-privileged**; drop capabilities; set **`pull_policy: always`** on
  multi-tenant runners so users can't reach cached private images.
- **Network-segment runners**: block inbound SSH from the internet, restrict inter-runner traffic,
  **filter cloud metadata endpoints**.
- **Enable `FF_ENABLE_JOB_CLEANUP`**; avoid `GIT_STRATEGY: fetch` on shared hosts (code leakage
  between jobs).
- **Protected runners + protected variables + protected branches/environments** to fence who can
  deploy to prod.
- **Separate runners by trust level** — never let the same non-ephemeral runner serve both throwaway
  CI and production deploys.

### 2.5 Recommended **3-runner topology** for a small mixed Win/Linux shop

A deliberate split by **OS** and **trust level**. (Octopus, if kept, takes the actual app-deploy load
off the deploy runner — see §3.)

| # | Runner | Executor | Tags | Job classes | Trust / hardening |
|---|--------|----------|------|-------------|-------------------|
| **1** | **Linux CI runner** | **Docker** (non-priv, EE image) | `linux, docker, ci` | lint, yamllint, syntax, `--check --diff`, **molecule**, conftest/OPA | Untrusted MR code; ephemeral build dir, `pull_policy: always`, no prod secrets |
| **2** | **Linux deploy runner** | **Shell** (locked-down) or Docker w/ EE | `linux, deploy, ansible` | `ansible-playbook` against **real inventory** (Linux + Windows targets via WinRM/SSH), Terraform apply | **Protected** runner; only runs on protected branches/tags; holds prod creds / vault access; **manual+approval gated** |
| **3** | **Windows runner** | **Shell / PowerShell** | `windows, shell` | Windows-native build/test (MSBuild, Pester, package an MSI/NuGet), push package to Octopus / GitLab registry, optionally trigger Octopus | Windows host; trusted code only; do **not** mix with untrusted MR builds |

**Why this split:**

- **Runner 1** absorbs all untrusted contributor code in disposable containers and **never holds prod
  secrets** — this is the highest-risk surface, so it's the most isolated.
- **Runner 2** is the only runner with production reach; being **protected + approval-gated** means a
  feature branch can't deploy or read prod secrets. Ansible drives **both** Linux and Windows targets
  *from Linux* (control node is Linux — §5), so you don't need Windows for the *deploy* itself.
- **Runner 3** exists only because **Windows-native build steps** (compiling .NET, MSI/Pester) need a
  real Windows host; keep it small and trusted.

> If budget allows one upgrade: make Runner 1 a **Docker Autoscaler** (one ephemeral VM per job) for
> the strongest isolation on the untrusted surface. ([Executors overview][gl-exec])

---

## 3. GitLab + Octopus Deploy: integration, redundancy, and a decision framework

### 3.1 How teams wire GitLab CI → Octopus

([Octopus DevOps/GitLab][oct-gitlab], [Octopus Git triggers][oct-git-trig],
[Octopus project triggers][oct-proj-trig], [Liftric octopus-deploy plugin][liftric])

1. **Build & package in GitLab**, then **push the package** to the Octopus built-in feed (or a NuGet
   feed Octopus consumes), `octo`/`octopus` CLI or a community plugin.
2. **Push build information** (commit, work items, CI run URL) so Octopus release notes trace back to
   the GitLab pipeline. ([Liftric plugin][liftric])
3. **Create/promote a release** in Octopus from the GitLab job (CLI), or invert control with **Octopus
   Git triggers** (GA self-hosted in **2024.4**) that watch the repo and create releases on commit.
   ([Octopus Git triggers][oct-git-trig])
4. Octopus then runs the **deployment process** to its environments/tenants via **Tentacle** agents or
   SSH.

**Tradeoff of the integration itself:** two systems of record for "what shipped where." GitLab owns
build/test; Octopus owns release/deploy. You get Octopus's environment modeling, tenanting, and
deployment dashboards, at the cost of a second tool to license, patch, secure, and keep in sync.

### 3.2 When is Octopus *redundant* with GitLab environments + Ansible?

Octopus largely overlaps with **GitLab `environments:` + deployment approvals + Ansible** when:

- Your deploy is essentially **"run a playbook against an inventory"** — Ansible already does
  idempotent config + app deploy across Linux **and** Windows.
- You need **a handful of environments** (dev/stage/prod), not dozens of tenants.
- **Promotion = re-run the same playbook with a different inventory/vars**, which GitLab `environment:`
  + protected-environment **approvals** model cleanly (block-until-approved, audit history). (§1.5)
- Your release notes / build info needs are met by GitLab MRs, tags, and pipeline history.

In that world Octopus adds a parallel deployment engine that **duplicates** what Ansible already
expresses, plus a second approval/audit surface that **competes** with GitLab's. Industry comparisons
note GitLab CD is "repository-focused" and lighter on multi-tenancy / immutable release snapshots —
but for a 3-runner single-engineer shop those advanced features are often unused.
([Gartner GitLab vs Octopus][gartner], [PeerSpot][peerspot], [Octopus alternatives][oct-alts])

### 3.3 A *simplified* deploy story without Octopus

```
MR  ──▶  Runner 1 (Docker): lint → syntax → --check --diff → molecule
push protected branch/tag
      ──▶  Runner 3 (Windows): build .NET / package (MSI/NuGet) → GitLab Package Registry
      ──▶  Runner 2 (Linux deploy, PROTECTED):
              environment: staging   → ansible-playbook (auto)
              environment: production→ ansible-playbook (manual + required approvals)
                 ├─ Linux targets via SSH
                 └─ Windows targets via WinRM/Kerberos  (pulls package from GitLab registry)
      ──▶  verify: health checks + a re-run --check (drift = fail)
```

GitLab becomes the **single system of record**: one approval model, one audit trail, one set of
secrets, fewer moving parts to patch — a real win for a one-person team.

### 3.4 When keeping Octopus *is* justified

Keep Octopus when one or more is true ([Octopus DevOps/GitLab][oct-gitlab],
[Octopus alternatives][oct-alts], [Inedo vs Octopus][inedo]):

- **Heavy Windows / .NET app deployment** where **Tentacle agents** + Octopus's IIS/Windows-service/
  config-transform steps and **built-in rollback** already work and the team trusts them.
- **Many tenants / many environments** (multi-tenant SaaS, per-customer deploys) — Octopus's
  multi-tenancy and **immutable release snapshots** are genuinely hard to replicate in raw GitLab CD.
- **Complex release orchestration**: manual interventions, scheduled/blackout windows, environment
  promotion matrices, fine-grained deployment-target dashboards.
- A **large, stable existing Octopus install** — ripping it out is its own risky project.

### 3.5 Octopus keep-vs-drop decision framework

| Signal | Lean **DROP** (GitLab env + Ansible) | Lean **KEEP** Octopus |
|--------|--------------------------------------|------------------------|
| # of environments | ~2–4 (dev/stage/prod) | Many / per-tenant |
| Tenancy | Single-tenant | Multi-tenant, per-customer |
| Deploy shape | "run a playbook" (idempotent) | App-server orchestration, IIS/service/config-transforms |
| Windows app deploy | Ansible-managed (WinRM) is enough | Deep Tentacle + Windows step library in use |
| Rollback/snapshots | Re-run prior tag's playbook is acceptable | Need immutable release snapshots + 1-click rollback |
| Team size / ops budget | 1 engineer, minimize tools | Team that can own a 2nd platform |
| Existing investment | Greenfield / small Octopus | Large, battle-tested Octopus install |
| Audit model | Want **one** trail in GitLab | Octopus audit already accepted by auditors |

**Recommendation for *this* shop (1 engineer, ~3 runners, mixed OS, open to simplifying):**
**Drop Octopus and consolidate on GitLab `environments:` + deployment approvals + Ansible**, *unless*
there is a non-trivial existing Octopus footprint doing complex Windows app orchestration that Ansible
can't cheaply replace. The operational simplicity, single audit trail, and one secret store outweigh
Octopus's advanced features at this scale. If Windows app deploys are the only thing pinning Octopus,
pilot moving one app to **Ansible-over-WinRM (Kerberos)** first; if that proves out, retire Octopus.

---

## 4. Auditing, compliance & policy-as-code

Goal: a pipeline whose every change and deploy produces an **audit trail an auditor will accept**.

### 4.1 GitLab-native audit & compliance

- **Audit events** track who changed permissions, settings, approvals, and more — exportable as audit
  reports for assessors. ([Audit events][gl-audit], [Compliance features][gl-compliance-admin])
- **Compliance frameworks** apply labeled control sets to projects; controls are checks against project
  config/behavior and map to standards. ([Compliance frameworks][gl-frameworks],
  [Compliance standards][gl-standards])
- **Compliance pipelines are deprecated** — migrate to **pipeline execution policies / compliance
  frameworks** for enforcing required jobs (e.g., "every project must run the security scan").
  ([Compliance pipelines (deprecated)][gl-comp-pipe])
- **Protected environments + deployment approvals** give a per-deployment record of *who approved what*
  — core audit evidence. (§1.5)
- **Signed commits**: enforce GPG/SSH/X.509 commit signing and **push rules** so only verified commits
  enter protected branches → provenance for every change.

### 4.2 Policy-as-code in the pipeline

- **OPA + Conftest** in CI to validate IaC/config (HCL, JSON, YAML) against Rego policies; Conftest is
  the better fit for parsing IaC committed to git. Fail the pipeline on policy violation.
  ([OPA in CI/CD][opa-cicd], [NashTech GitLab OPA/Conftest template][nashtech])
- **ansible-lint as policy**: run in `--strict` with a pinned ruleset / production profile so style and
  unsafe-module rules are *enforced*, not advisory; emit a Code Quality report. ([GitLab IaC blog][gl-iac])
- **CIS benchmarks**: scan the GitLab instance/projects with the **CIS GitLab Benchmark scanner
  (`gitlabcis`)**; apply CIS hardening to runner hosts and managed servers (Ansible can both enforce
  and report CIS state). ([CIS GitLab benchmark scanner][gl-cis], [GitLab hardening][gl-hardening])

### 4.3 The audit trail, end to end

1. **Signed commit** on a feature branch (provenance).
2. **MR** with required reviewers + green pipeline (lint, conftest, molecule, `--check` diff attached).
3. Merge to **protected branch**; **protected CI/CD variables** gate prod secrets.
4. Deploy job targets a **protected environment** → **required approvals** recorded (who/when).
5. **Deployment + environment history** + **pipeline artifacts/logs** retained.
6. **Audit events** capture config/permission changes; **CIS scans** + **compliance framework**
   controls evidence the guardrails were in place.

That chain — signed change → reviewed → policy-checked → approved → recorded — is what an auditor wants.

---

## 5. Windows in this stack

### 5.1 Ansible managing Windows — current (2024–2026) approach

([Ansible: managing Windows][ans-win], [Ansible WinRM][ans-winrm], [Ansible Windows SSH][ans-ssh],
[Ansible Windows FAQ][ans-faq], [BuildingTents: Kerberos WinRM][bt-krb], [ATIX: WinRM auth][atix])

- **Control node must be Linux** (Ansible can't run its controller on Windows). Your **Linux deploy
  runner (#2)** is the control node for Windows targets — no Windows runner needed for *deploys*.
- **Transport choice:**
  - **Domain-joined → WinRM with Kerberos** (over HTTP is fine with Kerberos message encryption, or
    WinRM-over-HTTPS). **Preferred** in AD environments. ([Ansible WinRM][ans-winrm], [BuildingTents][bt-krb])
  - **Local/non-domain accounts → Basic/NTLM over HTTPS** (TLS on the WinRM listener).
  - **CredSSP → avoid unless you truly need the double-hop**; it uses unconstrained delegation and is a
    security risk. ([Ansible WinRM][ans-winrm])
  - **`psrp` connection plugin** is the modern alternative to `winrm` (still over WinRM): faster for
    large payloads, more auth options. Prefer `psrp` over `winrm` for new setups.
  - **SSH for Windows** is **experimental** (official since `ansible-core` 2.18) and effectively needs
    **Windows Server 2022+** (OpenSSH ≥ 7.9); **not recommended for production yet**, and it can't
    fetch a Kerberos TGT from a username/password. ([Ansible Windows SSH][ans-ssh])
- **Use TLS on the WinRM listener** regardless — it works with all auth options. ([Ansible WinRM][ans-winrm])
- Use the **`ansible.windows`** and **`microsoft.ad`** collections for Windows host + AD management.

**Net recommendation:** AD-joined Windows → **WinRM + Kerberos (or `psrp`)** with TLS listeners, driven
from the Linux deploy runner. Hold off on SSH-for-Windows in production until it matures.

### 5.2 GitLab Windows runners

- Install GitLab Runner on Windows and register a **shell (PowerShell)** executor — there's no
  first-class Windows Docker path for most workloads. ([Windows install][gl-win-install],
  [Shell executor][gl-shell])
- Use the Windows runner **only for Windows-native build/test/package** (MSBuild, Pester, MSI/NuGet),
  not for the deploy itself. Keep it **trusted** (shell executor = weak isolation) and tag it
  `windows`.

### 5.3 Octopus tentacles vs Ansible for Windows apps

- **Octopus Tentacle** is a purpose-built Windows deploy agent with a rich step library (IIS,
  Windows services, config transforms, certificates) and **built-in rollback** — strong where complex
  Windows **application** deployment is the core problem. ([Octopus DevOps/GitLab][oct-gitlab])
- **Ansible-over-WinRM** covers config management + app deploy idempotently and keeps you on **one
  tool** for Linux + Windows. For straightforward Windows app/config deploys at this shop's scale,
  Ansible is usually sufficient; reserve Tentacle for genuinely complex Windows orchestration (§3.4).

---

## 6. Concrete recommended 3-runner topology (summary)

```
┌─ Runner 1: Linux CI ───────────────┐   tags: linux,docker,ci
│  Docker executor (non-priv, EE img)│   lint · syntax · check/diff · molecule · conftest/OPA
│  Untrusted MR code · NO prod secrets│  (upgrade path: Docker Autoscaler = 1 VM/job)
└────────────────────────────────────┘

┌─ Runner 2: Linux DEPLOY (PROTECTED)┐   tags: linux,deploy,ansible
│  Shell (locked) or Docker+EE        │   ansible-playbook → Linux (SSH) + Windows (WinRM/Kerberos)
│  Protected branch/tag only          │   Terraform apply · manual + required approvals
│  Holds prod creds / Vault access    │   = the ONLY runner with production reach
└────────────────────────────────────┘

┌─ Runner 3: Windows ────────────────┐   tags: windows,shell
│  Shell / PowerShell executor        │   MSBuild · Pester · package MSI/NuGet → GitLab registry
│  Trusted Windows-native build only  │   (optionally trigger Octopus, if kept)
└────────────────────────────────────┘
```

Routing is by **tags**; isolation is by **OS + trust level**; production reach is fenced to the single
**protected, approval-gated** deploy runner.

---

## 7. Octopus keep-vs-drop framework (summary)

Use the table in §3.5. **Default for this shop: DROP Octopus**, consolidate on **GitLab
`environments:` + deployment approvals + Ansible** for one audit trail and one secret store. **KEEP
Octopus** only if there's substantial existing Windows-app orchestration (Tentacle + IIS/service step
library + rollback) or multi-tenant release management that Ansible can't cheaply replace. If Windows
is the only blocker, **pilot one app on Ansible-over-WinRM (Kerberos)** before committing to retire.

---

## 8. Implications for the infra agent's design

- **Own the CI/CD Components** (`ansible-lint`, `ansible-check`, `molecule-test`, `ansible-deploy`) as
  the DRY backbone; version + release them.
- **Generate `.gitlab-ci.yml`** with explicit `stages:`, `workflow:` rules, `environment:` on deploys,
  and tag-correct jobs (never let a deploy land on an untrusted runner).
- **Enforce the guardrails**: protected branches/tags, protected variables, protected environments +
  approvals, signed commits, conftest/ansible-lint gates.
- **Default to the simplified GitLab+Ansible deploy story**; treat Octopus as opt-in behind the §3.5
  framework.
- **Windows = Linux control node + WinRM/Kerberos (or psrp)**; Windows runner only for native builds.

---

## 9. Sources

GitLab — CI/CD & Ansible/IaC
- [GitLab DevSecOps IaC with Ansible blog][gl-iac]
- [Ansible Molecule — Continuous Integration][mol-ci]
- [OneUptime — Test Ansible Roles with GitLab CI][ou-roles]
- [OneUptime — Molecule with GitLab CI][ou-mol]
- [Keir Whitlock — Molecule + GitLab CI (Medium)][whitlock]
- [GitLab CI/CD Components docs][gl-comp]
- [GitLab blog — Refactor template → component][gl-comp-blog]

GitLab — Runners & security
- [GitLab Runner docs][gl-runners]
- [Runner scope (instance/group/project)][gl-scope]
- [Executors overview][gl-exec]
- [Shell executor][gl-shell]
- [Install GitLab Runner on Windows][gl-win-install]
- [GitLab Runner security][gl-runner-sec]
- [GitLab instance hardening][gl-hardening]
- [PulseSecurity — Attacking GitLab CI/CD via shared runners][pulse]
- [Cycode — GitLab malicious runner advisory][cycode]

GitLab — Environments, approvals, compliance
- [Protected environments][gl-protenv]
- [Deployment approvals][gl-approvals]
- [Deployment safety][gl-safety]
- [Audit events][gl-audit]
- [Compliance features for administrators][gl-compliance-admin]
- [Compliance frameworks][gl-frameworks]
- [Compliance standards][gl-standards]
- [Compliance pipelines (deprecated)][gl-comp-pipe]
- [CIS GitLab Benchmark scanner (gitlabcis)][gl-cis]

Policy-as-code
- [OPA in CI/CD][opa-cicd]
- [NashTech — GitLab OPA/Conftest policy-as-code template][nashtech]

Octopus & comparisons
- [Octopus — GitLab CI/CD explained][oct-gitlab]
- [Octopus — Git triggers blog][oct-git-trig]
- [Octopus — Project triggers docs][oct-proj-trig]
- [Liftric octopus-deploy plugin (build-info/packages)][liftric]
- [Octopus — 8 Octopus Deploy alternatives (2025)][oct-alts]
- [Gartner Peer Insights — GitLab vs Octopus][gartner]
- [PeerSpot — GitLab vs Octopus][peerspot]
- [Inedo BuildMaster vs Octopus][inedo]

Ansible + Windows
- [Ansible — Managing Windows hosts][ans-win]
- [Ansible — Windows Remote Management (WinRM)][ans-winrm]
- [Ansible — Windows SSH][ans-ssh]
- [Ansible — Windows FAQ][ans-faq]
- [BuildingTents — Kerberos WinRM for Ansible][bt-krb]
- [ATIX — WinRM & Ansible auth/encryption][atix]

<!-- link refs -->
[gl-iac]: https://about.gitlab.com/blog/using-ansible-and-gitlab-as-infrastructure-for-code/
[mol-ci]: https://docs.ansible.com/projects/molecule/ci/
[ou-roles]: https://oneuptime.com/blog/post/2026-02-21-ansible-test-roles-gitlab-ci/view
[ou-mol]: https://oneuptime.com/blog/post/2026-02-21-molecule-gitlab-ci/view
[whitlock]: https://medium.com/@keirwhitlock/use-molecule-gitlab-ci-to-automate-testing-of-ansible-roles-9d745cd89db1
[gl-comp]: https://docs.gitlab.com/ci/components/
[gl-comp-blog]: https://about.gitlab.com/blog/2024/03/04/refactoring-a-ci-cd-template-to-a-ci-cd-component/
[gl-runners]: https://docs.gitlab.com/ci/runners/
[gl-scope]: https://docs.gitlab.com/ci/runners/runners_scope/
[gl-exec]: https://docs.gitlab.com/runner/executors/
[gl-shell]: https://docs.gitlab.com/runner/executors/shell/
[gl-win-install]: https://docs.gitlab.com/runner/install/windows/
[gl-runner-sec]: https://docs.gitlab.com/runner/security/
[gl-hardening]: https://about.gitlab.com/security/hardening/
[pulse]: https://pulsesecurity.co.nz/articles/OMGCICD-gitlab
[cycode]: https://cycode.com/blog/security-advisory-gitlab-malicious-runner-vulnerability/
[gl-protenv]: https://docs.gitlab.com/ci/environments/protected_environments/
[gl-approvals]: https://docs.gitlab.com/ci/environments/deployment_approvals/
[gl-safety]: https://docs.gitlab.com/ci/environments/deployment_safety/
[gl-audit]: https://docs.gitlab.com/user/compliance/audit_events/
[gl-compliance-admin]: https://docs.gitlab.com/administration/compliance/compliance_features/
[gl-frameworks]: https://docs.gitlab.com/user/compliance/compliance_frameworks/
[gl-standards]: https://docs.gitlab.com/user/compliance/compliance_frameworks/compliance_standards/
[gl-comp-pipe]: https://docs.gitlab.com/user/compliance/compliance_pipelines/
[gl-cis]: https://gitlab.com/gitlab-security-oss/cis/gitlabcis
[opa-cicd]: https://www.openpolicyagent.org/docs/cicd
[nashtech]: https://github.com/NashTech-Labs/gitlab_policy_as_code_template
[oct-gitlab]: https://octopus.com/devops/gitlab/
[oct-git-trig]: https://octopus.com/blog/introducing-git-triggers
[oct-proj-trig]: https://octopus.com/docs/projects/project-triggers
[liftric]: https://github.com/Liftric/octopus-deploy-plugin
[oct-alts]: https://octopus.com/devops/continuous-deployment/octopus-deploy-alternatives/
[gartner]: https://www.gartner.com/reviews/market/application-release-orchestration-solutions/compare/gitlab-vs-octopus-deploy
[peerspot]: https://www.peerspot.com/products/comparisons/gitlab_vs_octopus-deploy
[inedo]: https://inedo.com/buildmaster/vs-octopus-deploy
[ans-win]: https://docs.ansible.com/ansible/latest/os_guide/intro_windows.html
[ans-winrm]: https://docs.ansible.com/projects/ansible/latest/os_guide/windows_winrm.html
[ans-ssh]: https://docs.ansible.com/projects/ansible/latest/os_guide/windows_ssh.html
[ans-faq]: https://docs.ansible.com/projects/ansible/8/os_guide/windows_faq.html
[bt-krb]: https://buildingtents.com/2025/01/15/using-kerberos-to-authenticate-winrm-for-ansible/
[atix]: https://atix.de/en/blog/winrm-ansible-wege-der-authentifizierung-und-verschluesselung/
