# IaC & Automation Engineering Guide

The industry-standard reference for **choosing, structuring, and shipping**
infrastructure-as-code and automation across the toolchain — Terraform/OpenTofu,
Ansible, and Bash/PowerShell/Python. The actionable decision framework is the
[`iac-tooling-selection`](../skills/iac-tooling-selection/SKILL.md) skill; the
Ansible-execution detail is [`iac-authoring-standards.md`](iac-authoring-standards.md).
This doc is the connective tissue: management, repo structuring, CI/CD, deployment
methods, and scripting standards, with *when to use what and why*.

> **Source-of-truth note.** The binding, auto-injected standards are the path-scoped
> rules: `rules/ansible/*` (`**/*.yml`), `rules/terraform/terraform-style.md` (`**/*.tf`),
> `rules/scripts/scripting-standards.md` (`**/*.sh|ps1|py`), `rules/gitlab-ci/*`,
> `rules/secrets/*`. If this guide diverges from a rule, the rule wins. Confirm
> version-specific tool behavior via Context7 before authoring.
>
> **Estate grounding.** Current estate = **Ansible + self-hosted GitLab CI/CD + Octopus
> Deploy** under PCI DSS (corporate) and CPSA-gated PCI CP/PIN (HSA). Adopting a new tool
> (Terraform/OpenTofu state backend, a TACO, etc.) is a *planning proposal* with its own
> PCI-scope and migration review — propose it, never silently adopt.

---

## 1. The tool taxonomy (pick the category first)

| Category | What it's for | Tools | Model |
|---|---|---|---|
| **Provisioning** | Create/destroy infra resources | **Terraform / OpenTofu**, Pulumi, CloudFormation/CDK | Declarative, **stateful**, plan/diff |
| **Configuration mgmt** | Configure inside hosts; deploy apps | **Ansible** (estate standard), Chef, Puppet, Salt | Idempotent, agent(less), convergent |
| **Image building** | Bake golden/immutable images | **Packer** (+ Ansible provisioner) | Build-once-deploy-many |
| **Imperative scripting** | Glue, orchestration, data gathering | **Bash**, **PowerShell**, **Python** | Procedural |
| **Orchestration/GitOps** | Reconcile declared state continuously | Argo CD / Flux (k8s), Octopus, GitLab CD | Pull/push reconcile |

**Decision order:** category → tool within category → repo structure → CI/CD gating →
deployment method. Most real systems use *several* categories together (§7).

---

## 2. Provisioning: Terraform vs OpenTofu (and friends)

Terraform and **OpenTofu** share HCL and the `init → plan → apply` workflow; OpenTofu is
a drop-in fork. Decide on **licensing, governance, and platform features**:

- **OpenTofu** — Linux Foundation, **Apache-2.0** (genuinely open source). Native
  **client-side state encryption** (since 1.7), community RFC governance, no BSL usage
  restrictions. Strong default for a fresh, vendor-neutral estate.
- **Terraform** — **BSL 1.1** (since Aug 2023; IBM/HashiCorp). Choose it for **HCP
  Terraform / Terraform Cloud**, **Sentinel** policy, official support, or existing
  enterprise contracts.
- **Pulumi** — IaC in TypeScript/Python/Go/C#; pick when teams want a real language and
  testing over HCL, or complex logic that HCL fights.
- **CloudFormation / CDK** — only when AWS-locked and you want native, no-extra-state
  drift handling.

**Hard rules either way:** one engine per state; remote, locked, **encrypted** state;
never commit state (it may hold secrets); pin provider + module versions.

### When Ansible provisions instead

For *small/simple* resource creation tightly coupled to configuration, Ansible's cloud
modules are fine. For anything with real dependency graphs, lifecycle, or drift concerns,
use Terraform/OpenTofu — Ansible has no true plan/state model.

---

## 3. Configuration management: Ansible (estate standard)

See [`iac-authoring-standards.md`](iac-authoring-standards.md) for the full Ansible
standards (FQCN, idempotency, inventory-as-directory, Vault, the testing ladder). In a
mixed estate, Ansible's job is the **inside of the host** and app deployment — fed by
provisioning outputs, not doing the provisioning of complex stateful infra.

---

## 4. Repo structuring per tool

### Terraform / OpenTofu

