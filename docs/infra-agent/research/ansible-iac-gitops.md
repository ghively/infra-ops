# Ansible IaC + GitOps Best Practices for an AI Infra Agent

**Audience:** A Claude Code agent that manages Ansible-based IaC in a mixed Windows + Linux estate, on self-hosted GitLab with CI/CD, currently fronted by Octopus Deploy for deployments. Goals: auto-documentation / change-tracking, auditing, and information-gathering.

**Researched:** 2026-06 — sources are 2024–2026. URLs are listed per-section and consolidated at the end.

---

## 0. The single most important architectural idea

**The AI agent never runs `ansible-playbook` against production. It only edits code and opens merge requests; CI/CD applies changes after a human approves.** This turns every infra change into a reviewable, revertible, attributable Git artifact and creates a hard trust boundary between "AI proposes" and "infrastructure changes." Everything below reinforces that boundary.

---

## 1. Ansible project / repo structure at scale

### Recommended layout (auditable, single-repo to start)

Based on the Red Hat Communities of Practice (CoP) "Good Practices for Ansible" guide and community consensus:

```
repo/
  ansible.cfg                  # pinned config, see below
  requirements.yml             # collections (galaxy) — first-class artifact
  requirements.txt             # python deps (or pyproject.toml)
  collections/                 # vendored/installed collections (gitignored or pinned)
  inventories/
    prod/
      hosts.yml                # static + dynamic plugin configs
      group_vars/
        all/                   # directory, not single file
          main.yml
          vault.yml            # ansible-vault encrypted
        linux/main.yml
        windows/main.yml
      host_vars/
        web01/main.yml
    staging/
      ...
  playbooks/
    site.yml
    linux/*.yml
    windows/*.yml
  roles/                       # local roles (prefixed vars)
  collections/ (or galaxy roles via requirements.yml)
```

### Key decisions

- **Inventory as a directory, not a single file**, split by environment (`prod/`, `staging/`). One inventory file per environment isolates blast radius and prevents "wrong environment" mistakes. (Spacelift, Red Hat CoP)
- **`group_vars/<group>/` as directories** (not single `.yml`). Every file inside is auto-loaded, which reduces merge conflicts with multiple maintainers and lets you separate secrets (`vault.yml`) from plain vars. Put role-scoped vars under `group_vars/<group>/<role>.yml`. (enginyoyen best-practices repo, Spacelift)
- **Variables live in inventory, not in plays.** Red Hat CoP: "Avoid playbook and play variables, as well as `include_vars`. Opt for inventory variables instead." This keeps a clean code/data boundary and makes precedence predictable.
- **Variable naming conventions (critical for an AI agent to follow):** role variables begin with the role name (`nginx_packages`); internal vars use `__double_underscore`; module/tag names within a role are role-prefixed to avoid collisions. (Red Hat CoP)

### Roles vs. collections

- **Roles** remain the unit of reusable, function-scoped automation.
- **Collections** are the modern packaging/distribution unit — they bundle roles + modules + plugins with namespace isolation and semver. Roles and collections are not mutually exclusive; a collection can contain roles.
- Guidance: keep playbooks + inventory in your repo; consume reusable roles via **`requirements.yml`** (Galaxy/collections) rather than copy-pasting roles. Treat `requirements.yml` and `requirements.txt` as first-class, version-pinned artifacts. (Spacelift, oneuptime)
- **Polyrepo** (shared roles in their own repos, app teams own playbooks, inventory separate) is the scale-out pattern for large orgs but adds versioning/dependency overhead. Start single-repo; split only when team independence demands it. (oneuptime)

### `ansible.cfg` and dynamic inventory

- Pin a project-local `ansible.cfg` (committed) so behavior is reproducible in CI and locally: set `inventory`, `roles_path`, `collections_path`, `stdout_callback`, `callbacks_enabled` (for ARA/profiling), `host_key_checking`, retry/forks. A committed config is itself an audit artifact.
- Prefer **dynamic inventory plugins** (cloud, CMDB, `constructed`) over hand-maintained host lists where possible, configured via inventory-directory plugin YAML. Red Hat CoP distinguishes "As-Is" (discovered) from "To-Be" (desired) inventory data.

