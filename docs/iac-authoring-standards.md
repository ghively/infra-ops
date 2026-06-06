# IaC Authoring Standards — what the `iac-author` agent follows

This is the human-readable consolidation of the engineering standards the
**`iac-author`** agent applies when it writes Ansible roles/playbooks and GitLab
CI/CD pipelines, and that the review gate (`playbook-reviewer`,
`pci-compliance-reviewer`, `secrets-scanner`) checks before anything merges.

> **Source-of-truth note.** This document *explains* the standards; it does not
> *define* them. The binding definitions live in the path-scoped rules under
> `rules/**` (auto-injected when a matching file is in context) and are enforced by
> hooks + the `iac-sast-scanning` CI gate + the deterministic merge gate. If this
> guide ever diverges from a rule, **the rule wins** — cite the rule, not this copy.
> Skills (`skills/ansible-patterns`, `skills/ansible-testing`,
> `skills/gitlab-cicd-pipeline`, `skills/secrets-vault`, `skills/supply-chain-and-sbom`)
> teach the *application*; this doc is the index over all of it.

## How standards are known and enforced

The plugin separates *teaching* from *binding* on purpose:

| Layer | Mechanism | Binding? |
|---|---|---|
| **Rules** (`rules/**`) | Auto-inject into context when a matching file (`**/*.yml`, `.gitlab-ci.yml`, …) is open. Deterministic. | The source of truth |
| **Skills** (`skills/*/SKILL.md`) | Lazy-loaded; teach how to apply the rules. | Advisory (teaching) |
| **Hooks** (`scripts/hooks/*`) | Runtime gates (`pan-egress-filter`, `gateguard-fact-force`, quality hooks). | Binding at the tool boundary |
| **CI gate** (`iac-sast-scanning` + `.gitlab-ci/components/iac-sast`) | ansible-lint / gitleaks / TruffleHog / Checkov → SARIF. | Binding in CI |
| **Review gate** | 3 reviewers in parallel emit `VERDICT: PASS\|WARN\|BLOCK`; any BLOCK blocks. | Binding (merge gate) |
| **Reviewer agents** | Severity-tiered judgement against the rules. | Advisory (the gate binds) |

See `rules/ansible/{coding-style,security,testing}.md`,
`rules/gitlab-ci/gitlab-ci-pipeline.md`, and `rules/secrets/secrets-management.md`.

---

## 0. Uniform structure — baked in and enforced

Before any of the standards below, the **layout is fixed**. Every new unit is stamped
from a canonical skeleton, never hand-built, so structure and deployment are uniform
across the estate:

| Unit | Template | Validate |
|---|---|---|
| Ansible role | `templates/ansible-role/` | `validate-structure.js --type ansible-role` |
| Ansible project | `templates/ansible-repo/` | `--type ansible-repo` |
| Terraform/OpenTofu module | `templates/terraform-module/` | `--type terraform-module` |
| Terraform/OpenTofu env | `templates/terraform-env/` | `--type terraform-env` |
| Packer image | `templates/packer-template/` | `--type packer-template` |
| Python tool | `templates/python-tool/` | `--type python-tool` |
| Bash tool | `templates/bash-tool/` | `--type bash-tool` |
| PowerShell tool | `templates/powershell-tool/` | `--type powershell-tool` |

- **Single source of truth:** `scripts/lib/structure-spec.js` declares the required
  files/dirs and content checks per type.
- **Scaffold, don't hand-build:** the `/scaffold` command copies the template and
  substitutes the name. The agent must not invent per-unit structures.
- **Deterministic gate:** `scripts/validate-structure.js` exits non-zero on any missing
  file/dir or failed content check; the `structure-conformance` CI component runs it over
  every `roles/*`, `modules/*`, `envs/*` and **fails the pipeline on deviation**.
- **Self-checked:** `tests/unit/structure.test.js` asserts the bundled templates always
  conform and that deviations are rejected, so the spec and templates cannot drift.

**Deployment is enforced too.** Every `.gitlab-ci.yml` must match the canonical pipeline
shape — declared `stages:`, the binding `iac-sast` + `structure-conformance` components,
`environment:` scoping, and **manual + protected-branch production** (no auto-apply to
prod). `scripts/lib/deployment-policy.js` defines it; `scripts/validate-deployment.js`
and the `deployment-conformance` CI job enforce it (`tests/unit/deployment.test.js`).

This is the difference between *advising* a structure and *enforcing* one: a
non-conformant unit or pipeline cannot pass CI, regardless of any agent's judgement.

---

## 1. Ansible authoring standards

### FQCN always

Every module call uses its Fully Qualified Collection Name. Short names are
deprecated, ambiguous across namespaces, and fail `ansible-lint`.

```yaml
# GOOD
- name: Install nginx
  ansible.builtin.package:
    name: nginx
    state: present

# BAD — short name, no namespace
- name: Install nginx
  package: { name: nginx, state: present }
```

### Idempotency — modules over `command`/`shell`

