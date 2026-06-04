---
name: ansible-testing
description: >
  Ansible MR gate chain: yamllint, ansible-lint, syntax-check, check-diff dry run,
  Molecule create-converge-idempotence-verify-destroy. The idempotence gate is the
  canonical contract. Triggers on: molecule, idempoten, ansible-lint, yamllint,
  syntax-check, check diff, test role, ci pipeline ansible.
origin: infra-ops
---

# Ansible Testing Skill

## When to Use

Load this skill when writing or reviewing CI pipeline configuration for Ansible, when
authoring Molecule scenarios for a new role, or when debugging a failed pipeline gate.
Also load for any MR touching `.gitlab-ci.yml`, `molecule/`, or lint config files.

## How It Works

### The MR Gate Chain (fail-fast, left-to-right)

Run in order on every MR. Each stage must pass before the next runs.

| Stage | Tool | Purpose | Fail means |
|-------|------|---------|------------|
| 1 | `yamllint` | YAML well-formedness and style | Invalid syntax |
| 2 | `ansible-lint` | FQCN, deprecated syntax, risky modules, idempotency smells | Best-practice violation |
| 3 | `ansible-playbook --syntax-check` | Structural parse without contacting hosts | Template/var error |
| 4 | `ansible-playbook --check --diff` | Dry-run showing what *would* change | Change to non-prod inventory |
| 5 | `molecule test` | Ephemeral container — full converge + idempotence + verify | Role correctness |

Source: ansible-iac-gitops.md §2; gitlab-octopus-cicd.md §1.1.

### The Idempotence Gate — the Canonical Contract

Molecule runs `converge` **twice** and fails if the second run reports any change.
This is the single most important correctness guarantee for an AI-authored playbook:

```
molecule create → converge → idempotence → verify → destroy
```

- `converge` applies the role to a fresh container.
- `idempotence` re-runs converge; **zero changed tasks must be reported**.
- `verify` asserts post-converge system state (Testinfra / `ansible.builtin.assert`).

"Testing Ansible code is not optional for production workloads." (ansible-iac-gitops.md §2)
Molecule idempotence gate is the **required** MR gate for any role touching critical systems.

### ansible-lint Configuration

Commit a `.ansible-lint` profile at the repo root. Run with `--strict` so style and
unsafe-module rules are enforced, not advisory. Emit as a Code Quality report in GitLab.
(gitlab-octopus-cicd.md §4.2)

```yaml
# .ansible-lint
profile: production
warn_list: []       # promote all warnings to errors
skip_list: []
```

### Execution Environments (EEs)

Pin Ansible toolchain in a custom EE image (`ansible-builder`) that bakes in
`ansible-core`, collections, `yamllint`, `ansible-lint`, and `molecule`. Reference
the EE by digest (`sha256:…`) so CI is reproducible across runners.
(ansible-iac-gitops.md §2 pipeline notes; multi-env-versioning.md §4.2)

### Windows Roles

Windows roles cannot run Molecule in Docker containers (WinRM not available). Options:
- Use a dedicated Windows VM runner with Molecule's delegated/vagrant driver.
- Test Windows logic via `--check --diff` against a staging inventory.
- Test pure PowerShell steps with Pester on the Windows runner (Runner 3).

(gitlab-octopus-cicd.md §5.2)

> TODO: Confirm Docker vs. VM Molecule driver choice once runner topology is documented.
> TODO: Add org-specific Molecule scenario matrix (OS families, RHEL vs Ubuntu versions)
> once CMDB inventory is ingested.

### GitLab CI Structure

```yaml
# .gitlab-ci.yml (ansible gate excerpt)
stages: [lint, syntax, check, molecule, deploy, verify]

.ansible_image: &ansible_image
  image: registry.gitlab.example.com/infra/ansible-ee:sha256-abc123
  tags: [linux, docker, ci]

yamllint:
  <<: *ansible_image
  stage: lint
  script: [yamllint .]

ansible-lint:
  <<: *ansible_image
  stage: lint
  script: [ansible-lint --strict]

syntax-check:
  <<: *ansible_image
  stage: syntax
  script:
    - ansible-playbook --syntax-check -i inventories/dev site.yml

check-diff:
  <<: *ansible_image
  stage: check
  script:
    - ansible-playbook --check --diff -i inventories/staging site.yml

molecule:
  <<: *ansible_image
  stage: molecule
  parallel:
    matrix:
      - SCENARIO: [default, rhel9, windows-baseline]
  script:
    - cd roles/$ROLE && molecule test --scenario-name $SCENARIO
```

### Trust Boundary

- CI runs on Runner 1 (untrusted Docker, no prod secrets). (SPEC.md §2; DESIGN.md §11)
- `--check --diff` stage uses **staging** inventory only — never prod.
- Molecule containers are ephemeral and have no network access to live infrastructure.
- Stages 1-5 are **required** MR gates; no merge without green pipeline.

## Examples

```bash
# Run full Molecule test locally before pushing
cd roles/corp_nginx && molecule test

# Run only idempotence check
cd roles/corp_nginx && molecule idempotence

# Check drift against staging without applying
ansible-playbook --check --diff -i inventories/staging site.yml
```

> TODO: Add idempotence-gate exception process (e.g., first-run bootstrap tasks that
> are inherently non-idempotent — use `changed_when: false` pattern) once real roles
> are authored.