### Mixed Windows (WinRM) + Linux (SSH) in one project

This is well-supported and the recommended pattern:

- Ansible picks a **connection plugin per host/group** from inventory. Linux uses `ssh` (default); Windows uses `winrm` or `psrp` (both over WinRM), or increasingly **SSH on Windows** (OpenSSH). (Ansible docs: Windows Remote Management; AnsiblePilot)
- Set connection vars in `group_vars/windows/` and `group_vars/linux/`:
  ```yaml
  # group_vars/windows/main.yml
  ansible_connection: winrm        # or psrp
  ansible_winrm_transport: ntlm    # or kerberos/credssp/certificate
  ansible_port: 5986
  ```
- Use the **`ansible.windows`** and **`community.windows`** collections (plus `microsoft.ad`, `chocolatey.chocolatey`) for Windows modules — they are PowerShell-based and run on the Windows host. Gate Windows vs. Linux tasks with `when: ansible_os_family == "Windows"` or by targeting separate plays/groups. (Ansible docs: Managing Windows hosts; theodo.cloud, middlewareinventory)
- **Agent guardrail note:** the Claude Code + Ansible field test below found the model "sometimes forgets `when: ansible_os_family` conditionals" — so OS-targeting must be enforced by structure (separate plays/group_vars) and by lint rules, not left to the model.

Sources: Red Hat CoP good-practices; Spacelift best-practices; enginyoyen/ansible-best-practises; Ansible docs (intro_windows, windows_winrm); AnsiblePilot; theodo.cloud; oneuptime polyrepo.

---

## 2. Quality gates / testing — what belongs in the Ansible CI pipeline

Layered, fail-fast pipeline (run on every MR):

1. **`yamllint`** — YAML well-formedness/style. Fastest gate.
2. **`ansible-lint`** — semantic/best-practice rules (FQCN usage, deprecated syntax, idempotency smells, risky `command`/`shell` usage). Run with a committed `.ansible-lint` profile.
3. **`ansible-playbook --syntax-check`** — catches structural errors without contacting hosts.
4. **`--check --diff` (dry run)** against a non-prod/staging inventory — shows what *would* change. Doubles as drift detection (see §4).
5. **Molecule** — per-role testing in ephemeral Docker/Podman containers (or VMs). The Molecule sequence is: dependency → create → prepare → converge → **idempotence** → verify → destroy. Molecule runs `converge` twice and **fails if the second run reports any change** — this is the canonical idempotency gate.
6. **Testinfra / Serverspec / InSpec** (`verify` step) — assert post-converge system state (packages installed, services running, ports open).
7. **`assert`-based control checks** — encode compliance controls as tasks validated by `ansible.builtin.assert`, generating auditor-facing reports.

### Pipeline notes

- Use a custom **Execution Environment / container image** with pinned `ansible-core`, collections, and lint versions so CI is reproducible.
- Windows roles are harder to Molecule-test in containers; test Windows on a dedicated ephemeral VM runner or in staging via `--check`.
- "Testing Ansible code is not optional for production workloads." Lint + syntax + idempotence should be **required** MR gates; Molecule/Testinfra are required for roles touching critical systems.

Sources: oneuptime (Test Roles with GitLab CI, Molecule, Testinfra, check-mode, assert-based tests); yrkan.com Molecule tutorial; teachmeansible lint+molecule; Ansible forum GitLab CI tips; Ansible docs check/diff mode.

---

## 3. Secrets — and keeping the AI agent away from plaintext

### Options

- **`ansible-vault`** — built-in, simple, encrypts files/vars at rest in Git. No dynamic secrets, password-based (coarse) access control, limited scale. Good for small/medium estates.
- **HashiCorp Vault (or AWS/Azure secret managers)** — central store, **dynamic/short-lived secrets**, fine-grained ACLs, audit log, rotation. More infra to run. Preferred at enterprise scale.
- **Combined (recommended):** Vault is the source of truth; Ansible pulls secrets **at runtime** via the `community.hashi_vault` lookup/collection so nothing sensitive is committed at all. Event-Driven Ansible can react to Vault events.

### Patterns that keep an AI agent from ever touching plaintext