Every task must be safe to run repeatedly with no side effects. Prefer a
purpose-built module; use `command`/`shell` only when no idiomatic module exists,
and then guard it (`creates:`, `removes:`, or `changed_when:`) with a comment
explaining why. A second consecutive run must report **zero changed tasks** — proven
by the Molecule idempotence test (§4).

```yaml
# GOOD — idempotent, tracks state
- name: Ensure firewalld is running
  ansible.builtin.service:
    name: firewalld
    state: started
    enabled: true

# BAD — not idempotent, no state tracking
- name: Start firewalld
  ansible.builtin.shell: systemctl start firewalld
```

### Variable naming & precedence

- Role variables are **prefixed with the role name** (`nginx_port`, `nginx_packages`).
- Internal/private vars use a `__double_underscore` prefix to mark them off-interface
  (`__nginx_computed_config`).
- Variables live in **inventory** (`group_vars/`, `host_vars/`) — *not* in play-level
  `vars:` blocks or `include_vars`. This keeps a clean code/data boundary and makes
  precedence predictable.

### Inventory-as-directory

One directory per environment; never a single flat file (which invites
"wrong-environment" mistakes and makes blast-radius containment impossible).
`group_vars/<group>/` are themselves directories so `vault.yml` (encrypted secrets)
is separated from plain vars.

```text
inventories/
  prod/
    hosts.yml
    group_vars/
      all/{main.yml,vault.yml}   # vault.yml = ansible-vault AES256 only
      linux/main.yml
      windows/main.yml
    host_vars/web01/main.yml
  staging/ …
  dev/ …
```

### OS targeting by structure

Target OS by **play/group structure**, not by trusting a runtime `when:` guard alone.
Windows tasks go in plays targeting `hosts: windows`; Linux in `hosts: linux`; connection
vars live in `group_vars/windows/` and `group_vars/linux/`. A `when: ansible_os_family`
guard is a secondary defence, never the primary control.

---

## 2. Secrets & sensitive data

### No hardcoded secrets — Vault references only

Passwords, tokens, API keys, and certificates must never appear in plaintext in any
playbook, role, var file, or inventory. Use Ansible Vault references:

```yaml
# GOOD — Vault reference; plaintext never lands in the file
db_password: "{{ vault_db_password }}"   # defined in group_vars/.../vault.yml (AES256)

# BAD — hardcoded secret
- ansible.builtin.lineinfile: { path: /etc/app/db.conf, line: "password=s3cr3t!" }
```

- Encrypted values live in `group_vars/<group>/vault.yml` (ansible-vault AES256).
- Reference vault vars with the `vault_` prefix so they're distinguishable at a glance.
- A plaintext (unencrypted) `vault.yml` **blocks the MR**.

### `no_log: true` on secret tasks

Any task that registers, prints, or processes a secret sets `no_log: true` — on the
task *and* any downstream task that consumes the registered value — so it never lands
in logs, callbacks, or ARA records.

### Crown jewels — hard stop

