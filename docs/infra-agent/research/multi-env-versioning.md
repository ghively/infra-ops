# Multi-Environment Management, Versioning, and Promotion
## Ansible + Self-Hosted GitLab CI/CD (+ Octopus Deploy) — Research Report

> **Date:** 2026-06-03  
> **Scope:** Dev / Test / (Staging) / Prod IaC workflows  
> **Stack:** Ansible, self-hosted GitLab, Octopus Deploy

---

## Table of Contents

1. [Environment Separation & Parity](#1-environment-separation--parity)
2. [GitLab Environments & Deployments](#2-gitlab-environments--deployments)
3. [Branching Strategy for IaC](#3-branching-strategy-for-iac)
4. [Versioning](#4-versioning)
5. [Promotion Workflow](#5-promotion-workflow)
6. [Config & Secret Handling Across Environments](#6-config--secret-handling-across-environments)
7. [Recommended Model: Branching + Promotion Diagram](#7-recommended-model)
8. [Versioning Policy Summary](#8-versioning-policy-summary)
9. [Sources](#9-sources)

---

## 1. Environment Separation & Parity

### 1.1 The 12-Factor App Principle Applied to IaC

The Twelve-Factor methodology mandates that "dev/staging/production parity" be maintained by keeping the gap between environments as small as possible — in time, personnel, and tools. For IaC this translates to: **the same playbooks run in every environment; only the inventory and variable values change.** Differences in playbook logic between envs are a code smell indicating drift.

### 1.2 Inventory-as-Directory Pattern

Ansible supports consolidating multiple inventory sources in a single directory. The official guidance states: "The simplest version of this approach is a directory with multiple files instead of a single inventory file." Files in the directory are processed alphabetically, and numeric prefixes (`01-`, `02-`) control precedence. [[Ansible Inventory Docs]](https://docs.ansible.com/projects/ansible/latest/inventory_guide/intro_inventory.html)

**Canonical structure (DigitalOcean / Ansible-community recommended):**

```
ansible/
├── ansible.cfg                   # inventory = ./environments/dev (safe default)
├── environments/
│   ├── 000_cross_env_vars        # shared variables symlinked into each env
│   ├── dev/
│   │   ├── hosts                 # INI or YAML inventory
│   │   └── group_vars/
│   │       ├── all/
│   │       │   ├── 000_cross_env_vars -> ../../../000_cross_env_vars
│   │       │   └── env_specific.yml
│   │       ├── web.yml
│   │       └── db.yml
│   ├── test/
│   │   ├── hosts
│   │   └── group_vars/ ...
│   ├── staging/                  # optional
│   │   ├── hosts
│   │   └── group_vars/ ...
│   └── prod/
│       ├── hosts
│       └── group_vars/ ...
├── roles/
├── collections/
│   └── requirements.yml          # pinned versions
└── site.yml
```

Each environment directory is its own self-contained inventory source. You invoke a specific environment with `-i environments/prod`. Setting `inventory = ./environments/dev` in `ansible.cfg` prevents accidental prod runs from a developer's workstation. [[DigitalOcean Multi-Stage Guide]](https://www.digitalocean.com/community/tutorials/how-to-manage-multistage-environments-with-ansible)

### 1.3 Variable Precedence & Layering

Ansible variable precedence from lowest to highest: `all` group → parent groups → child groups → individual hosts. A child group's variables override a parent group's variables. [[Ansible Inventory Docs]](https://docs.ansible.com/projects/ansible/latest/inventory_guide/intro_inventory.html)

**Recommended layering pattern:**

| Layer | File | Purpose |
|-------|------|---------|
| Universal defaults | `environments/000_cross_env_vars` | Shared across all envs (org name, DNS domain, NTP) |
| Env-level defaults | `environments/<env>/group_vars/all/env_specific.yml` | Env-specific overrides (DB endpoint, log level) |
| Group vars | `environments/<env>/group_vars/<group>.yml` | Role/function variables (web, db) |
| Host vars | `environments/<env>/host_vars/<host>.yml` | Per-host exceptions |

The `ansible_group_priority` variable can override alphabetical merge order within a level: higher numbers load later and win. [[Ansible Inventory Docs]](https://docs.ansible.com/projects/ansible/latest/inventory_guide/intro_inventory.html)

### 1.4 Avoiding Env-Specific Drift

**Key practices:**

- **Playbooks must be environment-agnostic.** No `when: env == 'prod'` logic in playbooks; push all env-specific differences into variables. [[Ansible Best Practices 2025 — gocodeo]](https://www.gocodeo.com/post/ansible-in-2025-best-practices-for-configuration-and-provisioning)
- **Intentional duplication in variable files is acceptable** — it enables staged rollouts (change dev vars first, test, then promote the same change to prod). [[DigitalOcean Multi-Stage Guide]](https://www.digitalocean.com/community/tutorials/how-to-manage-multistage-environments-with-ansible)
- **Version-control inventories.** The official guidance states: "keep your inventory sources and their relative variable directories and files in a Git repository." [[Ansible Inventory Docs]](https://docs.ansible.com/projects/ansible/latest/inventory_guide/intro_inventory.html)
- **Drift detection.** IaC drift occurs when the infrastructure's current state doesn't align with the coded configuration. Mitigations include automated state audits, locking state files during updates, and reconciliation jobs in CI. [[Snyk IaC Drift Detection]](https://snyk.io/articles/infrastructure-as-code-iac/detect-prevent-configuration-drift/)
- **Dynamic inventories** (aws_ec2, azure_rm, gcp_compute plugins) eliminate stale static hosts and are the 2025 standard for cloud environments. [[Ansible Best Practices 2025]](https://www.gocodeo.com/post/ansible-in-2025-best-practices-for-configuration-and-provisioning)

---

## 2. GitLab Environments & Deployments

### 2.1 The `environment:` Keyword

Declaring `environment: name: production` (or `development`, `test`, `staging`) in a `.gitlab-ci.yml` job registers that deployment in GitLab's environment tracking. This creates an auditable deployments list per environment, showing which commit/pipeline/user deployed to each environment and when. [[GitLab Environments Docs]](https://docs.gitlab.com/ci/environments/)

```yaml
deploy_prod:
  stage: deploy
  environment:
    name: production
    url: https://prod.example.com
  script:
    - ansible-playbook -i environments/prod site.yml
  rules:
    - if: $CI_COMMIT_TAG =~ /^v\d+\.\d+\.\d+$/
```

### 2.2 Protected Environments

Protected environments restrict who may deploy to a named environment. Configuration is under **Settings > CI/CD > Protected environments**. The access control model allows specifying:

- **Allowed to deploy:** roles (Maintainer, Developer), specific groups, or individual users with Developer+ roles
- **Required approvers:** users or groups who must approve before the deployment proceeds

Key capabilities: [[GitLab Protected Environments Docs]](https://docs.gitlab.com/ci/environments/protected_environments/)

- **Group-level protection** — operators can enforce environment protections across multiple projects using deployment tiers (e.g., all `production`-tier envs across a group namespace), cascading down as read-only to child projects.
- **Deployment-only access** — users with this role cannot stop, delete, or modify environment settings; they can only execute deployment jobs.
- **API-driven setup** — protection can be configured programmatically via the GitLab REST API.

> **Important caveat:** Protected environments and deployment approvals are available at **Premium tier and above**. When granting approval rights to a group, the configuring user must be a direct member of that group for it to appear in the dropdown. [[GitLab Deployment Approvals Docs]](https://docs.gitlab.com/ci/environments/deployment_approvals/)

### 2.3 Deployment Approvals & Gates

Deployment approval rules block deployment jobs until required approvals are granted. Behavior:

- All jobs deploying to the protected environment are **blocked** and wait for approval before running.
- A user can grant only **one approval per deployment**, even across multiple approver groups.
- **Self-approval is disabled by default** — the pipeline triggerer cannot approve their own deployment.
- "Deployment approval doesn't automatically start the corresponding deployment job" — manual execution is still required after approval. [[GitLab Deployment Approvals Docs]](https://docs.gitlab.com/ci/environments/deployment_approvals/)

This creates a documented approval record: the UI shows who approved, rejection history, blocking status, and the count of required vs. granted approvals.

### 2.4 Environment-Scoped CI/CD Variables

Variables in **Settings > CI/CD > Variables** can be scoped to a specific environment by name (e.g., `production`, `test`), or to a wildcard pattern (`staging/*`). The official guidance recommends using **protected variables on protected environments** to prevent unintended credential exposure. [[GitLab Deployment Safety Docs]](https://docs.gitlab.com/ci/environments/deployment_safety/)

Pattern: scope `DEPLOY_SSH_KEY` only to `production`, and a different `DEPLOY_SSH_KEY` to `test` — the runner receives only the variable matching its environment context.

### 2.5 Dynamic vs. Static Environments

- **Static environments** (`production`, `test`, `staging`) have fixed names and are the correct model for permanent, long-lived infrastructure.
- **Dynamic environments** use CI variables to create per-branch/per-MR environments (e.g., `review/$CI_COMMIT_REF_SLUG`) for ephemeral testing — useful for application feature testing but generally not for core IaC promotion workflows.

### 2.6 Auditable Promotion Record

Every deployment to an environment with the `environment:` keyword is recorded in GitLab with: pipeline ID, commit SHA, triggered-by user, timestamp, approval history (if applicable), and environment URL. This constitutes an immutable audit trail mapping every production state change to a specific commit and approver. [[GitLab Deployment Approvals Docs]](https://docs.gitlab.com/ci/environments/deployment_approvals/)

### 2.7 Concurrent Deployment Prevention

The `resource_group` keyword in `.gitlab-ci.yml` ensures deployment jobs to the same environment execute sequentially, preventing race conditions where multiple pipelines attempt simultaneous deploys. The **Prevent outdated deployment jobs** setting stops an older pipeline from overwriting a newer deployment. [[GitLab Deployment Safety Docs]](https://docs.gitlab.com/ci/environments/deployment_safety/)

---

## 3. Branching Strategy for IaC

### 3.1 Why Standard Git Branching Doesn't Directly Map to IaC

AWS Prescriptive Guidance notes that "Git methodology is not directly compatible with common infrastructure design patterns." The classic trunk-based problem for IaC: two features merged to `develop`, one blocked from promotion by a risk criterion — both are now frozen. This is the **feature-coupling trap** that plagues environment-branch strategies. [[AWS Branching Strategies]](https://docs.aws.amazon.com/prescriptive-guidance/latest/designing-a-devsecops-mechanism/branching-strategies.html)

### 3.2 Comparison of Strategies

| Strategy | How It Works | IaC Pros | IaC Cons |
|----------|-------------|----------|----------|
| **Trunk-based + env dirs** | Single `main` branch; per-env config in subdirectories; feature branches merge to `main` | DRY; single source of truth; no merge hell; easy rollback via single revert | Requires discipline; all envs change simultaneously unless gated by pipeline logic |
| **Environment branches** | `env/dev`, `env/test`, `env/prod` branches; cherry-pick or PR promotes changes upward | Independent env changes; explicit promotion via PR; maps naturally to different env configs | Merge history complexity; divergence over time; "works in dev, fails in prod" from branch drift [[NTT DATA IaC Branching]](https://us.nttdata.com/en/blog/2021/july/best-iac-branching-strategies) |
| **GitLab Flow** | `main` + long-lived `pre-production`, `production` branches; merges flow downward | Familiar; integrates with GitLab environments | Long-lived branches still diverge; requires careful merge-forward discipline |
| **Release branches** | Tagged release cut from `main`; deployed by tag | Clean artifact-to-tag mapping; immutable references | Overhead for frequent infra changes; no easy "promote this hotfix only" |

### 3.3 Trunk-Based + Directory-Based (Recommended for IaC)

Liatrio's GitOps analysis concludes that trunk-based GitOps solves environment drift among environments by "allowing changes against all environments in a single change request," creating a single source of truth. Problems solved include code duplication across branches, environment drift from branch discrepancies, and multiple sources of truth. [[Liatrio Trunk-Based GitOps]](https://www.liatrio.ai/resources/blog/trunk-based-gitops)

**The solution to the feature-coupling trap** (from AWS Prescriptive Guidance) is directory-based environment isolation within a single branch — the most common industry solution: separate `./environments/<env>/` directories in the repo, so environments are decoupled even though they live on the same branch. [[AWS Branching Strategies]](https://docs.aws.amazon.com/prescriptive-guidance/latest/designing-a-devsecops-mechanism/branching-strategies.html)

Promotion in this model is **pipeline-driven, not branch-driven**: the CI pipeline detects which environment directory changed and applies it to the appropriate environment, with manual gates before prod.

### 3.4 Branch Protection + CODEOWNERS for Separation of Duties

Regardless of strategy, merge to `main` (or environment branches) should require:

- **Protected branch rules:** require MR (no direct push to `main`), require CI to pass, require N approvals.
- **CODEOWNERS:** map `environments/prod/**` to a `@ops-team` group with required review. This enforces that production variable/inventory changes must be reviewed by an operator before merging.
- **Separation of duties:** pipeline triggerer cannot self-approve deployment (GitLab default). [[GitLab Deployment Approvals Docs]](https://docs.gitlab.com/ci/environments/deployment_approvals/)

```
# .gitlab/CODEOWNERS
environments/prod/**        @your-org/ops-team
environments/staging/**     @your-org/platform-team
roles/**                    @your-org/platform-team
```

### 3.5 NTT DATA Decision Framework

NTT DATA identifies four factors for choosing a strategy: [[NTT DATA IaC Branching]](https://us.nttdata.com/en/blog/2021/july/best-iac-branching-strategies)

1. **Infrastructure change frequency** — high frequency → trunk-based
2. **Deployment duration** — long deploys → trunk-based (avoids blocking)
3. **Infrastructure-application coupling** — tightly coupled → align with app branching (Gitflow-adjacent)
4. **Independent update capability** — independent IaC repo → trunk-based or environment-based

For Ansible + GitLab with separate IaC repo and frequent changes: **trunk-based with env directories** wins on all four dimensions.

---

## 4. Versioning

### 4.1 SemVer for Ansible Roles and Collections

Ansible collections **MUST** adhere to Semantic Versioning 2.0.0: [[Ansible Collection Releasing Docs]](https://docs.ansible.com/projects/ansible/latest/community/collection_contributors/collection_releasing.html) [[Red Hat Certified Collections Versioning]](https://access.redhat.com/articles/4993781)

- **MAJOR** (`X.0.0`): incompatible API changes, argspec modifications, plugin removal, breaking behavior changes
- **MINOR** (`x.Y.0`): new features or functionality, deprecation notices — backward-compatible
- **PATCH** (`x.y.Z`): bug fixes and security fixes only — no new features, no deprecations

Red Hat's policy for certified collections: the first GA version is `1.0.0`. Pre-GA versions use hyphenated notation (`2.0.0-rc.1`). Feature releases (FR) target a 4-week cadence. Maintenance Releases (MR) are designated approximately every 18 months and receive only bug/security fixes for 24 months.

### 4.2 Version Pinning in `requirements.yml`

Ansible does not have a native lock file mechanism. The community guidance is to **always pin exact versions** for reproducible builds: [[Ansible GitHub Issue #68194]](https://github.com/ansible/ansible/issues/68194)

```yaml
# collections/requirements.yml
---
collections:
  - name: ansible.posix
    version: "1.5.4"           # exact pin — preferred for production
  - name: community.general
    version: ">=7.0.0,<8.0.0"  # version range — acceptable for dev
  - name: community.crypto
    version: "2.15.1"

roles:
  - name: geerlingguy.mysql
    version: "3.3.3"
  - name: geerlingguy.nginx
    version: "3.1.0"
    src: https://github.com/geerlingguy/ansible-role-nginx
```

Version constraint syntax supports `>=`, `<=`, `!=`, `>`, `<`, and comma-separated AND logic. Exact pins (`"1.5.4"`) are the safest for CI/CD pipelines. [[Ansible community collection requirements docs]](https://docs.ansible.com/projects/ansible/latest/community/collection_contributors/collection_requirements.html)

**Python/module dependencies** should also be pinned in a `requirements.txt` or in the Ansible Execution Environment (EE) definition:

```yaml
# execution-environment.yml
dependencies:
  python: requirements.txt   # pins boto3==1.34.0, etc.
  galaxy: collections/requirements.yml
  system: bindep.txt
```

### 4.3 Build Once, Promote the Same Immutable Artifact

The Octopus/Codefresh enterprise CI/CD guidance is unequivocal: **"Artifacts, not Git commits, should travel within a pipeline."** Building once ensures that what is tested is exactly what is deployed. Rebuilding at each stage introduces two risks: extended pipeline duration and loss of guarantee that production matches what was tested. [[Octopus Enterprise CI/CD Best Practices]](https://octopus.com/blog/enterprise-ci-cd-best-practices-1)

For Ansible, "build once" means:

1. **On commit/MR:** run `ansible-galaxy collection install -r requirements.yml` once, bundle the resolved roles/collections + playbooks into a versioned artifact (tarball, container image, or GitLab Package Registry entry) tagged with `$CI_COMMIT_SHA`.
2. **On release tag (`vX.Y.Z`):** retag/promote that exact artifact — do not reinstall or rebuild.
3. **Across environments:** dev, test, staging, and prod all execute the same artifact with only the `-i environments/<env>` flag changing.

**Artifact promotion strategies** (per CI/CD best practice sources): [[Build Once Deploy Many — Medium]](https://medium.com/@aslam.develop912/build-once-deploy-many-the-core-ci-cd-principle-youre-probably-missing-d9fcdc34a854)

- **Tag-based:** the artifact stays in one registry/store but receives new tags as it advances (`sha-abc123` → `v1.2.3-test-passed` → `v1.2.3-prod`). Simpler but requires careful tag management.
- **Registry-based:** artifact moves between isolated registries (dev-registry → prod-registry). Stronger isolation and access control; more infrastructure overhead.

Use **content digests** (SHA-256), not just tags, when referencing container-based EEs — tags can be overwritten, digests cannot. [[Build Once Deploy Many — Medium]](https://medium.com/@aslam.develop912/build-once-deploy-many-the-core-ci-cd-principle-youre-probably-missing-d9fcdc34a854)

### 4.4 Git Tags as Release Anchors

Tag the commit that produced the artifact with the release version:

```bash
git tag -a v1.2.3 -m "Release 1.2.3: add nginx TLS hardening role"
git push origin v1.2.3
```

GitLab pipeline triggers on tag pattern `v*.*.*` then promotes the artifact without rebuilding. The tag is the immutable reference that links: commit SHA → artifact digest → deployment record → audit trail.

### 4.5 Playbook Versioning

Playbooks themselves live in the Git repo and are versioned by commit SHA / tag. There is no separate SemVer for individual playbooks — the repo tag covers the whole playbook suite. Changes to playbooks that would break existing callers (renamed variables, removed tasks) warrant a MAJOR version bump on the collection/repo.

---

## 5. Promotion Workflow

### 5.1 The Ideal Flow: Dev → Test → (Staging) → Prod

```
commit to feature branch
        │
        ▼
   [CI: lint + syntax check + molecule test]
        │
   merge to main
        │
        ▼
   [pipeline: build artifact tagged $CI_COMMIT_SHA]
        │
        ▼
   GATE 0: automated checks pass (lint, syntax, unit tests)
        │
        ▼
   auto-deploy to DEV (environment: dev)
        │
        ▼
   GATE 1: smoke tests / integration tests pass in DEV
        │
        ▼
   auto-deploy to TEST (environment: test)
        │
        ▼
   GATE 2: full integration tests + security scan pass in TEST
        │
        ▼
   [optional] auto-deploy to STAGING (environment: staging)
        │
        ▼
   [optional] GATE 3: UAT / performance tests in STAGING
        │
        ▼
   GATE 4: manual approval required (GitLab deployment approval rule)
        │   - Ops team approves via GitLab UI or API
        │   - Approval recorded in audit log
        ▼
   deploy to PROD (environment: production) — same artifact, same commit SHA
        │
        ▼
   post-deploy verification (health checks, smoke tests)
        │
        ▼
   git tag vX.Y.Z pinned to this commit
```

### 5.2 Same Artifact / Same Commit SHA

The artifact built in Gate 0 (tagged `$CI_COMMIT_SHA`) is the exact artifact deployed to prod. The GitLab deployment record shows the commit SHA for every environment, creating a traceable chain: [[GitLab Deployment Approvals Docs]](https://docs.gitlab.com/ci/environments/deployment_approvals/)

```
dev deployment    → commit abc1234, pipeline 101, artifact sha-abc1234
test deployment   → commit abc1234, pipeline 101, artifact sha-abc1234  (promoted, not rebuilt)
prod deployment   → commit abc1234, pipeline 101, artifact sha-abc1234  (same, approved by @ops-lead)
```

### 5.3 GitLab CI/CD Pipeline Structure

```yaml
# .gitlab-ci.yml (simplified)
stages:
  - validate
  - build
  - deploy-dev
  - test-dev
  - deploy-test
  - test-test
  - deploy-prod

variables:
  ARTIFACT_NAME: "ansible-bundle-${CI_COMMIT_SHORT_SHA}.tar.gz"

validate:
  stage: validate
  script:
    - ansible-lint site.yml
    - ansible-playbook --syntax-check -i environments/dev site.yml

build:
  stage: build
  script:
    - ansible-galaxy collection install -r collections/requirements.yml -p ./collections_bundle/
    - tar czf "$ARTIFACT_NAME" site.yml roles/ environments/ collections_bundle/
  artifacts:
    paths: ["*.tar.gz"]
    expire_in: 30 days

deploy_dev:
  stage: deploy-dev
  environment:
    name: development
  script:
    - tar xzf "$ARTIFACT_NAME"
    - ansible-playbook -i environments/dev site.yml
  resource_group: dev

deploy_test:
  stage: deploy-test
  environment:
    name: test
  script:
    - tar xzf "$ARTIFACT_NAME"   # same artifact
    - ansible-playbook -i environments/test site.yml
  resource_group: test
  needs: ["test_dev_smoke"]

deploy_prod:
  stage: deploy-prod
  environment:
    name: production
  script:
    - tar xzf "$ARTIFACT_NAME"   # same artifact again
    - ansible-playbook -i environments/prod site.yml
  resource_group: production
  rules:
    - if: $CI_COMMIT_TAG =~ /^v\d+\.\d+\.\d+$/
      when: manual   # deployment approval gate via protected environment
```

### 5.4 Rollbacks

Two rollback mechanisms: [[GitLab Deployment Safety Docs]](https://docs.gitlab.com/ci/environments/deployment_safety/)

1. **Re-run previous pipeline:** navigate to the last known-good deployment in the GitLab Environments UI and re-run it. The previous artifact (still stored) is re-deployed.
2. **Git revert + new pipeline:** `git revert <commit>` creates a new commit that undoes the change; the pipeline runs the normal promotion flow with the reverted code.

> GitLab recommends **disabling automatic pipeline retries in production** to avoid an automatic rollback to a bad state. Manual re-run is safer. [[GitLab Deployment Safety Docs]](https://docs.gitlab.com/ci/environments/deployment_safety/)

### 5.5 Octopus Deploy Integration

Octopus Deploy handles the deployment/promotion layer while GitLab handles build/test. GitLab CI builds and publishes the Ansible artifact/package; Octopus picks it up and manages: [[Octopus + GitLab Pipeline Types]](https://octopus.com/devops/gitlab/gitlab-cicd-pipelines/)

- **Release creation** with SemVer versioning (recommended by Octopus [[Octopus Release Versioning]](https://octopus.com/docs/releases/release-versioning))
- **Environment promotion** (dev → test → prod) with lifecycle-based approvals
- **ITSM approvals** integration (ServiceNow, Jira) for change management compliance
- **Deployment targets** management for large-scale server fleets

The Octopus model explicitly separates "build artifact once" (GitLab CI) from "promote release across environments" (Octopus), which aligns with the build-once principle.

### 5.6 Change Records at Each Gate

Each promotion gate should record:

| Gate | Record Created |
|------|---------------|
| Dev deploy | GitLab environment deployment entry (auto) |
| Test deploy | GitLab environment deployment entry + test report artifact |
| Prod approval | GitLab deployment approval record + audit event (who, when) |
| Prod deploy | GitLab environment deployment entry + pipeline log |
| Tag | Git tag (`vX.Y.Z`) on commit SHA with release notes |

Deploy freeze windows (`freeze_start`, `freeze_end`) can be configured to block any deployment during maintenance windows, change freeze periods, or holidays. [[GitLab Deployment Safety Docs]](https://docs.gitlab.com/ci/environments/deployment_safety/)

---

## 6. Config & Secret Handling Across Environments

### 6.1 The Problem: Credential Leakage

Lower environments (dev, test) must not have access to production credentials. Key risk vectors:
- Environment-scoped variables accidentally set to `*` (all environments)
- Ansible Vault files shared across environments with different encryption keys
- Hardcoded credentials in playbooks or inventory files

### 6.2 GitLab Environment-Scoped Variables

Scope all sensitive CI/CD variables to their specific environment: [[GitLab Deployment Safety Docs]](https://docs.gitlab.com/ci/environments/deployment_safety/)

```
PROD_DB_PASSWORD    → environment scope: "production"     → protected: true
TEST_DB_PASSWORD    → environment scope: "test"           → protected: false
DEV_DB_PASSWORD     → environment scope: "development"    → protected: false
```

Use **protected variables** (checkbox in Settings > CI/CD > Variables) for production credentials — they are only exposed to pipelines running on protected branches/tags. This prevents a developer from creating a feature branch and accessing prod secrets.

### 6.3 HashiCorp Vault Integration (Recommended)

GitLab + Vault integration via JWT/OIDC is the recommended pattern for centralizing secrets: [[GitLab + HashiCorp Vault Docs]](https://docs.gitlab.com/ci/secrets/hashicorp_vault/)

1. **JWT authentication:** GitLab jobs authenticate to Vault using ID tokens (OIDC). No static Vault tokens stored in GitLab.
2. **Bound claims:** restrict Vault roles to specific GitLab projects, namespaces, or Git references. Example: production Vault role only authenticates jobs running on `protected tags matching v*.*.*`.
3. **Environment-specific secret paths:**
   ```
   secret/data/ansible/dev/db_password
   secret/data/ansible/test/db_password
   secret/data/ansible/prod/db_password   ← only accessible by jobs with bound claim: ref_type=tag
   ```
4. **Runtime retrieval:** secrets are fetched by the Ansible `hashi_vault` lookup plugin at playbook execution time — they never appear in artifacts, logs, or inventory files.

```yaml
# In .gitlab-ci.yml
deploy_prod:
  id_tokens:
    VAULT_ID_TOKEN:
      aud: https://vault.example.com
  secrets:
    PROD_DB_PASSWORD:
      vault: ansible/prod/db_password@secret
      file: false
```

[[Infralovers HashiCorp Vault + GitLab]](https://www.infralovers.com/blog/2024-05-03-hashicorp-vault-gitlab/) [[Sysadmin Vault + GitLab Guide]](https://sysadmin.info.pl/en/blog/secure-secrets-management-using-hashicorp-vault-with-gitlab-ci-cd/)

### 6.4 Ansible Vault (Per-Environment Encryption)

For secrets that must be stored in the repository (e.g., host-level service accounts):

- Maintain **separate vault password files** per environment (never shared).
- Store vault passwords in GitLab CI/CD variables scoped and protected per environment.
- Encrypt only secret-value files, not entire variable files — keeps diff history meaningful.

```
environments/
  prod/group_vars/all/
    vars.yml          # plain — non-sensitive config
    vault.yml         # ansible-vault encrypted — prod secrets only
  test/group_vars/all/
    vars.yml
    vault.yml         # different vault password, different secrets
```

### 6.5 No-Duplication Rule

The single source of truth for production credentials is **Vault** (or GitLab protected/scoped variables). Dev/test environments use **separate, lower-privilege credentials** — never a copy of the prod credential. Audit Vault policies and GitLab variable scopes regularly to ensure no wildcard (`*`) scoping has been applied to production secrets.

---

## 7. Recommended Model

### 7.1 Branching Model: Trunk-Based + Directory-Based Environment Isolation

**Recommendation: Trunk-based development with per-environment directories under `environments/`, pipeline-driven promotion, and CODEOWNERS-enforced review for `environments/prod/`.**

Rationale:
- Eliminates branch divergence / environment drift (the primary failure mode of environment branches). [[Liatrio Trunk-Based GitOps]](https://www.liatrio.ai/resources/blog/trunk-based-gitops)
- Single source of truth; easy rollback via `git revert` on `main`.
- Feature-coupling trap is avoided by per-env directories — a blocked feature only affects its env directory.
- Maps cleanly to Ansible's inventory model where `-i environments/<env>` is the promotion signal.
- NTT DATA recommends this for: separate IaC repo, high change frequency, long deploys. [[NTT DATA IaC Branching]](https://us.nttdata.com/en/blog/2021/july/best-iac-branching-strategies)

### 7.2 Promotion Flow Diagram (Text)

```
┌─────────────────────────────────────────────────────────────────────────┐
│  BRANCHING MODEL: Trunk-Based with Per-Environment Directories          │
└─────────────────────────────────────────────────────────────────────────┘

  Git Repository (main branch is trunk)
  ├── environments/
  │   ├── dev/          ← auto-deployed on every merge to main
  │   ├── test/         ← auto-deployed after dev smoke tests pass
  │   ├── staging/      ← auto-deployed after test suite passes (optional)
  │   └── prod/         ← CODEOWNERS: @ops-team; manual approval gate
  ├── roles/
  ├── collections/requirements.yml  ← pinned SemVer
  └── site.yml

  DEVELOPER WORKFLOW:
  ┌──────────┐    MR+review    ┌──────────┐   CI pass   ┌────────────┐
  │ feature/ │ ─────────────► │  main    │ ───────────► │  Pipeline  │
  │ branch   │                │ (trunk)  │              │  Stage 1:  │
  └──────────┘                └──────────┘              │  validate  │
                                                         │  + build   │
                                                         └─────┬──────┘
                                                               │
                              ARTIFACT: ansible-bundle-$SHA.tar.gz
                              (stored in GitLab Package Registry)
                                                               │
                          ┌────────────────────────────────────┘
                          │
                          ▼
                   ┌──────────────┐
                   │  deploy_dev  │ ← auto, environment: development
                   │  (env dir:   │   resource_group: dev
                   │  dev/)       │
                   └──────┬───────┘
                          │ smoke tests pass (auto)
                          ▼
                   ┌──────────────┐
                   │  deploy_test │ ← auto, environment: test
                   │  (env dir:   │   resource_group: test
                   │  test/)      │   SAME artifact
                   └──────┬───────┘
                          │ integration tests + security scan pass (auto)
                          ▼
                   ┌──────────────┐
                   │  deploy_stg  │ ← auto (optional), environment: staging
                   │  (env dir:   │   resource_group: staging
                   │  staging/)   │   SAME artifact
                   └──────┬───────┘
                          │ UAT / perf tests pass
                          ▼
                   ┌──────────────────────────────────────┐
                   │  GATE: GitLab Deployment Approval    │
                   │  - Protected environment: production │
                   │  - Required approvers: @ops-team     │
                   │  - Self-approval: disabled           │
                   │  - Audit record: who/when logged     │
                   └──────┬───────────────────────────────┘
                          │ approved
                          ▼
                   ┌──────────────┐
                   │  deploy_prod │ ← manual trigger after approval
                   │  (env dir:   │   environment: production
                   │  prod/)      │   SAME artifact (sha-same)
                   │              │   rules: tag matches v*.*.*
                   └──────┬───────┘
                          │
                          ▼
                   git tag vX.Y.Z  (pinned to this commit SHA)
                   GitLab Release created with changelog
                          │
                          ▼
                   ROLLBACK PATH:
                   ├── Re-run previous GitLab environment deployment (UI)
                   └── git revert <sha> → new pipeline → same flow
```

### 7.3 CODEOWNERS Enforcement

```
# .gitlab/CODEOWNERS
/environments/prod/**           @your-org/ops-team
/environments/staging/**        @your-org/platform-team
/collections/requirements.yml  @your-org/platform-team
/roles/**                       @your-org/platform-team
```

Prod changes require `@ops-team` MR approval before merging to `main`. Combined with GitLab deployment approval, this gives two-person integrity for all production changes.

---

## 8. Versioning Policy Summary

| Component | Scheme | Pinning | When to Bump |
|-----------|--------|---------|--------------|
| Ansible Collections | SemVer 2.0.0 (MAJOR.MINOR.PATCH) | Exact version in `requirements.yml` | MAJOR: breaking changes; MINOR: new features; PATCH: bug/security fixes |
| Ansible Roles (Galaxy) | SemVer 2.0.0 | Exact version in `requirements.yml` | Same as collections |
| Playbook Suite / IaC Repo | Git tags (`vX.Y.Z`) | Commit SHA in pipeline artifact name | MAJOR: breaking inv/var changes; MINOR: new playbooks; PATCH: fixes |
| Ansible EE (container) | SemVer tag on OCI image | Digest (`sha256:...`) in pipeline vars | With every requirements.yml change |
| Python dependencies | PEP 440 pin (`==X.Y.Z`) | `requirements.txt` in EE definition | With every upstream update (Dependabot/Renovate) |
| Octopus Release | SemVer (Octopus-recommended) | Passed from GitLab pipeline `$CI_COMMIT_TAG` | Tied to Git tag |

**Golden rule:** pin everything in `requirements.yml`; bump pins intentionally via MR; never use floating ranges (`*` or `latest`) in production pipelines.

---

## 9. Sources

1. [How to Build Your Inventory — Ansible Community Documentation](https://docs.ansible.com/projects/ansible/latest/inventory_guide/intro_inventory.html)
2. [How to Manage Multistage Environments with Ansible — DigitalOcean](https://www.digitalocean.com/community/tutorials/how-to-manage-multistage-environments-with-ansible)
3. [Ansible in 2025: Best Practices for Configuration and Provisioning — gocodeo](https://www.gocodeo.com/post/ansible-in-2025-best-practices-for-configuration-and-provisioning)
4. [Working with Dynamic Inventory — Ansible Community Documentation](https://docs.ansible.com/projects/ansible/latest/inventory_guide/intro_dynamic_inventory.html)
5. [Ansible Community Collection Requirements — Ansible Community Documentation](https://docs.ansible.com/projects/ansible/latest/community/collection_contributors/collection_requirements.html)
6. [Releasing Collections — Ansible Community Documentation](https://docs.ansible.com/projects/ansible/latest/community/collection_contributors/collection_releasing.html)
7. [Versioning and Release Strategy for Ansible Engineering Maintained Certified Collections — Red Hat Customer Portal](https://access.redhat.com/articles/4993781)
8. [Allow Version Constraints in requirements.yml — ansible/ansible GitHub Issue #68194](https://github.com/ansible/ansible/issues/68194)
9. [Protected Environments — GitLab Docs](https://docs.gitlab.com/ci/environments/protected_environments/)
10. [Deployment Approvals — GitLab Docs](https://docs.gitlab.com/ci/environments/deployment_approvals/)
11. [Deployment Safety — GitLab Docs](https://docs.gitlab.com/ci/environments/deployment_safety/)
12. [Environments — GitLab Docs](https://docs.gitlab.com/ci/environments/)
13. [Use HashiCorp Vault Secrets in GitLab CI/CD — GitLab Docs](https://docs.gitlab.com/ci/secrets/hashicorp_vault/)
14. [Branching Strategies for IaC — AWS Prescriptive Guidance](https://docs.aws.amazon.com/prescriptive-guidance/latest/designing-a-devsecops-mechanism/branching-strategies.html)
15. [Four Factors in Finding an IaC Branching Strategy — NTT DATA](https://us.nttdata.com/en/blog/2021/july/best-iac-branching-strategies)
16. [GitOps: Defining the Best Infrastructure Pattern For You (Trunk-Based) — Liatrio](https://www.liatrio.ai/resources/blog/trunk-based-gitops)
17. [Build Enterprise-Grade IaC Pipelines with GitLab DevSecOps — GitLab Blog](https://about.gitlab.com/blog/using-ansible-and-gitlab-as-infrastructure-for-code/)
18. [Enterprise CI/CD Best Practices Part 1 (Build Once Deploy Many) — Octopus Deploy](https://octopus.com/blog/enterprise-ci-cd-best-practices-1)
19. [3 Types of GitLab CI/CD Pipelines and Octopus Deploy Integration — Octopus Deploy](https://octopus.com/devops/gitlab/gitlab-cicd-pipelines/)
20. [Release Versioning — Octopus Deploy Docs](https://octopus.com/docs/releases/release-versioning)
21. [Build Once, Deploy Many — The Core CI/CD Principle You're Probably Missing — Medium](https://medium.com/@aslam.develop912/build-once-deploy-many-the-core-ci-cd-principle-youre-probably-missing-d9fcdc34a854)
22. [Authenticate GitLab to Access Secrets from HashiCorp Vault — Infralovers](https://www.infralovers.com/blog/2024-05-03-hashicorp-vault-gitlab/)
23. [Secure Secrets Management: Using HashiCorp Vault with GitLab CI/CD — SYSADMIN](https://sysadmin.info.pl/en/blog/secure-secrets-management-using-hashicorp-vault-with-gitlab-ci-cd/)
24. [How to Detect and Prevent Configuration Drift in IaC — Snyk](https://snyk.io/articles/infrastructure-as-code-iac/detect-prevent-configuration-drift/)
25. [Protected Environments and Deployment Approvals — Product Security Knowledge Base](https://www.product-security.expert/07-ci-cd-and-software-supply-chain/protected-environments-and-deployment-approvals.html)