1. **Agent has zero access to vault passwords / Vault tokens.** Decryption keys live only in the CI runner's protected/masked variables (GitLab CI/CD variables, or fetched from Vault by the runner). The agent edits *references*, never values.
2. **External-secrets pattern:** the playbook does `lookup('community.hashi_vault.vault_kv2_get', ...)` at runtime. The repo (and therefore the agent) contains only paths, never secrets.
3. **`vault_` prefix convention** to clearly separate secret variables from plain ones, with the secret variables stored in encrypted `vault.yml` files referenced by plain vars.
4. **`no_log: true`** on every task that handles secrets so values never appear in logs/ARA/console — important because the agent *reads* run output.
5. **CI secret scanning** (GitLab Secret Detection / gitleaks) as a required MR gate to catch any secret the agent accidentally hardcodes — directly mitigating the observed failure mode where the model "knows vault syntax but sometimes hardcodes values it shouldn't."

Sources: arnav.au (HashiCorp vs Ansible Vault); oneuptime (Ansible+Vault, secrets best practices, Vault in CI/CD); Red Hat (Vault + AAP); HashiCorp (Vault SSH + AAP, EDA + Vault).

---

## 4. Change tracking & audit for Ansible runs

### "What changed, when, by whom"

- **ARA (ARA Records Ansible)** is the primary tool. It's a **callback plugin** that records every play/task/result/host/fact/timing to SQLite/MySQL/PostgreSQL and exposes a CLI, REST API, and self-hosted web UI. Enable via `ANSIBLE_CALLBACK_PLUGINS` / `callbacks_enabled` in `ansible.cfg`. It gives a searchable, browsable history of every run — built for compliance audits, change management, and CI/CD tracking. (ara.recordsansible.org, github.com/ansible-community/ara)
- **"By whom" comes from Git + CI, not from Ansible itself.** Because the agent only opens MRs and CI applies them, the audit chain is: Git commit author + MR approver → CI pipeline ID/trigger user → ARA run record → host-level changes. ARA correlates the *what/when*; GitLab correlates the *who/why*. Tag ARA runs with the GitLab pipeline/commit SHA to join them.
- **Other callback plugins**: `log_plays` (per-host log files), JSON callbacks shipped to a SIEM/log aggregator, profiling callbacks for timing.

### Drift detection

- **Scheduled `--check --diff` runs** are the standard drift detector: run `site.yml --check --diff` on a cron/CI schedule against prod and capture the diff. Any non-empty change set = drift. Example: `0 */6 * * * ansible-playbook site.yml --check --diff > /var/log/ansible-drift.log`.
- Patterns that **raise an error/handler on drift** (ansiblejunky/ansible-project-configuration-drift) turn drift into a failing pipeline / alert rather than a silent log line.
- For an audit-grade story: scheduled check-mode in CI → publish the diff as a pipeline artifact + ARA record → alert if non-empty. This gives continuous, point-in-time-stamped compliance evidence.

Sources: ara.recordsansible.org; github.com/ansible-community/ara; ansiblepilot ARA; oneuptime (ARA reporting, callback plugin, drift detection, check mode); spacelift drift management; jwkenney drift audit; ansiblejunky drift repo; Ansible docs check/diff.

---

## 5. GitOps for Ansible

### The pattern

Humans/agents only edit code + open MRs; **CI applies changes after approval.** Pros: full Git audit trail, peer review, easy rollback (revert commit), reproducibility, and a clean place to insert the AI agent (it produces MRs, never side effects). Cons: Ansible is **imperative/push-based**, so there's no native continuous-reconciliation loop like Kubernetes has.

### Is there an "Argo/Flux for Ansible"? — Not exactly, and that's the key nuance

- Argo CD / Flux are **pull-based reconcilers** that live *inside a Kubernetes cluster* and continuously converge cluster state to Git. They **cannot manage off-cluster things** (VMs, network gear, Windows hosts) — which is exactly Ansible's domain. So they are complementary, not replacements.
- The closest Ansible-native equivalents:
  - **Push/CI-triggered GitOps (recommended start):** GitLab CI runs `ansible-playbook` on merge to `main` (gated by MR approval rules / protected branches / manual `when: manual` apply jobs). Simple, auditable, no extra infra.
  - **Event-Driven Ansible (EDA) + rulebooks:** a rulebook subscribes to a Git webhook (or Kafka/webhook source) and triggers a job on push/merge — gives a more reactive, near-real-time GitOps loop. Rulebooks define *when*; playbooks define *what*.
  - **AWX / Ansible Automation Platform** job templates + webhook triggers + survey/approval nodes for a managed control plane with RBAC and built-in approvals.
