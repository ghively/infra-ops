---
name: ansible-patterns
description: >
  Ansible repo layout, FQCN, idempotency, mixed Windows+Linux patterns, no-command/shell
  rule, role variable naming, inventory-as-directory, group_vars directories.
  Triggers on: ansible, playbook, role, inventory, winrm, psrp, idempotent, FQCN.
origin: infra-ops
---

# Ansible Patterns Skill

## When to Use

Load this skill when authoring or reviewing any Ansible playbook, role, collection, or
inventory file. Applies to mixed Windows/Linux estates, new roles, updates to existing
playbooks, and any MR touching `inventories/`, `roles/`, `playbooks/`, or `*.yml` files
under the Ansible repos.

## How It Works

### Repo Layout (Red Hat CoP canonical)

```
repo/
  ansible.cfg                   # committed; pins inventory, roles_path, callbacks_enabled
  requirements.yml              # pinned exact versions for all collections and roles
  requirements.lock.yml         # machine-generated transitive-version record
  inventories/
    dev/
      hosts.yml
      group_vars/
        all/          # directory, not a single file — auto-loads every YAML inside
          main.yml
          vault.yml   # ansible-vault encrypted secrets
        linux/main.yml
        windows/main.yml
      host_vars/
    test/  staging/  prod/       # one directory per environment — isolates blast radius
  playbooks/
    site.yml
    linux/*.yml
    windows/*.yml
  roles/                        # local roles, name-prefixed vars
  collections/requirements.yml  # or galaxy_requirements.yml
```

Source: Red Hat CoP "Good Practices for Ansible"; ansible-iac-gitops.md §1; modular-ansible-repos.md §6.

### Key Decisions

- **Inventory as a directory per environment** — prevents wrong-env blast radius. One dir
  per env (`dev/`, `staging/`, `prod/`). Invoke with `-i inventories/prod`. Set
  `inventory = ./inventories/dev` in `ansible.cfg` as a safe default so workstation runs
  cannot accidentally target prod. (DigitalOcean multi-stage guide; multi-env-versioning.md §1.2)

- **`group_vars/<group>/` as directories** — every YAML file inside is auto-loaded;
  reduces merge conflicts; separates `vault.yml` (encrypted secrets) from plain vars.
  Role-scoped vars go in `group_vars/<group>/<role>.yml`. (Red Hat CoP; ansible-iac-gitops.md §1)

- **Variables live in inventory, never in plays** — Red Hat CoP: "Avoid playbook and play
  variables as well as `include_vars`. Opt for inventory variables instead." Keeps a clean
  code/data boundary and makes variable precedence predictable. (ansible-iac-gitops.md §1)

- **Role variable naming** — role vars must start with the role name (`nginx_port`, not
  `port`); internal vars use `__double_underscore`. (Red Hat CoP; modular-ansible-repos.md §4)

- **FQCN everywhere** — use `ansible.builtin.copy`, `ansible.windows.win_service`, etc.
  Claude Code generates FQCN ~80% of the time naturally; lint enforces the rest.
  (ansible-iac-gitops.md §6 — prior-art finding)

- **Never `command` or `shell` where a module exists** — breaks idempotency and
  `--check --diff` drift detection; caught by `ansible-lint` + Molecule idempotence gate.
  When genuinely unavoidable, use **`ansible.builtin.command` (not `shell`)** with the
  sanctioned idempotency guard — `creates:`/`removes:` for state, or `changed_when:` for
  read-only queries — and a comment explaining why no module covers it:

  ```yaml
  # Sanctioned escape hatch: no module covers this, guarded for idempotency
  - name: Initialize the widget store (only once)
    ansible.builtin.command: widgetctl init
    args:
      creates: /var/lib/widget/.initialized   # makes it idempotent
  ```
  (ansible-iac-gitops.md §§1,6; ansible-testing skill)

- **Validate role inputs with `meta/argument_specs.yml`** — declare each role variable's
  type, required-ness, and description. This is a production-profile expectation and a
  strong correctness control for AI-authored roles (the role fails fast on a bad/missing
  arg instead of misbehaving downstream).

- **Mixed Windows + Linux by structure, not conditionals** — separate plays per OS group
  or separate playbook files. `group_vars/windows/` sets `ansible_connection: winrm` (or
  `psrp`) and WinRM transport; `group_vars/linux/` uses SSH defaults. Do NOT rely on
  `when: ansible_os_family == "Windows"` guards alone — the model "sometimes forgets them."
  Use `ansible.windows`, `community.windows`, `microsoft.ad` collections for Windows.
  Control node must be Linux; WinRM/Kerberos (domain-joined) or WinRM/NTLM+TLS
  (non-domain) drives both targets from one runner. (ansible-iac-gitops.md §1 Windows section)

```yaml
# group_vars/windows/main.yml
# Choose the connection per your AD/transport posture — do not assume a default.
# Kerberos over WinRM-HTTPS (5986) remains the PCI-defensible choice for AD-joined
# hosts; psrp is a valid alternative. ansible.windows/SSH-on-Windows has matured in
# ansible-core 2.18+ but is still estate-dependent.
ansible_connection: winrm         # or psrp — per transport posture
ansible_winrm_transport: kerberos # AD-joined preferred; NTLM+TLS for non-domain
ansible_port: 5986
```

