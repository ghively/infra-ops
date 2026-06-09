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

Commit a `.ansible-lint` profile at the repo root. The `production` profile is the
strictest built-in set. Note `--strict` promotes *warnings* to *failures* — with an
empty `warn_list` under the `production` profile it is largely redundant, so use it
deliberately. Emit **SARIF** (portable, feeds the GitLab Security Dashboard) in
addition to Code Quality JSON. Never run `--write` in CI (it auto-mutates files).
(gitlab-octopus-cicd.md §4.2; see the `iac-sast-scanning` skill)

```yaml
# .ansible-lint
profile: production
warn_list: []          # production profile is already strict
skip_list: []
exclude_paths:
  - .cache/
  - molecule/
```

```bash
ansible-lint --profile production --sarif-file gl-sast-ansible.sarif
```

### Tool version floors (deterministic rulesets)

Pin the toolchain so the same input yields the same verdict every run: `ansible-core`
≥ 2.18, `ansible-lint` ≥ 24.x (for the current production ruleset), `molecule` 6.x.
Bake these into the EE image by digest. Floating `:latest` makes the gate
non-reproducible and is forbidden.

### Molecule 6 driver note (important)

Molecule **6 no longer ships container drivers built in** — the default is the
`default`/`delegated` driver; Docker/Podman drivers come from the separate
`molecule-plugins` package. Install it explicitly and prefer **rootless Podman** for a
PCI-hardened CI runner:

```bash
pip install "molecule>=6" "molecule-plugins[podman]"
# molecule/<scenario>/molecule.yml → driver: { name: podman }
```

### Execution Environments (EEs)

Pin Ansible toolchain in a custom EE image (`ansible-builder`) that bakes in
`ansible-core`, collections, `yamllint`, `ansible-lint`, and `molecule`. Reference
the EE by digest (`sha256:…`) so CI is reproducible across runners.
(ansible-iac-gitops.md §2 pipeline notes; multi-env-versioning.md §4.2)

### Windows Roles

Windows roles cannot run Molecule in a Linux container (WinRM not available). Options:

- Use a dedicated Windows VM runner with Molecule's `delegated`/vagrant driver
  (from `molecule-plugins`).
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

## Deep Reference

### Full Pipeline Execution Order

```
yamllint → ansible-lint → ansible-playbook --syntax-check →
ansible-playbook --check --diff (dev inventory) →
molecule test (idempotence) → CI gate (iac-sast-scanning)
```

Never skip a step. Never propose an MR with a failing lint or syntax check.

### yamllint Configuration

Project-wide rule: max line length 120, comments-indentation at warning level.
Run with: `yamllint -d '{extends: default, rules: {line-length: {max: 120}, comments-indentation: {level: warning}}}' <file>`

### ansible-lint Rules to Never Suppress

- `fqcn` — FQCN is mandatory. No suppression.
- `no-changed-when` — if you suppress this, `creates:` or `removes:` must be present.
- `risky-shell-pipe` — if a pipe is needed, add `pipefail` or use a dedicated module.

### Molecule Driver Choice

Use `podman` (rootless) not `docker` for new scenarios:

```yaml
# molecule/default/molecule.yml
driver:
  name: podman
platforms:
  - name: instance
    image: "quay.io/centos/centos:stream9"
    pre_build_image: true
```

### Molecule Verify Pattern

```yaml
# molecule/default/verify.yml
- name: Verify
  hosts: all
  gather_facts: false
  tasks:
    - name: Check service is running
      ansible.builtin.service_facts:
    - name: Assert service active
      ansible.builtin.assert:
        that: ansible_facts.services['myservice.service'].state == 'running'
        fail_msg: "myservice is not running"
```

### Check-mode Evidence in MR Description

Every MR must include the `--check --diff` output summary. Format:

```
## Check-mode evidence
Ran: `ansible-playbook --check --diff site.yml -i inventory/dev/`
Result: N tasks changed, 0 errors
<paste abbreviated diff output>
```
