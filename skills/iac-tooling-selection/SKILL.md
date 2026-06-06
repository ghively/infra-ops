---
name: iac-tooling-selection
description: >
  Decision framework for choosing and combining infrastructure-as-code and
  automation tooling — Terraform vs OpenTofu vs Ansible (provision vs configure),
  and Bash vs PowerShell vs Python for automation/data-gathering. Picks the right
  tool for the purpose and defines when to combine them, per industry standards.
  Triggers on: terraform, opentofu, tofu, ansible, pulumi, cloudformation, packer,
  provision, configuration management, bash, powershell, python, automation script,
  data gathering, tool selection, which tool, immutable, state backend, gitops.
origin: infra-ops
---

# IaC & Automation Tooling Selection Skill

## When to Use

Load this when planning or authoring any infrastructure or automation change and the
**tool is not already dictated** by the existing estate — i.e. whenever you're deciding
*how* to build something, not just writing it. The `infra-planner` uses it to pick the
right technology per unit; `iac-author` uses it to structure the code it writes. For the
deep reference (repo layout per tool, CI/CD per tool, deployment strategies, scripting
standards) see [`docs/iac-tooling-and-automation-guide.md`](../../docs/iac-tooling-and-automation-guide.md).

> **Estate grounding.** This shop's current estate is **Ansible + self-hosted GitLab
> CI/CD + Octopus Deploy** (SPEC.md). Introducing Terraform/OpenTofu (a new state
> backend, plan/apply gating, drift) is itself a *planning decision* with its own
> migration and PCI-scope review — propose it, never silently adopt it. Confirm
> version-specific behavior (provider/module/CLI syntax) via Context7 before authoring.

## How It Works

### First cut: what *kind* of work is this?

| Work | Right category | Primary tool(s) |
|---|---|---|
| Create/destroy cloud or platform **resources** (VPCs, VMs, DBs, DNS, IAM, k8s clusters) | **Provisioning** (declarative, stateful) | **Terraform / OpenTofu** (Pulumi if you need a real language; CloudFormation only if AWS-locked) |
| Configure the **inside** of a host (packages, services, files, users, app deploy) | **Configuration management** | **Ansible** (agentless; the estate standard) |
| Build a **golden image** to deploy immutably | Image build | **Packer** (+ Ansible as the provisioner) |
| Glue, one-off task, thin CI step, orchestration of the above | **Imperative script** | **Bash** (Linux) / **PowerShell** (Windows) / **Python** (anything with logic) |

The classic, industry-standard split is **provision with Terraform/OpenTofu, configure
with Ansible.** Don't force one tool to do the other's job (see anti-patterns).

### Terraform vs OpenTofu

Both speak HCL with an identical core workflow (`init → plan → apply`); OpenTofu is a
drop-in fork. Choose on **licensing, governance, and platform features**, not syntax:

- **OpenTofu** — Linux Foundation, **Apache-2.0** (truly open). Pick it to avoid
  HashiCorp's **BSL 1.1** license (Terraform since Aug 2023), for community governance,
  and for built-in **client-side state encryption** (native since OpenTofu 1.7). Good
  default for a fresh, vendor-neutral estate.
- **Terraform** — pick it if you depend on **HCP Terraform / Terraform Cloud**, Sentinel
  policy, official vendor support, or an enterprise contract. IBM/HashiCorp ecosystem.
- Either way: **never mix engines on one state file**; standardize per estate. Migration
  between them is low-friction but is a deliberate, reviewed change.

### Provisioning vs configuration — why not just Ansible (or just Terraform)?

- **Terraform/OpenTofu** track desired state in a **state file**, compute a plan/diff,
  and excel at **dependency graphs, drift detection, and immutable lifecycle**. Weak at
  in-host procedural config.
- **Ansible** is **agentless, procedural-leaning, idempotent**, great at OS/app config,
  orchestration, and ad-hoc tasks. It *can* provision (cloud modules) but lacks a true
  plan/state model — use it to provision only for small/simple cases.
- **Combine** when both are needed: Terraform/OpenTofu stands up the infrastructure and
  outputs inventory → Ansible configures it. Or **Packer + Terraform** for immutable VMs
  (bake the image, deploy by replacement) and skip in-place config entirely.