> TODO: Expand with specific Kerberos setup checklist (krb5.conf, SPN registration)
> once the AD domain name is known from ingested network diagram.

### `ansible.cfg` (committed audit artifact)

Pin: `inventory`, `roles_path`, `collections_path`, `interpreter_python = auto_silent`,
`stdout_callback = yaml`, `callbacks_enabled = ara` (ARA for run tracking),
`host_key_checking = True`, `forks = 20`. A committed config is itself a
change-controlled artifact.
(ansible-iac-gitops.md §1; DESIGN.md §13)

### Trust Boundary

- Propose via MR; never run `ansible-playbook` directly against prod. (SPEC.md §2)
- Agent edits code and vars — never vault keys, never plaintext secrets.
- Windows SSH is **experimental** (ansible-core 2.18+, Windows Server 2022+ only) —
  do not use in production until it matures. (gitlab-octopus-cicd.md §5.1)

## Examples

```yaml
# Correct: FQCN, idempotent module, no command/shell
- name: Ensure nginx is installed (Linux)
  ansible.builtin.package:
    name: nginx
    state: present

# Correct: Windows module via FQCN
- name: Ensure IIS feature is present (Windows)
  ansible.windows.win_feature:
    name: Web-Server
    state: present

# Wrong: breaks idempotency
- name: Install nginx
  ansible.builtin.command: apt install -y nginx   # NEVER — use package module
```

> TODO: Add org-specific role-prefix convention once naming standards are confirmed
> from ingested runbooks.
> TODO: Add dynamic-inventory plugin examples once CMDB integration is known.

## Deep Reference

### FQCN Enforcement (Ansible Galaxy + Collections)
Every module call must use a Fully Qualified Collection Name. Short names
(`copy:`, `service:`) break when collections are installed and the resolver
picks the wrong one. There are no exceptions.

```yaml
# CORRECT
- ansible.builtin.copy:
- ansible.builtin.service:
- community.general.ufw:
- community.hashi_vault.hashi_vault_secret:
- ansible.windows.win_service:

# WRONG — never acceptable
- copy:
- service:
- win_service:
```

### Idempotency Checklist
Before marking a task idempotent, verify:
1. The module itself is idempotent (most ansible.builtin.* are; `command`/`shell` are not)
2. If using `command`/`shell`: `creates:` or `removes:` or `changed_when: false` is present
3. Running the play twice produces no changes on the second run (`--check --diff` shows nothing)
4. Any `notify:` handlers are also idempotent when run multiple times

### OS-Targeting by Structure (not `when:`)
```
# CORRECT structure — separate plays per OS in site.yml:
- hosts: linux_servers
  roles: [base-linux]

- hosts: windows_servers
  roles: [base-windows]

# WRONG — mixing OS logic in a shared role:
- name: Install service
  ansible.builtin.service:
    name: myservice
    state: started
  when: ansible_os_family != 'Windows'   # fragile; breaks on new OS families
```

### Variable Precedence (know it, don't fight it)
Order from weakest to strongest (last wins):
role defaults → inventory group_vars → inventory host_vars → playbook vars →
extra-vars (-e). Use role defaults for safe defaults; never duplicate a var
at multiple precedence levels with different intent.

### Windows Targets
Use `ansible.windows.*` and `community.windows.*` FQCNs. WinRM connection requires:
- `ansible_connection: winrm`
- `ansible_winrm_transport: kerberos` or `ntlm` (never `basic` in production)
- `ansible_winrm_server_cert_validation: validate` (never `ignore` in production)

### `no_log` Mandatory Patterns
```yaml
# Any task that touches secret values must suppress output:
- name: Retrieve DB password
  community.hashi_vault.hashi_vault_secret:
    url: "{{ vault_addr }}"
    path: "secret/db/password"
  register: db_secret
  no_log: true   # MANDATORY — vault response contains the secret value

- name: Create DB user
  community.mysql.mysql_user:
    name: app
    password: "{{ db_secret.secret.value }}"
  no_log: true   # MANDATORY — password is in task args
```

### CIS Benchmark Hardening Patterns (Linux)
When writing OS hardening roles, reference CIS Benchmark Level 1/2. Key patterns:
```yaml
# Disable unused filesystems (CIS 1.1.x)
- name: Disable cramfs
  ansible.builtin.lineinfile:
    path: /etc/modprobe.d/cramfs.conf
    line: "install cramfs /bin/false"
    create: true
    mode: '0644'

# Ensure rsyslog is running (CIS 4.2.x)
- name: Ensure rsyslog is enabled
  ansible.builtin.systemd:
    name: rsyslog
    state: started
    enabled: true
```

### Molecule Scenario Structure
Every new role ships with a Molecule scenario under `molecule/default/`:
```
roles/<name>/
  molecule/
    default/
      molecule.yml        # driver: podman; platforms: [{name: instance, image: ...}]
      converge.yml        # apply the role
      verify.yml          # assert expected state
      prepare.yml         # pre-role setup (optional)
```
The idempotence test runs `converge.yml` twice and asserts no changes on the second run.
