---
description: "Run Ansible drift detection (--check --diff) against an environment and report drift."
---

# /drift-check

Delegate to the **infra-auditor** agent to run a dry-run drift detection pass
against a target environment using `ansible-playbook --check --diff`. Report
any drift; never auto-remediate.

## Usage

```
/drift-check [--env <environment>] [--playbook <path>]
```

$ARGUMENTS:

- `--env <environment>` — target environment directory under `inventories/`
  (e.g. `dev`, `staging`, `prod`). Defaults to `dev` if omitted.
- `--playbook <path>` — playbook to check (e.g. `playbooks/updates.yml`).
  Defaults to `playbooks/site.yml` if omitted.

## Drift detection pipeline

### Step 1 — Validate scope

- Confirm the target environment directory exists under `inventories/`.
- Confirm the playbook file exists.
- If either is missing, stop and report clearly — do not guess a path.

### Step 2 — Run `--check --diff`

```bash
ansible-playbook --check --diff \
  -i inventories/<env>/ \
  <playbook>
```

This is **read-only** — no changes are made to any target host. The
`--check` flag ensures the run is a dry-run; `--diff` shows the exact textual
delta that would be applied.

### Step 3 — Evaluate the output

- **Zero changed tasks, zero diff output:** the environment is converged.
  Report "No drift detected."
- **Non-empty diff or changed tasks:** drift detected. This is an alert
  condition. Report every changed task with its host, module, and the
  textual diff. Do not dismiss or minimise any delta.

### Step 4 — Produce the drift report

```
## Drift Report — <env> / <playbook>
Date: <ISO date>

### Status: DRIFT DETECTED | NO DRIFT

### Changed tasks
| Host | Task | Module | Delta summary |
|------|------|--------|---------------|
| ...  | ...  | ...    | ...           |

### Full diff
<verbatim --diff output>

### Recommended action
- [ ] Review each changed task and delta above.
- [ ] If remediation is required, open a playbook-review MR.
- [ ] Human approval required before any apply run.
```

## Trust boundary

- `--check --diff` only — no `ansible-playbook` apply, no `--force`, no
  `--extra-vars` that override safety settings.
- Never auto-remediate drift. Drift alerts are for human review; the response
  is a new MR, not an autonomous apply.
- Do not run against `prod` without explicit human instruction and confirmation
  that the runner has appropriate credentials scoped for that environment.
- PAN, keys, PINs, and HSM config are out of scope — if drift output contains
  any of these, redact before reporting and flag as CRITICAL.