### Scripting: Bash vs PowerShell vs Python

Reach for a script for glue and orchestration — **not** to reimplement a provisioner or
config manager. Pick the language by environment and complexity:

| Use | Language | Why |
|---|---|---|
| Linux/POSIX glue, CI steps, simple pipelines of CLI tools | **Bash** | Ubiquitous, zero deps, fast for `cmd \| cmd` flows. Keep it small. |
| Windows / Active Directory / Exchange / Azure-Az / structured objects | **PowerShell** (7+ for cross-platform) | Object pipeline (not text), native Windows + cloud modules, structured I/O |
| Real logic, API orchestration, data parsing/normalization, retries, anything testable | **Python** | Libraries (`requests`, `boto3`, cloud SDKs), error handling, `pytest`, cross-platform |

**The graduation rule (industry standard):** a Bash script that grows arrays-of-records,
real branching/error handling, JSON beyond a `jq` one-liner, or roughly **>50–100 lines**
should become **Python**. If it's Windows-centric or needs structured objects, it should
be **PowerShell**. Don't let Bash sprawl into an unmaintainable mini-program.

### Data gathering — optimal tool per source

| Source | Optimal tool |
|---|---|
| Host facts / fleet inventory | Ansible facts (`setup` / `ansible -m setup`); osquery for large fleets |
| Cloud inventory & APIs | Provider CLI/SDK (`aws`/`az`/`gcloud`, `boto3`); **Python** to aggregate/normalize; Steampipe for SQL-over-APIs |
| Quick JSON slice in a pipeline | `jq` + **Bash** (one-offs only) |
| Windows systems (CIM/WMI, AD) | **PowerShell** `Get-*` |
| Metrics / time-series | Prometheus + exporters (don't script polling loops) |

Rule: **collect structured, transform in code, never parse structured data with regex in
Bash.** If you're `grep`/`awk`-ing JSON, switch to `jq` or Python.

### When to combine (industry-standard pipelines)

- **Packer (bake) → Terraform/OpenTofu (provision) → Ansible (configure drift-prone bits)
  → Octopus/GitLab (promote).** Immutable where possible; configure only what must vary.
- **Terraform outputs → Ansible dynamic inventory** so configuration follows provisioning.
- **Python orchestrates** multi-step workflows and data gathering; **Bash** is the thin CI
  glue that calls the real tools; **PowerShell** owns the Windows leg.
- **Policy-as-code** across all of it: Checkov/Conftest(OPA)/Sentinel for Terraform,
  ansible-lint + the `iac-sast-scanning` gate for Ansible.

## Examples

```
# "Stand up a new VPC + RDS, then install our app on the EC2 hosts."
Provision (VPC/RDS/EC2) → Terraform or OpenTofu (declarative, stateful, drift-checked).
Configure (app on EC2)  → Ansible, using Terraform outputs as dynamic inventory.
Glue/orchestration      → a small Python wrapper if multi-step; Bash if it's one CI step.
Rationale: right tool per layer; don't provision RDS with Ansible or configure the app in HCL.

# "Pick Terraform or OpenTofu for a greenfield, vendor-neutral estate."
OpenTofu: Apache-2.0 (no BSL restrictions), native state encryption, community governance.
Switch to Terraform only if HCP Terraform / Sentinel / enterprise support is required.

# "Write a script to collect patch levels across 400 Linux + 80 Windows hosts."
Linux: Ansible facts (or osquery) — not a Bash SSH loop.
Windows: PowerShell Get-Hotfix via WinRM.
Aggregate/report: Python (normalize both into one structured report). Bash only to invoke.
```

## Trust boundary

- **Propose, never dispose** — selecting/adopting a new tool (state backend, CI gating)
  is a planning proposal for human approval, not a silent change. Corporate/DSS zone only.
- **State & secrets are sensitive** — Terraform/OpenTofu **state can contain secrets**;
  treat it like CHD-adjacent: encrypted remote backend, locked, access-controlled, never
  committed. No PAN/keys/PINs/HSM in any tool's code or state. CHD-adjacent work → local lane.