- **Reusable modules** in `modules/<name>/` (`main.tf`, `variables.tf`, `outputs.tf`,
  `versions.tf`); thin **root modules** per environment compose them.
- **State isolation by blast radius** — separate state per environment *and* per layer
  (network / data / app). Never one giant state. Use a remote backend with locking
  (S3+DynamoDB, `azurerm`, GCS, OpenTofu/TF http backend, or a TACO).
- **Environments**: directory-per-env (`envs/{dev,staging,prod}/`) is clearer and safer
  than workspaces for prod separation; **Terragrunt** keeps it DRY at scale.
- **Pin everything** — `required_version`, provider version constraints, module versions.

```text
infra-terraform/
  modules/{network,compute,data}/{main,variables,outputs,versions}.tf
  envs/
    dev/{main.tf,backend.tf,terraform.tfvars}
    staging/…
    prod/…           # separate state, separate creds, manual apply
```

### Ansible

Inventory-as-directory per environment; roles with role-prefixed vars; secrets in
encrypted `vault.yml`. (Full detail in `iac-authoring-standards.md` §1.)

### Scripts

`scripts/` with a clear shebang, `lib/` for shared functions, and tests next to code
(`bats` for Bash, `Pester` for PowerShell, `pytest` for Python). One responsibility per
script; if it's growing modules, it's a Python package, not a script.

### Mono-repo vs multi-repo

- **Mono-repo** (provision + config + scripts together) eases cross-tool changes and
  atomic PRs; gate paths with CI `rules:`/`changes:`.
- **Multi-repo** suits independent lifecycles/ownership and tighter RBAC (e.g. a separate,
  ACL-restricted repo for the perso/HSA zone — required by CP §6.6.3).

---

## 5. CI/CD for IaC

### Terraform/OpenTofu pipeline

```
fmt/validate → tflint → security (Checkov/tfsec/Trivy) → plan (artifact, posted to MR)
            → [manual approval] → apply (locked state) → drift detection (scheduled)
```

- **`plan` on MR, `apply` on protected branch after human approval** — the agent
  proposes the plan; a human approves the apply. Never auto-apply to prod.
- **State locking** prevents concurrent applies; **policy-as-code** (OPA/Conftest,
  Sentinel) gates the plan; **drift detection** runs on a schedule.
- **TACOs / Atlantis** (HCP Terraform, Spacelift, Env0, Atlantis) automate the
  plan/approve/apply loop with state + policy built in.

### Ansible pipeline

The five-stage testing ladder + the binding `iac-sast` gate
(`.gitlab-ci/components/iac-sast`): `yamllint → ansible-lint → --syntax-check →
gitleaks/trufflehog/checkov → --check --diff → molecule`. (See `iac-authoring-standards.md` §4–5.)

### Shared CI principles

Pin tool images by digest; least-priv pipeline credentials; environment scoping and
**manual+protected production**; the agent triggers at most a gated **dev** deploy.

---

## 6. Deployment methods (and when to use them)