- **Approvals:** enforce via GitLab **protected branches + required approvers + CODEOWNERS** on inventory/prod paths, plus a **manual gated apply job** for production. This is where the human-in-the-loop lives.
- **Push vs pull:** Ansible is fundamentally push; "pull" approximations are scheduled re-runs (cron `--check`/apply) or `ansible-pull`. For most mixed Win/Linux estates, **CI-push with manual prod gate** is the pragmatic, auditable choice.

### Where Octopus Deploy fits

Octopus is deployment-/release-orchestration-focused (not config management). It runs Ansible via "Deploy a package" + "Run a Script" steps and adds release dashboards, environment promotion, and manual-approval gates. A reasonable target architecture: **GitLab = code + CI quality gates + MR approvals; Octopus (or GitLab environments) = release promotion + prod approval gate; Ansible = the actual change engine; ARA + Git = audit.** Over time the team may collapse Octopus into GitLab environments, but it can remain the prod approval gate.

Sources: CNCF GitOps 2025; medium muhabbat.dev (Ansible + GitOps); Red Hat (getting started with EDA; GitOps approval); Ansible rulebook docs; redhat-scholars EDA; Terraform Registry GitOps-with-AAP; Octopus (Ansible integration, Managing Ansible deployments).

---

## 6. PRIOR ART — LLMs / Claude / AI agents managing Ansible, IaC & GitLab

### What exists today (tools)

- **GitLab MCP server (official):** OAuth 2.0, lets Claude Code/Desktop/Cursor read projects/issues/MRs and perform GitLab actions. Beta as of GitLab 18.6; ~15 tools; **requires Premium/Ultimate**. Self-hosted supported via API URL. GitLab explicitly warns: *"You're responsible for guarding against prompt injection… use MCP tools only on GitLab objects you trust."*
- **Community GitLab MCP servers** (important for self-hosted CE / cost): `zereight/gitlab-mcp` (100+ tools, ~1.4k stars, point `GITLAB_API_URL` at your instance), `yoda-digital/mcp-gitlab-server` (86 tools). These cover MRs, issues, pipelines, wiki, releases — the full GitOps loop without the Premium gate.
- **`ansible.mcp` collection (official, early-stage):** modules `run_tool`, `server_info`, `tools_info` + an `mcp` connection plugin. Note: this lets **Ansible call MCP servers** (Ansible as MCP *client*), not the reverse — useful for agentic playbooks, less so as the agent's control surface. Requires ansible-core ≥2.16, Python 3.10+. No documented guardrails.
- **Ansible Development Tools MCP Server** (`docs.ansible.com/projects/vscode-ansible/mcp/`) exposes Ansible dev tooling (lint, navigator, creator) to AI assistants — good for an *authoring* agent.
- **Community Ansible MCP servers** (`bsahane/mcp-ansible`, `bjeans/homelab-mcp`) expose inventories/playbooks/roles + pre-push validation and security checks.
- **Claude Code skills/subagents for Ansible** (`0xfurai/claude-code-subagents` ansible-expert; mcpmarket Ansible skill): encode Ansible best practices into a skill so the model applies them automatically → "more consistent outputs, fewer mistakes."

### What people report works

- **Claude Code reliably generates ~80% of a playbook**: correct handlers, `changed_when`, service enablement, and **FQCN** (`ansible.builtin.*`). Strong at **debugging** from facts (spotting `apt` vs `dnf`, wrong service names) by reading `ansible_facts`.
- **The `--check` first, then apply** loop is the single most effective human/agent workflow — it catches wrong module names, missing vars, and permission issues before touching servers. Predicted `changed=N` matched real runs.
- Encoding conventions as **skills/system prompts** materially improves consistency.

