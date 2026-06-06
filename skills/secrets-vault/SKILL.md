---
name: secrets-vault
description: >
  HashiCorp Vault as source of truth: community.hashi_vault runtime lookups, repo
  holds only paths never values, no_log true, gitleaks MR gate, JWT/OIDC bound claims
  for per-env access. Agent never sees plaintext. Triggers on: vault, secret,
  no_log, hashi_vault, gitleaks, plaintext credential, rotate, jwt oidc, ansible vault.
origin: infra-ops
---

# Secrets & Vault Skill

## When to Use

Load this skill when authoring any Ansible task or CI job that references credentials,
when reviewing a playbook for secret-handling practices, or when configuring
GitLab↔Vault JWT/OIDC integration. Also load for gitleaks gate configuration or
Vault policy design.

## How It Works

### Core Principle: Agent Never Sees Plaintext

The agent edits **references** (Vault paths, variable names), never values. Decryption
keys and Vault tokens live only in the CI runner's protected/masked variables or are
fetched by the runner at runtime. The agent has zero access to vault passwords or Vault
tokens. (ansible-iac-gitops.md §3; pci-dss-devops.md §8)

### HashiCorp Vault — the Source of Truth

Vault is preferred over ansible-vault for enterprise estates:

- **Dynamic/short-lived secrets** (rotated automatically).
- **Fine-grained ACLs** (per-path, per-environment).
- **Tamper-evident audit log** of every secret access.
- **Vault Radar** scans repos for hard-coded secrets.

(ansible-iac-gitops.md §3; pci-dss-devops.md §8 — HashiCorp Vault directly satisfies
PCI DSS Req 8.6.2 no-hard-coded creds, 8.6.3 rotation, Req 3 key management,
Req 10 audit of secret access)

### `community.hashi_vault` Runtime Lookup

The repo (and the agent) holds only the **path**, never the secret value. In
`community.hashi_vault` 7.x, **do not pass a raw `token=` inline on every lookup** —
configure auth once via the collection's environment variables / `ansible.cfg`
`[hashi_vault_collection]`, or do a single `community.hashi_vault.vault_login` and reuse
the session. Prefer `auth_method: jwt` / `approle` / `aws` over a static token.

```yaml
# Env-driven auth (set VAULT_ADDR + the auth env vars on the runner); lookups carry
# only the path. The runner fetches at run-time; nothing is stored in the repo.
- name: Deploy with DB password from Vault
  ansible.builtin.template:
    src: db.conf.j2
    dest: /etc/myapp/db.conf
  vars:
    db_password: "{{ lookup('community.hashi_vault.vault_kv2_get', 'ansible/prod/db_password').secret.value }}"
  no_log: true        # REQUIRED: prevents value appearing in logs/ARA output
```

Useful modules: `community.hashi_vault.vault_login` (establish a session),
`vault_kv2_get`/`vault_read` (read), and the dynamic-secret pattern below.
Source: ansible-iac-gitops.md §3; modular-ansible-repos.md §3.

### Dynamic (short-lived) secrets — preferred over static

Vault's strongest control is **short-lived, auto-revoked** credentials (PCI DSS 8.6.x
favors short-lived over static). Read a dynamic DB credential from a Vault database
secrets-engine role instead of a stored password:

```yaml
- name: Get a short-lived DB credential
  community.hashi_vault.vault_read:
    path: database/creds/app-prod      # Vault issues a fresh user/pass, auto-revoked at TTL
  register: db_cred
  no_log: true
# db_cred.data.data.username / .password — used immediately, never persisted
```

### `no_log: true` — Non-Negotiable

Every task that handles a secret **must** have `no_log: true`. The agent reads ARA
run output and GitLab job logs — if a secret appears in output the agent has seen it.

```yaml
- name: Configure secret (no_log mandatory)
  ansible.builtin.template:
    src: config.j2
    dest: /etc/service/config
  no_log: true
```

Failure to set `no_log` on secret tasks is a lint violation. Add a custom ansible-lint
rule to enforce it. (ansible-iac-gitops.md §3; pci-dss-devops.md §4)

### GitLab↔Vault JWT/OIDC Integration

