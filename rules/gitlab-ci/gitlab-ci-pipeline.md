# GitLab CI/CD Rules

## Scope
These rules apply to:
- GitLab CI configuration files (`.gitlab-ci.yml`, `**/.gitlab-ci.yml`)
- CI component includes (`**/ci/**/*.yml`)

paths:
  - ".gitlab-ci.yml"
  - "**/.gitlab-ci.yml"
  - "**/ci/**/*.yml"

---

## Rules

### 1. Environment Scoping
All jobs must specify their environment:
```yaml
deploy_dev:
  stage: deploy
  environment:
    name: dev
    url: https://dev.example.com
  script:
    - ansible-playbook deploy.yml
```

### 2. Protected Environments
Production environments require:
- `on_stop: stop_production` job for manual cleanup
- Protected branches only
- Required approvals

```yaml
deploy_production:
  stage: deploy
  environment:
    name: production
    url: https://example.com
    deployment_tier: production
  rules:
    - if: $CI_COMMIT_BRANCH == $CI_DEFAULT_BRANCH
      when: manual
  script:
    - ansible-playbook deploy.yml -l production
```

### 3. Stage Definition
Define clear stages:
```yaml
stages:
  - validate
  - build
  - test
  - deploy
```

### 4. Ansible Quality Gates
Include quality checks before deployment:
```yaml
ansible_validate:
  stage: validate
  script:
    - yamllint playbooks/
    - ansible-playbook playbooks/*.yml --syntax-check
    - ansible-lint playbooks/
```

### 5. Runner Tags
Specify appropriate runner tags:
```yaml
job_name:
  tags:
    - docker
    - ansible
```

### 6. Artifacts and Caching
Define artifacts for debugging:
```yaml
test_job:
  artifacts:
    when: always
    paths:
      - test-results/
    reports:
      junit: test-results/junit.xml
```

### 7. Variable Scoping
- Use `variables` for job-specific values
- Use global variables for common values
- Never hardcode secrets (see `rules/secrets/secrets-management.md`)

### 8. Deployment Safety
- Dev deployments: automatic on merge to main
- Test/Staging: manual approval required
- Production: manual approval + protected branch

### 9. CI Components
Reuse CI components where possible:
```yaml
include:
  - component: $CI_SERVER_FQDN/infra-ops/ci/ansible-quality@1.0
  - component: $CI_SERVER_FQDN/infra-ops/ci/security-scan@1.0
```

### 10. Pipeline Efficiency
- Use `needs:` for job dependencies (faster than `dependencies:`)
- Use `rules:` instead of `only:/except:`
- Cache dependencies between jobs

---

## Enforcement

The `gatekeeper-fact-force` hook will require investigation facts before editing `.gitlab-ci.yml`.

The `governance-capture` hook will detect approval-required commands in CI scripts.