### Failure modes when an AI touches infra (the important part)

1. **Hardcoding secrets** — "knows vault syntax but sometimes hardcodes values it shouldn't." → mitigate with secret scanning + agent never seeing real secrets.
2. **Dropping OS conditionals** — "sometimes forgets `when: ansible_os_family`," dangerous in mixed Win/Linux. → enforce via structure + lint, not trust.
3. **Reaching for `command`/`shell`** instead of idempotent built-in modules → breaks idempotency; catch with ansible-lint + Molecule idempotence gate.
4. **Hallucination / non-idempotent imperative actions** — general IaC-agent finding: imperative API calls have no idempotency guarantee (run `CreateSubnet` twice → two subnets). Declarative + plan/apply trust boundary is the antidote; for Ansible that's **`--check --diff` review before apply.**
5. **Limited context / no long-term memory** — agents run out of tokens mid-task and lose state on large changes → keep changes small and MR-scoped.
6. **Ambiguous prompts → suboptimal/nonsensical changes** → specify target OS/host/intent explicitly; the field guide stresses "Install Nginx on Debian 12 using apt," not "install nginx."
7. **Prompt injection via MCP/tool content** — GitLab's own warning; untrusted issue/MR/wiki text fetched via MCP can carry instructions. → treat all fetched GitLab/host content as untrusted; restrict MCP tools to trusted objects; prefer read-mostly scopes.

### Consensus guardrail recipe (from the prior art)

- AI generates code → **`--check --diff`** → **human reviews diff** → CI lint/test gates → **human approves MR** → CI applies. Humans own "the final 20%": env-specific tweaks, hardening, prod approval. "Always review generated code for security, prompt injection, and correctness before executing."

Sources: GitLab MCP docs (mcp_server, tools, clients); about.gitlab.com Duo + MCP; github.com/ansible-collections/ansible.mcp; docs.ansible.com vscode-ansible MCP; zereight/gitlab-mcp; yoda-digital/mcp-gitlab-server; bsahane/mcp-ansible; bjeans/homelab-mcp; computingforgeeks Claude Code + Ansible (tested); 0xfurai/claude-code-subagents; introl.com LLM IaC; sjramblings.io IaC vs AI agents; medium/binbash AI + IaC; firefly.ai agentic Terraform; rootly SRE IaC 2025; milvus Claude Code DevOps.

---

## Recommended toolchain (concrete)

| Concern | Recommendation |
|---|---|
| Repo layout | Single repo, inventory-as-directory per env, `group_vars/<group>/` dirs, role-name-prefixed vars (Red Hat CoP layout) |
| Mixed OS | `group_vars/linux` (ssh) + `group_vars/windows` (winrm/psrp); `ansible.windows`/`community.windows`/`microsoft.ad`; separate plays per OS |
| Dependencies | `requirements.yml` (collections) + `requirements.txt`, pinned; custom Execution Environment image for CI |
| Lint/test (MR-required) | `yamllint` → `ansible-lint` → `--syntax-check` → `--check --diff` (staging) → Molecule (idempotence) → Testinfra |
| Secrets | HashiCorp Vault as source of truth + `community.hashi_vault` runtime lookups; `ansible-vault` only for low-sensitivity; `no_log: true`; GitLab Secret Detection gate; **agent never sees vault keys** |
| Audit / change tracking | **ARA** callback (Postgres) tagged with commit SHA + pipeline ID; scheduled `--check --diff` drift job publishing diffs as artifacts |
| GitOps | GitLab protected branches + CODEOWNERS + required approvals; CI apply on merge with **manual prod gate**; optional EDA rulebook on Git webhook; AWX/AAP if a managed control plane is wanted |
| Release gate | Keep Octopus (or migrate to GitLab environments) as the prod approval/promotion gate; Ansible via package+script steps |
| AI agent surface | Community GitLab MCP (`zereight/gitlab-mcp`) pointed at self-hosted instance for MR/pipeline ops; Ansible Dev Tools MCP for authoring/lint; Claude Code **skill** encoding the conventions above |

---

## Pitfalls / anti-patterns

