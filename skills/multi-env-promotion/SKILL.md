---
name: multi-env-promotion
description: >
  Multi-environment promotion: dev→test→staging→prod, trunk-based development with
  per-environment directories, build-once-promote-one-immutable-artifact, CODEOWNERS
  on prod, environment-scoped variables, rollback strategies.
  Triggers on: promotion, dev test staging prod, environment directory, trunk-based,
  build once, immutable artifact, CODEOWNERS prod, rollback, promote release.
origin: infra-ops
---

# Multi-Environment Promotion Skill

## When to Use

Load this skill when designing or reviewing the promotion flow for an Ansible change,
configuring GitLab environments, setting up `environment:` job keywords, or reasoning
about rollback. Also load when working with `CODEOWNERS`, protected-environment
approvals, or artifact tagging across environments.

## How It Works

### Branching Model: Trunk-Based + Per-Environment Directories

Single `main` branch (trunk). Feature branches merge to `main` via MR. Per-environment
configuration lives in `environments/` subdirectories — not in separate long-lived
branches. Promotion is **pipeline-driven, not branch-driven**.

```
repo/
  environments/
    dev/
      hosts.yml
      group_vars/
        all/env_specific.yml
    test/
    staging/
    prod/            ← CODEOWNERS: @ops-team; protected-env approval gate
  roles/
  collections/requirements.yml    # pinned SemVer
  site.yml
```

The same `site.yml` playbook runs in every environment; only the inventory (`-i
environments/<env>`) changes. Env-specific differences live in `group_vars/<env>`,
never in `when: env == 'prod'` conditionals in the playbook.
(multi-env-versioning.md §3.3; Liatrio trunk-based GitOps; DigitalOcean multi-stage)

### CODEOWNERS Enforcement

```
# .gitlab/CODEOWNERS
/environments/prod/**           @your-org/ops-team
/environments/staging/**        @your-org/platform-team
/collections/requirements.yml  @your-org/platform-team
/roles/**                       @your-org/platform-team
```

Any MR touching `environments/prod/` requires `@ops-team` approval before it can
merge to `main`. Combined with GitLab deployment approval, this gives two-person
integrity for all production changes. (multi-env-versioning.md §3.4; pci-dss-devops.md §8)

### Build Once, Promote One Immutable Artifact

"Artifacts, not Git commits, should travel within a pipeline." (Octopus enterprise
CI/CD best practices) Build the artifact once; promote the same artifact through all
environments:

1. **On merge to `main`:** `ansible-galaxy collection install -r requirements.yml`,
   bundle into `ansible-bundle-${CI_COMMIT_SHA}.tar.gz`, store in GitLab Package
   Registry.
2. **Across environments:** dev, test, staging, prod all extract the same tarball;
   only the `-i environments/<env>` flag changes.
3. **On release tag (`vX.Y.Z`):** retag the artifact; do not reinstall or rebuild.

Referencing Execution Environments by digest (`sha256:…`) ensures the Ansible toolchain
is also pinned — not just the playbooks. (multi-env-versioning.md §4.3; DESIGN.md §10)

### Promotion Flow

```
feature branch → MR (CI: lint+syntax+check+molecule) → merge to main
  → build artifact ($CI_COMMIT_SHA)
  → deploy-dev  (auto; environment: development)
  → smoke tests pass
  → deploy-test (auto; environment: test; same artifact)
  → integration tests + security scan pass
  → [deploy-staging] (auto or manual; optional)
  → GATE: GitLab deployment approval (protected env, @ops-team, non-self-approve)
  → deploy-prod (manual trigger; environment: production; SAME artifact; tag v*.*.*rule)
  → git tag vX.Y.Z pinned to commit SHA
```

Source: multi-env-versioning.md §5.1; gitlab-octopus-cicd.md §1.5.

### Environment-Scoped Variables

Scope all sensitive CI/CD variables to their specific environment — never wildcard `*`:

```
PROD_VAULT_TOKEN → environment scope: "production", protected: true
TEST_VAULT_TOKEN → environment scope: "test",       protected: false
```

Protected variables (checkbox in Settings > CI/CD > Variables) are only exposed to
pipelines on protected branches/tags — a feature branch cannot read prod secrets.
(multi-env-versioning.md §6.2)

For secrets, use HashiCorp Vault with JWT/OIDC bound claims: production Vault role
authenticates only jobs on `protected tags matching v*.*.*`.
(multi-env-versioning.md §6.3; secrets-vault skill)

### Rollback

Two mechanisms:
1. **Re-run previous pipeline:** navigate to last known-good deployment in GitLab
   Environments UI and re-run. The previous artifact (still stored) is re-deployed.
2. **Git revert + new pipeline:** `git revert <sha>` → normal promotion flow.

Disable automatic pipeline retries in production — manual re-run is safer.
`resource_group` prevents concurrent deploys to the same environment.
(multi-env-versioning.md §5.4; gitlab-octopus-cicd.md §1.1)

When Octopus is in use: re-deploy a previous Octopus release via the UI — same
artifact, instant rollback. (octopus-multitentacle.md §5.2)

### Versioning Summary

| Component | Scheme | Pinning rule |
|-----------|--------|--------------|
| Collections / roles | SemVer (exact pin `==`) | `requirements.yml` |
| Playbook suite / IaC repo | Git tag `vX.Y.Z` | Artifact name = `$CI_COMMIT_SHA` |
| Execution Environment image | SemVer + digest | `sha256:…` in pipeline vars |
| Python deps | PEP 440 `==X.Y.Z` | `requirements.txt` in EE definition |

Golden rule: pin exact versions; never use `latest` or floating ranges in production.
(multi-env-versioning.md §4.2; modular-ansible-repos.md §3)

### Trust Boundary

- `environments/prod/**` is CODEOWNERS-gated; only `@ops-team` can approve MRs.
- Protected-env approval gate (GitLab Premium) or Octopus manual-intervention gate
  blocks prod deploy until a human with the right role clicks Proceed.
- The agent never holds prod deploy rights. (SPEC.md §2; DESIGN.md §10)

## Examples

```yaml
# .gitlab-ci.yml (promotion skeleton)
deploy_dev:
  stage: deploy-dev
  environment: { name: development }
  resource_group: dev
  tags: [linux, deploy, ansible]
  script: [tar xzf "$ARTIFACT", ansible-playbook -i environments/dev site.yml]

deploy_prod:
  stage: deploy-prod
  environment: { name: production }
  resource_group: production
  tags: [linux, deploy, ansible]
  rules:
    - if: $CI_COMMIT_TAG =~ /^v\d+\.\d+\.\d+$/
      when: manual
  script: [tar xzf "$ARTIFACT", ansible-playbook -i environments/prod site.yml]
```

> TODO: Confirm staging environment name(s) from CMDB/environment discovery.
> TODO: Add deploy freeze window config once the change-freeze calendar is ingested.
> TODO: Confirm GitLab tier (Premium vs CE) to finalise approval-gate mechanism
> (DESIGN.md §17 Q4).