**PAN/cardholder data, cryptographic keys, key components, PINs, and HSM
configuration are entirely out of scope for authoring.** If a task would touch any of
them, stop and escalate to a human dual-control ceremony. This is enforced at runtime
by `pan-egress-filter` (corporate) and `hsa-boundary-guard` (in-zone), but the rule
applies *before* any tool call. No exception under any approval (CLAUDE.md rule #2).

---

## 3. Least privilege & transport security

- Service accounts get only the permissions the task requires; don't run as root where
  a scoped service account suffices.
- `become: true` + `become_user:` are scoped to the **task/block** that needs elevation,
  not the whole play unless unavoidable. The MR description states which escalation is
  needed and why.
- **Windows transport must be encrypted** — HTTPS WinRM on 5986, NTLM or Kerberos
  (Kerberos preferred for domain-joined hosts); `credssp` only with documented
  justification. Plain HTTP WinRM (5985) is prohibited.

---

## 4. The testing ladder — required MR gates

Every playbook/role MR passes these stages **in order**; a failing stage blocks
promotion (not optional). See `rules/ansible/testing.md` and `skills/ansible-testing`.

1. **`yamllint`** — static YAML structure; zero warnings.
2. **`ansible-lint`** — FQCN, idempotency patterns, deprecations, best-practice
   profile (pinned in `.ansible-lint`). No skips without a documented justification.
3. **Syntax check** — `ansible-playbook --syntax-check …` must exit 0 (validates Jinja2,
   role refs, module args without connecting to a host).
4. **`--check --diff` (dry-run)** — the single most important guard against unintended
   change. The agent always runs (or proposes) `--check --diff -i inventories/dev/ …`
   before any apply; a non-empty diff is reviewed and understood, never dismissed. The
   agent's check runs are **dev-only** and gated behind `gateguard-fact-force`.
5. **Molecule idempotence** — every role has a Molecule scenario that converges
   **twice** and asserts zero changed tasks on the second run. A role that reports
   `changed` on re-run is broken and must not merge.

**Pre-apply checklist (human reviewers):** all gates green · `--check --diff` reviewed
and matches intent · rollback plan in the MR · required GitLab approvals present.

---

## 5. GitLab CI/CD authoring

From `rules/gitlab-ci/gitlab-ci-pipeline.md` and `skills/gitlab-cicd-pipeline`:

- **Stages**: clear `validate → build → test → deploy`.
- **Environment scoping**: every deploy job declares `environment:` (`name`, `url`,
  `deployment_tier`).
- **Protected environments**: production runs `when: manual` on the default/protected
  branch only, requires approvals, and defines an `on_stop:` cleanup job.
- **Deployment safety ladder**: dev = auto on merge to main; test/staging = manual
  approval; production = manual approval + protected branch. **The agent triggers at
  most a gated *dev* deploy — never test/staging/prod.**
- **Quality gates first**: a `validate` stage runs `yamllint` → `--syntax-check` →
  `ansible-lint` before any deploy; the `iac-sast` component is the binding security gate.
- **Runner tags** name the capability (`docker`, `ansible`, and in-zone: `hsa`, `deploy`).
- **Efficiency/modern syntax**: `rules:` over `only/except:`; `needs:` for DAG ordering;
  cache between jobs; reuse CI components (`.gitlab-ci/components/*`).
- **Never hardcode secrets** in CI scripts — `governance-capture` flags
  approval-required commands.

---

## 6. Supply chain, change records & rollback

- **Supply chain (`skills/supply-chain-and-sbom`)**: pin collection/role versions
  (`requirements.yml`), generate an SBOM where the pipeline supports it, and prefer
  signed/verified sources.
- **Change record (`skills/change-documentation`)**: every MR carries what/why, the
  `--check --diff` evidence, the **blast radius** (which hosts, what breaks on failure),
  and an explicit, tested **rollback plan** (`skills/rollback-and-runbooks`).
- `change-scribe` generates the in-repo change record / ADR on merge.

---

## 7. The review gate & remediation loop

Authored changes go **concurrently** to three reviewers, each emitting a verdict token
on its first line:

- `playbook-reviewer` — correctness / idempotency
- `pci-compliance-reviewer` — PCI DSS controls
- `secrets-scanner` — static secret/PAN scan

**Merge gate (no discretion):** any `BLOCK` blocks; `WARN` is advisory; `PASS×3` clears.
On a BLOCK, the consolidated findings return to `iac-author` for **one** revision pass,
then re-review — capped at **2 cycles**, after which it escalates to a human. Never
merge around a BLOCK. (CLAUDE.md → "evaluator → remediation loop".)

---

## 8. The trust boundary (non-negotiable)

1. **Propose, never dispose** — author + open MRs; trigger CI and at most a gated *dev*
   deploy. Never run `ansible-playbook` against test/staging/prod; never auto-promote.
2. **Never touch crown jewels** — no cleartext PAN/CHD, keys/components, PINs, or HSM
   config, ever.
3. **Zone separation** — corporate (DSS) and HSA (CP/PIN, air-gapped) are separate;
   CHD-adjacent work runs on the local-only lane. HSA authoring uses the `perso-*`
   agents under separate CPSA-gated review (`knowledge/cpsa-approval.md`).
4. **Cite, don't guess** — scoping/compliance claims carry a documentation citation.

---

## 9. The agent's pre-MR checklist

What `iac-author` self-checks (and reviewers verify) before opening an MR:

- [ ] FQCN on every module call
- [ ] Idempotent modules; any `command`/`shell` is guarded + commented
- [ ] Role-prefixed vars; data in inventory, not play `vars:`
- [ ] Inventory-as-directory; secrets isolated in encrypted `vault.yml`
- [ ] OS targeted by play/group structure
- [ ] No plaintext secrets; Vault references; `no_log: true` on secret tasks
- [ ] No PAN/keys/PINs/HSM material anywhere
- [ ] Scoped `become:`; encrypted WinRM for Windows
- [ ] `yamllint` + `ansible-lint` + `--syntax-check` clean; Molecule idempotence proven
- [ ] `--check --diff` output captured and attached (dev inventory)
- [ ] CI declares stages/environments; prod is manual + protected; agent deploys dev only
- [ ] Change record + blast radius + rollback plan in the MR description
- [ ] Tagged for the three-way review gate

---

## References (binding sources)

- `rules/ansible/coding-style.md` — FQCN, idempotency, vars, inventory, OS targeting
- `rules/ansible/security.md` — secrets/Vault, `no_log`, least privilege, WinRM, crown jewels
- `rules/ansible/testing.md` — the five MR gates + pre-apply checklist
- `rules/gitlab-ci/gitlab-ci-pipeline.md` — CI stages, environments, protected deploys
- `rules/secrets/secrets-management.md` — secret detection + Vault handling
- `skills/ansible-patterns`, `skills/ansible-testing`, `skills/gitlab-cicd-pipeline`,
  `skills/secrets-vault`, `skills/supply-chain-and-sbom`, `skills/iac-sast-scanning`
- `agents/iac-author.md` — the agent's own mandatory authoring standards
- `CLAUDE.md` — orchestration contract, review gate, remediation loop, trust boundary