- **Letting the agent run `ansible-playbook` against prod.** Agent = code + MRs only; CI applies. This is the whole ballgame.
- **Giving the agent vault passwords or Vault tokens.** Decryption stays in CI runners; agent edits references only.
- **Trusting the model to add OS conditionals / use idempotent modules.** Enforce via repo structure + ansible-lint + Molecule idempotence — never via prompt-hope.
- **Single monolithic inventory file** shared across environments → "wrong env" blast radius. Split per env.
- **Variables in plays / `include_vars`** instead of inventory → precedence chaos, poor auditability.
- **`command`/`shell` where a module exists** → breaks idempotency and check-mode/drift detection.
- **No `no_log` on secret tasks** → secrets leak into console/ARA, which the agent then reads.
- **Treating MCP-fetched GitLab/host text as trusted** → prompt-injection vector (GitLab's explicit warning).
- **Assuming Argo/Flux can manage VMs/Windows/network gear** → they can't; that's Ansible's job. Don't force-fit.
- **Premium-gated GitLab MCP as the only option** for a self-hosted CE/cost-sensitive shop → use community MCP servers.
- **Skipping the `--check --diff` review step** → removes the one trust boundary that catches hallucinated/non-idempotent changes.

---

## Sources

### 1. Repo structure / mixed OS
- Red Hat CoP — Good Practices for Ansible: https://redhat-cop.github.io/automation-good-practices/
- Spacelift — 50+ Ansible Best Practices: https://spacelift.io/blog/ansible-best-practices
- enginyoyen/ansible-best-practises: https://github.com/enginyoyen/ansible-best-practises
- Ansible docs — Sample setup: https://docs.ansible.com/projects/ansible/latest/tips_tricks/sample_setup.html
- oneuptime — Ansible Polyrepo: https://oneuptime.com/blog/post/2026-02-21-how-to-use-ansible-with-polyrepo-structure/view
- Ansible docs — Managing Windows hosts: https://docs.ansible.com/projects/ansible/latest/os_guide/intro_windows.html
- Ansible docs — Windows Remote Management: https://docs.ansible.com/ansible/latest/os_guide/windows_winrm.html
- AnsiblePilot — Connection types: https://www.ansiblepilot.com/articles/ansible-connection-types-ssh-winrm-local-docker-network-guide
- Theodo — Ansible on Windows and Linux: https://cloud.theodo.com/en/blog/ansible-windows-linux
- Middleware Inventory — Ansible Windows example: https://www.middlewareinventory.com/blog/how-to-use-ansible-with-windows-host-ansible-windows-example/

### 2. Testing / CI
- oneuptime — Test Ansible Roles with GitLab CI: https://oneuptime.com/blog/post/2026-02-21-ansible-test-roles-gitlab-ci/view
- yrkan.com — Ansible Testing with Molecule: https://yrkan.com/blog/ansible-testing-with-molecule/
- TeachMeAnsible — Lint & Molecule: https://teachmeansible.com/learn/lint-molecule
- oneuptime — Testinfra: https://oneuptime.com/blog/post/2026-02-21-testinfra-ansible-testing/view
- oneuptime — check mode validation: https://oneuptime.com/blog/post/2026-02-21-ansible-check-mode-validation/view
- Ansible forum — GitLab CI tips: https://forum.ansible.com/t/ansible-ci-pipeline-tips-for-gitlab-ci/11123
- Ansible docs — check/diff mode: https://docs.ansible.com/projects/ansible/latest/playbook_guide/playbooks_checkmode.html

### 3. Secrets
- arnav.au — HashiCorp Vault vs Ansible Vault: https://arnav.au/2025/12/12/hashicorp-vault-vs-ansible-vault/
- oneuptime — Ansible + HashiCorp Vault: https://oneuptime.com/blog/post/2026-02-21-ansible-hashicorp-vault-secrets/view
- oneuptime — Manage Ansible Secrets best practices: https://oneuptime.com/blog/post/2026-02-21-how-to-manage-ansible-secrets-best-practices/view
- oneuptime — Vault in CI/CD: https://oneuptime.com/blog/post/2026-02-21-ansible-hashicorp-vault-cicd/view
- Red Hat — Vault + AAP: https://www.redhat.com/en/blog/automating-secrets-management-hashicorp-vault-and-red-hat-ansible-automation-platform
- HashiCorp — Agentless Vault secret automation with EDA: https://www.hashicorp.com/en/resources/agentless-vault-secret-automation-with-event-driven-ansible

### 4. Audit / change tracking / drift
- ARA Records Ansible: https://ara.recordsansible.org/
- ARA GitHub: https://github.com/ansible-community/ara
- oneuptime — ARA reporting: https://oneuptime.com/blog/post/2026-02-21-ansible-ara-records-reporting/view
- oneuptime — Drift detection: https://oneuptime.com/blog/post/2026-02-21-how-to-use-ansible-for-configuration-drift-detection/view
- Spacelift — Configuration drift management: https://spacelift.io/blog/ansible-configuration-drift-management
- jwkenney — Auditing configuration drift: https://jwkenney.github.io/auditing-configuration-drift/
- ansiblejunky — Config drift repo: https://github.com/ansiblejunky/ansible-project-configuration-drift

### 5. GitOps / EDA
- CNCF — GitOps in 2025: https://www.cncf.io/blog/2025/06/09/gitops-in-2025-from-old-school-updates-to-the-modern-way/
- Medium (muhabbat.dev) — Ansible and GitOps: https://medium.com/@muhabbat.dev/ansible-and-gitops-a-practical-guide-a3b5bb37397c
- Red Hat — Getting started with Event-Driven Ansible: https://www.redhat.com/en/blog/getting-started-with-event-driven-ansible
- Red Hat — GitOps approval for deployment: https://www.redhat.com/en/blog/gitops-approval-application-deployment-environment
- Ansible Rulebook docs: https://docs.ansible.com/projects/rulebook/en/latest/introduction.html
- Terraform Registry — GitOps with Terraform + AAP: https://registry.terraform.io/providers/IBM/ode/latest/docs/guides/gitops-with-terraform-aap
- Octopus — Ansible integration: https://octopus.com/integrations/ansible
- Octopus — Managing Ansible deployments with Octopus: https://octopus.com/blog/octopus-ansible

### 6. AI / LLM prior art
- GitLab MCP server docs: https://docs.gitlab.com/user/gitlab_duo/model_context_protocol/mcp_server/
- GitLab MCP server tools: https://docs.gitlab.com/user/gitlab_duo/model_context_protocol/mcp_server_tools/
- GitLab — Duo Agent Platform with MCP: https://about.gitlab.com/blog/duo-agent-platform-with-mcp/
- ansible.mcp collection: https://github.com/ansible-collections/ansible.mcp
- Ansible Dev Tools MCP server: https://docs.ansible.com/projects/vscode-ansible/mcp/
- zereight/gitlab-mcp (community, self-hosted): https://github.com/zereight/gitlab-mcp
- yoda-digital/mcp-gitlab-server: https://github.com/yoda-digital/mcp-gitlab-server
- bsahane/mcp-ansible: https://github.com/bsahane/mcp-ansible
- bjeans/homelab-mcp: https://github.com/bjeans/homelab-mcp
- computingforgeeks — Generate & Debug Ansible Playbooks with Claude Code (tested): https://computingforgeeks.com/claude-code-ansible-guide/
- 0xfurai/claude-code-subagents — ansible-expert: https://github.com/0xfurai/claude-code-subagents/blob/main/agents/ansible-expert.md
- Introl — Infrastructure Automation with AI / LLMs for IaC: https://introl.com/blog/infrastructure-automation-ai-using-llms-generate-iac-scripts
- sjramblings — Is IaC the next abstraction to fall (AI agents vs Terraform): https://sjramblings.io/is-infrastructure-as-code-the-next-abstraction-to-fall/
- Medium/binbash — AI and the end of IaC: https://medium.com/binbash-inc/ai-and-the-maybe-end-of-infrastructure-as-code-what-comes-after-terraform-opentofu-9186d3e675c0
- Rootly — IaC SRE automation tools 2025: https://rootly.com/sre/infrastructure-as-code-sre-automation-tools-for-2025
- Milvus — Claude Code for DevOps: https://milvus.io/ai-quick-reference/how-do-i-use-claude-code-for-devops-tasks