| Method | Use when | Notes |
|---|---|---|
| **Immutable** (replace, don't patch) | You can rebuild the artifact/image | Packer + Terraform; eliminates config drift. Prefer this. |
| **Mutable / in-place** (Ansible) | Hosts are long-lived / can't be replaced cheaply | Idempotency + drift detection are mandatory |
| **Blue-green** | Zero-downtime cutover, instant rollback | Two environments; switch traffic; keep old for rollback |
| **Canary** | Gradual risk exposure, metric-gated | Route a slice, watch SLOs, promote or abort |
| **Rolling** | Capacity-constrained, steady rollout | Batch by failure domain; health-check between batches |
| **GitOps reconcile** | Kubernetes / declarative platforms | Argo CD / Flux pull desired state from git |

**Industry default:** immutable + blue-green/canary for anything you can image; mutable
config-management (Ansible) only for what genuinely must change in place. Every method
ships with an explicit, tested **rollback** (`rollback-and-runbooks`).

---

## 7. Combining tools — the canonical pipelines

- **Packer → Terraform/OpenTofu → Ansible → Octopus/GitLab.** Bake the image, provision
  immutable infra, configure only the drift-prone remainder, promote one artifact.
- **Terraform outputs → Ansible dynamic inventory.** Provisioning feeds configuration; no
  hand-maintained host lists.
- **Python orchestrates; Bash glues; PowerShell owns Windows.** A Python wrapper sequences
  multi-step workflows and gathers/normalizes data; Bash is the thin CI step that calls
  real tools; PowerShell handles the Windows/AD leg.
- **Policy-as-code everywhere** — Checkov/Conftest/Sentinel for Terraform; ansible-lint +
  `iac-sast` for Ansible.

---

## 8. Automation scripting standards

Reach for a script for **glue, orchestration, and data gathering** — never to reimplement
a provisioner or config manager.

### Choosing the language

| Use | Language |
|---|---|
| Linux/POSIX glue, CI steps, simple `cmd \| cmd` flows | **Bash** |
| Windows / AD / Exchange / Azure-Az / structured objects | **PowerShell** (7+ cross-platform) |
| Real logic, API orchestration, parsing, retries, testable code | **Python** |

**Graduation rule:** Bash that grows arrays-of-records, branching/error handling, JSON
beyond a `jq` one-liner, or **>~50–100 lines** → rewrite in **Python**. Windows-centric or
object-heavy → **PowerShell**.

### Per-language essentials

- **Bash** — `set -euo pipefail`; quote all expansions (`"$var"`); `shellcheck` clean;
  `trap` for cleanup; `mktemp` for temp files; functions over copy-paste; test with `bats`.
- **PowerShell** — `Set-StrictMode -Version Latest`; `$ErrorActionPreference='Stop'`;
  advanced functions with `[CmdletBinding()]` + typed params; emit **objects**, not text;
  `PSScriptAnalyzer` clean; test with `Pester`.
- **Python** — 3.x, virtualenv + pinned `requirements.txt`/lock; type hints; `argparse`;
  `logging` not `print`; explicit exceptions + retries (`tenacity`); `ruff`/`black`/`mypy`;
  test with `pytest`. Use SDKs (`boto3`, cloud clients) over shelling out.

### Universal rules

Idempotent and re-runnable; exit non-zero on failure; **no secrets in code** (env/Vault/secret
store, never hardcoded); structured logging; `--dry-run` for anything mutating; never parse
structured data (JSON/XML) with regex in Bash — use `jq`/a real parser.

---

## 9. Data gathering — optimal tool per source

| Source | Optimal approach |
|---|---|
| Host facts / fleet | Ansible facts (`setup`); **osquery** for large fleets |
| Cloud inventory & APIs | Provider CLI/SDK (`aws`/`az`/`gcloud`, `boto3`); **Python** to aggregate; **Steampipe** for SQL-over-APIs |
| Quick JSON in a pipeline | `jq` + **Bash** (one-offs only) |
| Windows (CIM/WMI, AD) | **PowerShell** `Get-*` |
| Metrics / time-series | Prometheus + exporters (don't script polling) |
| Config drift | Terraform plan / `ansible --check --diff` / `drift-detection` |

**Rule:** collect structured, transform in code, report once. If you're `grep`/`awk`-ing
JSON, switch to `jq` or Python.

---

## 10. Anti-patterns (don't do these)

- Provisioning complex stateful cloud infra **with Ansible** instead of Terraform/OpenTofu
  (no plan/state → drift, ordering pain).
- Configuring the inside of hosts **in HCL** via `remote-exec` instead of Ansible.
- Mixing Terraform and OpenTofu **on one state file**, or committing state to git.
- A **500-line Bash** script doing JSON/logic that should be Python.
- Parsing JSON/XML with `grep`/`sed`/`awk`.
- Hardcoded secrets in any tool's code, vars, or state; unencrypted remote state.
- Auto-applying Terraform or auto-promoting Ansible to prod — **propose, never dispose.**

---

## References

- Decision framework: [`skills/iac-tooling-selection`](../skills/iac-tooling-selection/SKILL.md)
- Ansible execution standards: [`iac-authoring-standards.md`](iac-authoring-standards.md)
- Binding rules: `rules/terraform/terraform-style.md`, `rules/scripts/scripting-standards.md`,
  `rules/ansible/*`, `rules/gitlab-ci/*`, `rules/secrets/*`
- `CLAUDE.md` — orchestration, trust boundary, propose-never-dispose
