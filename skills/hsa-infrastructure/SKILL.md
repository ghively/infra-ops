---
name: hsa-infrastructure
description: Use when authoring, reviewing, or auditing infrastructure in the High Security Area (HSA) — card personalization zone under PCI Card Production + PIN scope. Covers air-gap constraints, dual-control requirements, local-only inference, and HSA-specific Ansible/GitLab patterns.
---

# HSA Infrastructure Skill

## When to Use

Load this skill for any task involving infrastructure in the High Security Area:
- Planning changes to personalization system infrastructure
- Reviewing Ansible playbooks or CI configs targeting HSA hosts
- Auditing HSA infrastructure state
- Writing change records for HSA zone changes

## How It Works

This skill provides HSA-specific patterns, constraints, and examples that override or
extend the base `ansible-patterns` and `gitlab-cicd-pipeline` skills for the air-gapped
personalization zone. Load it alongside those skills; it takes precedence where rules
conflict.

## Core Constraints (non-negotiable)

### Air-gap
The HSA has no direct internet access. Every artifact (playbook, role, CI component,
container image, package) must be:
1. Authored and tested in the corporate zone
2. Transferred via the approved air-gap process (signed artifact + hash verification)
3. Never pulled from the internet on HSA hosts

Never add tasks that fetch packages, images, or updates directly from the internet.
Use `ansible.builtin.copy` to push pre-staged packages from a transfer share, not
`ansible.builtin.get_url` pointing at a public mirror.

### Local inference only
No cloud model may process HSA-adjacent content. All analysis of HSA infrastructure
content must use the local Ollama lane (`scripts/lib/ollama-router.js`). The
`INFRAOPS_SENSITIVE_FAIL_CLOSED=1` default enforces this at the hook boundary.

### Dual control
Every infrastructure change to an HSA host requires two distinct human approvers —
not just the MR author. The `dual-control-promotion-gate` enforces this for instinct
promotion. MR-level enforcement requires the GitLab HSA project to have a minimum
approval count of 2 on protected branches. Verify this configuration is in place
before proposing any HSA MR.

### No CHD in agent context
This agent operates on infrastructure metadata only — file paths, config schemas,
playbook structure, runner topology. It never reads or reasons about actual PAN,
SAD, PIN blocks, key components, or HSM configuration. If a file contains those
values, identify it by path and route to the local lane.

## Ansible Patterns for the HSA Zone

### Package management (air-gapped)
```yaml
# CORRECT — push from staged share, no internet
- name: Install perso-agent package
  ansible.builtin.copy:
    src: "{{ transfer_share }}/packages/perso-agent-{{ version }}.rpm"
    dest: /tmp/perso-agent.rpm
    mode: '0600'
    owner: root

- name: Install from staged file
  ansible.builtin.yum:
    name: /tmp/perso-agent.rpm
    state: present

# WRONG — never in HSA
- name: Install perso-agent
  ansible.builtin.yum:
    name: perso-agent
    state: latest   # fetches from internet — BLOCKED in HSA
```

### Service management
```yaml
# Always use FQCN; always verify state explicitly
- name: Ensure personalization service is running
  ansible.builtin.systemd:
    name: perso-engine
    state: started
    enabled: true
    daemon_reload: true
  register: svc_state

- name: Verify service is active
  ansible.builtin.assert:
    that: svc_state.status.ActiveState == 'active'
    fail_msg: "perso-engine failed to start"
```

### Configuration management
```yaml
# Use templated configs; never hardcode endpoint addresses
- name: Deploy perso-engine config
  ansible.builtin.template:
    src: templates/perso-engine.conf.j2
    dest: /etc/perso-engine/engine.conf
    owner: perso
    group: perso
    mode: '0640'
    validate: /usr/bin/perso-engine --config-check %s
  notify: Restart perso-engine
```

## GitLab CI/CD in the HSA Zone

HSA CI pipelines run on runners tagged `hsa` that are registered against the
air-gapped internal GitLab instance (`gitlab-hsa.example.com`), not the
corporate GitLab.

```yaml
# .gitlab-ci.yml for HSA pipeline
stages:
  - syntax
  - check
  - deploy  # manual trigger only

variables:
  ANSIBLE_FORCE_COLOR: "0"
  ANSIBLE_HOST_KEY_CHECKING: "False"

syntax-check:
  stage: syntax
  tags: [hsa, ansible]
  script:
    - ansible-playbook --syntax-check site.yml
  rules:
    - if: $CI_PIPELINE_SOURCE == "merge_request_event"

check-mode:
  stage: check
  tags: [hsa, ansible]
  script:
    - ansible-playbook --check --diff site.yml -i inventory/hsa/
  rules:
    - if: $CI_PIPELINE_SOURCE == "merge_request_event"

deploy:
  stage: deploy
  tags: [hsa, deploy, ansible]
  when: manual
  environment:
    name: hsa-production
    url: https://gitlab-hsa.example.com
  script:
    - ansible-playbook site.yml -i inventory/hsa/
  rules:
    - if: $CI_COMMIT_BRANCH == "main"
  needs:
    - job: check-mode
```

## Rollback in the HSA Zone

Every HSA playbook must have a corresponding rollback play. Because the zone is
air-gapped, rollbacks cannot pull updated packages — they must revert to the
previously staged artifact or revert configuration via git.

Standard rollback pattern:
1. Re-run the previous version playbook with `--tags rollback`
2. Verify service state with `ansible.builtin.assert`
3. Log rollback to governance ledger via change record

## Instinct Promotion for HSA

HSA zone instincts require `dual-control-promotion-gate` (two distinct approvers).
Use: `node scripts/hooks/dual-control-promotion-gate.js --check --id <id> --zone hsa
--approvers <a>,<b> --citation "<ref>"` before submitting to `/instinct-promote`.