Prefer JWT/OIDC over static Vault tokens in CI — no static credentials stored in GitLab:

1. GitLab job authenticates to Vault using a JWT ID token (`VAULT_ID_TOKEN`).
2. Vault role has **bound claims**: restrict to specific GitLab project, namespace, or
   Git reference pattern.
3. Production Vault paths are only accessible by jobs with `ref_type=tag` on protected
   `v*.*.*` tags — feature branches cannot read prod secrets.

```yaml
# .gitlab-ci.yml (Vault JWT auth)
deploy_prod:
  id_tokens:
    VAULT_ID_TOKEN:
      aud: https://vault.example.com
  secrets:
    PROD_DB_PASSWORD:
      vault: ansible/prod/db_password@secret
      file: false
```

Environment-specific secret paths:

```
secret/data/ansible/dev/db_password     ← dev jobs only
secret/data/ansible/test/db_password    ← test jobs only
secret/data/ansible/prod/db_password    ← protected tags v*.*.* only
```

Source: multi-env-versioning.md §6.3; pci-dss-devops.md §8.

### Gitleaks MR Gate

`gitleaks` (GitLab Secret Detection or standalone) runs on every MR as a **required
gate** to catch any secret the agent accidentally hardcodes. This directly mitigates
the observed AI failure mode: "knows vault syntax but sometimes hardcodes values it
shouldn't." (ansible-iac-gitops.md §3 §6)

```yaml
# .gitlab-ci.yml (gitleaks gate) — pin the digest (the skill forbids :latest); note the
# project moved to the gitleaks/gitleaks org.
secret-detection:
  stage: lint
  image: zricethezav/gitleaks@sha256:<pinned>   # or ghcr.io/gitleaks/gitleaks@sha256:<pinned>
  tags: [linux, docker, ci]
  script:
    - gitleaks detect --source . --redact --exit-code 1
  rules:
    - if: $CI_PIPELINE_SOURCE == "merge_request_event"
```

Add **TruffleHog** (verified-secrets) as a complementary CI stage — it confirms a match
is a *live* credential, deeper than gitleaks' regex. See the `iac-sast-scanning` skill
for the full secret/SAST chain.

### Variable Naming Convention

Prefix secret variables with `vault_` to clearly separate them from plain vars:

```yaml
# group_vars/<group>/vars.yml    (plain — version controlled)
db_host: "db.prod.example.com"
db_port: 5432
db_user: "myapp"

# group_vars/<group>/vault.yml   (ansible-vault encrypted — for low-sensitivity)
vault_db_password: !vault |
  $ANSIBLE_VAULT;1.2;AES256;prod
  ...
```

For production secrets, Vault runtime lookups (above) are preferred over ansible-vault
files. Ansible-vault is acceptable for low-sensitivity or bootstrap secrets only.
(ansible-iac-gitops.md §3; multi-env-versioning.md §6.4)

### Trust Boundary

- Agent edits paths and templates; never sets or reads secret values.
- Vault tokens / vault passwords live only in protected CI/CD variables on the runner.
- Prod Vault paths are bound-claim restricted to protected tags — feature branches
  cannot trigger prod-credential access.
- `no_log: true` on every secret-handling task without exception.
- Gitleaks gate runs on every MR before merge. (SPEC.md §2; DESIGN.md §8)

## Examples

```yaml
# Correct: runtime lookup, no_log
- name: Retrieve and apply API key
  ansible.builtin.lineinfile:
    path: /etc/myapp/config
    line: "api_key={{ lookup('community.hashi_vault.vault_kv2_get', 'ansible/prod/api_key') }}"
  no_log: true

# Wrong: hardcoded secret — will be caught by gitleaks gate
- name: BAD — hardcoded secret
  ansible.builtin.lineinfile:
    path: /etc/myapp/config
    line: "api_key=sk-prod-abc12345"  # NEVER
```

> TODO: Add Vault cluster address and namespace once environment discovery is complete.
> TODO: Add Vault policy examples for the agent service account (read-only on paths
> it needs, no access to prod paths) once the Vault policy structure is ingested.
> TODO: Confirm whether ansible-vault is in use for any existing playbooks and
> migrate to Vault runtime lookups per the `documentation` playbook rework task.
