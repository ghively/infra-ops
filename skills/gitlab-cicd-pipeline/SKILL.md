---
name: gitlab-cicd-pipeline
description: >
  GitLab CI/CD pipeline design for Ansible/IaC: stage progression
  (lint→syntax→check→molecule→deploy→verify), workflow rules, environment keyword,
  protected environments, deployment approvals, reusable CI components, runner tags.
  Triggers on: gitlab-ci, pipeline, runner, workflow rules, environment, protected
  environment, deployment approval, CI component, stage, .gitlab-ci.yml.
origin: infra-ops
---

# GitLab CI/CD Pipeline Skill

## When to Use

Load this skill when authoring or reviewing `.gitlab-ci.yml`, managing GitLab runner
registration/tags, configuring protected environments or deployment approvals, or
building reusable CI/CD components for the Ansible pipeline.

## How It Works

### Stage Progression (fail-fast left-to-right)

| Stage | Purpose | Runs on |
|-------|---------|---------|
| **lint** | `yamllint` + `ansible-lint --strict`; emit Code Quality report | every MR |
| **syntax** | `ansible-playbook --syntax-check` | every MR |
| **check** | `--check --diff` against staging inventory | every MR |
| **molecule** | Converge + idempotence + verify in ephemeral container | every MR |
| **build** | Bundle artifact tagged `$CI_COMMIT_SHA` | merge to main |
| **deploy** | `ansible-playbook` against real inventory; gated by `environment:` | protected branch/tag |
| **verify** | Post-deploy health checks + re-run `--check` (non-empty = drift alert) | after deploy |

Source: gitlab-octopus-cicd.md §1.1; ansible-iac-gitops.md §2.

### `workflow:` and `rules:` (prefer over legacy `only/except`)

```yaml
workflow:
  rules:
    - if: $CI_PIPELINE_SOURCE == "merge_request_event"
    - if: $CI_COMMIT_BRANCH == $CI_DEFAULT_BRANCH
    - if: $CI_COMMIT_TAG =~ /^v\d+\.\d+\.\d+$/
```

Use `rules:` per job to control whether it runs. Never mix `only/except` with `rules:`
in the same job. (gitlab-octopus-cicd.md §1.2)

### `environment:` Keyword — Required on All Deploy Jobs

Declaring `environment:` registers a deployment in GitLab's environment tracking
(commit SHA, pipeline ID, triggered-by user, timestamp). This is core audit evidence.
(multi-env-versioning.md §2.1)

```yaml
deploy_prod:
  stage: deploy
  environment:
    name: production
    url: https://prod.example.com
  resource_group: production      # prevents concurrent deploys to same env
  rules:
    - if: $CI_COMMIT_TAG =~ /^v\d+\.\d+\.\d+$/
      when: manual
  tags: [linux, deploy, ansible]
  script:
    - ansible-playbook -i inventories/prod site.yml
```

### Protected Environments + Deployment Approvals

Configure under **Settings > CI/CD > Protected environments** (GitLab Premium+).

- Restrict "Allowed to deploy" to the ops team.
- Add "Required approvers" (minimum count ≥ 1, non-self-approving by default).
- The pipeline triggerer cannot approve their own deployment.
- After approval, the job still requires manual trigger — two separate gates.
- Approval history (who/when) appears in the GitLab UI — direct audit record.

(multi-env-versioning.md §2.2–2.3; gitlab-octopus-cicd.md §1.5)

> NOTE: Protected environments and deployment approvals require **GitLab Premium+**.
> On CE, substitute protected branches + CODEOWNERS + manual job + Octopus
> manual-intervention gate. (DESIGN.md §17, open question 4)

### Runner Tags Route by Trust Level

Three-runner topology (DESIGN.md §11; gitlab-octopus-cicd.md §2.5 §6):

| Runner | Tags | Jobs | Notes |
|--------|------|------|-------|
| Linux CI | `linux,docker,ci` | lint/syntax/check/molecule | untrusted MR code; no prod secrets |
| Linux Deploy | `linux,deploy,ansible` | `ansible-playbook` real inventory | **protected**, Vault access, approval-gated |
| Windows | `windows,shell` | MSBuild/Pester/package | trusted Windows-native build only |

Always specify `tags:` on deploy jobs so they cannot land on the untrusted CI runner.

### Reusable CI Components (GitLab 17.0+)

Extract shared pipeline logic into CI/CD Components — versioned, catalog-listed,
typed `spec:inputs`. Components are the preferred reuse mechanism over ad-hoc
`include:` of raw templates.

```yaml
# In .gitlab-ci.yml (consuming a component)
include:
  - component: $CI_SERVER_FQDN/infra/ci-components/ansible-lint@1.2.0
    inputs:
      profile: production
  - component: $CI_SERVER_FQDN/infra/ci-components/molecule-test@1.2.0
    inputs:
      scenario: default
```

Keep components small and single-purpose; pass behavior via `inputs:`.
(gitlab-octopus-cicd.md §1.4)

### Protected Branches + CODEOWNERS (change-control evidence)

```
# .gitlab/CODEOWNERS
/inventories/prod/**    @your-org/ops-team
/inventories/staging/** @your-org/platform-team
/roles/**               @your-org/platform-team
```

MR creator cannot approve their own MR (GitLab default). CODEOWNERS-required review,
protected branch, and protected-env approval form the three-part SoD chain. An MR must
pass the full chain before any prod apply runs. (pci-dss-devops.md §8; multi-env-versioning.md §3.4)

### Trust Boundary

- The agent opens MRs and may trigger CI, but **never** the prod `deploy` job.
- Prod deploy requires: (1) CI green, (2) CODEOWNERS approval, (3) protected-env
  approval (GitLab Premium) or Octopus manual-intervention gate (CE fallback).
- Protected CI/CD variables (prod creds, Vault token) are only exposed on protected
  branches/tags — feature branches cannot read them. (gitlab-octopus-cicd.md §2.4; SPEC.md §2)

## Examples

```yaml
# Minimal correct .gitlab-ci.yml skeleton
stages: [lint, syntax, check, molecule, build, deploy-dev, deploy-prod]

variables:
  ARTIFACT: "ansible-bundle-${CI_COMMIT_SHORT_SHA}.tar.gz"

.ci_runner: &ci_runner
  tags: [linux, docker, ci]
  image: registry.example.com/infra/ansible-ee@sha256:abc123

lint:
  <<: *ci_runner
  stage: lint
  script:
    - yamllint .
    - ansible-lint --strict

deploy_prod:
  stage: deploy-prod
  tags: [linux, deploy, ansible]
  environment:
    name: production
  resource_group: production
  rules:
    - if: $CI_COMMIT_TAG =~ /^v\d+\.\d+\.\d+$/
      when: manual
  script:
    - ansible-playbook -i inventories/prod site.yml
```

> TODO: Add org-specific component registry path once the self-hosted GitLab URL is known.
> TODO: Confirm Premium vs CE tier to finalise approval-gate implementation (DESIGN.md §17 Q4).
> TODO: Add freeze-window configuration for maintenance windows once the change-calendar is ingested.
