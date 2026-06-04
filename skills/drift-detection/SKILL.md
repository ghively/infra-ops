---
name: drift-detection
description: >
  Ansible configuration drift detection: scheduled --check --diff as the drift
  detector, ARA callback records tagged with commit SHA and pipeline ID, non-empty
  diff triggers alert and artifact. Triggers on: drift, check diff, ara, scheduled,
  configuration drift, reconcile, baseline, compliance scan.
origin: infra-ops
---

# Drift Detection Skill

## When to Use

Load this skill when setting up scheduled drift-detection pipelines, interpreting
ARA run records, or building the alert path for detected drift. Also load when
designing the "verify" stage of any deploy pipeline or writing the post-deploy
`--check` re-run.

## How It Works

### The Drift Detector: Scheduled `--check --diff`

The canonical drift-detection pattern for Ansible: run `ansible-playbook --check --diff`
against production on a cron/CI schedule and capture the output.

```
0 */6 * * *  ansible-playbook site.yml --check --diff > /var/log/ansible-drift.log
```

Any non-empty change set in the diff means **the live state has diverged from Git**.
Empty diff = no drift; non-empty diff = alert + escalate. (ansible-iac-gitops.md §4)

In GitLab CI, schedule via a **scheduled pipeline** (Settings > CI/CD > Schedules):

```yaml
# .gitlab-ci.yml (drift-detection job, runs only on schedule)
drift-check:
  stage: verify
  tags: [linux, deploy, ansible]    # needs prod reach
  environment:
    name: production
  rules:
    - if: $CI_PIPELINE_SOURCE == "schedule"
  script:
    - ansible-playbook --check --diff -i inventories/prod site.yml
      | tee drift-report-${CI_COMMIT_SHA}-${CI_PIPELINE_ID}.txt
  artifacts:
    paths: [drift-report-*.txt]
    expire_in: 90 days
    when: always
  allow_failure: false              # non-empty diff fails the job → alert
```

Source: ansible-iac-gitops.md §4; gitlab-octopus-cicd.md §1.1 (verify stage).

### ARA — ARA Records Ansible

ARA is a **callback plugin** that records every play/task/result/host/fact/timing to
SQLite/Postgres and exposes a REST API + web UI. Enable in `ansible.cfg`:

```ini
[defaults]
callbacks_enabled = ara
```

Every ARA run should be **tagged with the commit SHA + pipeline ID** to join the
"what/when" (ARA) to the "who/why" (GitLab audit events):

```bash
ARA_DEFAULT_LABELS="commit=${CI_COMMIT_SHA},pipeline=${CI_PIPELINE_ID},env=prod" \
  ansible-playbook --check --diff -i inventories/prod site.yml
```

This creates the auditable chain:
`signed commit → MR approval → pipeline → ARA run (commit SHA + pipeline ID) → host-level record`

Source: ansible-iac-gitops.md §4; DESIGN.md §13.

### Non-Empty Diff = Alert + Artifact

A correct drift-detection pipeline:
1. Runs `--check --diff` against prod.
2. Captures output as a pipeline artifact (retained 90 days minimum for audit).
3. **Fails the job if any task reports `changed`** — GitLab job failure triggers
   notification (email, Slack, webhook, PagerDuty).
4. The ARA run record provides task-level detail: which host, which task, what changed.

Patterns that raise an error on drift (ansiblejunky/ansible-project-configuration-drift)
turn drift from a silent log line into a failing pipeline / alert.

```yaml
# Post-script check: fail if any "changed" tasks in output
- name: Verify no drift (idempotence as compliance check)
  ansible.builtin.assert:
    that: "ansible_changed_tasks | length == 0"
    fail_msg: "Drift detected — {{ ansible_changed_tasks | length }} tasks changed"
```

### Drift Detection in the Verify Stage

A second `--check --diff` **after** a deploy is a cheap post-deploy drift detector:
confirms the deployment actually converged the state and nothing external already
undid it. Non-empty post-deploy diff = immediate alert + potential rollback trigger.
(gitlab-octopus-cicd.md §1.1)

### Compliance Evidence from Drift Runs

Scheduled drift artifacts, ARA records, and GitLab pipeline logs together constitute
continuous compliance evidence:
- **ARA record**: what task, what host, what changed (or didn't), when.
- **Artifact**: the `--diff` output showing the specific file/package/service diff.
- **Pipeline log**: commit SHA, pipeline ID, triggered by whom.
- **GitLab audit events**: scheduled-pipeline creator identity.

Retain artifacts ≥ 90 days (or 12 months for PCI: pci-dss-devops.md §5 Req 10.5.1).
Forward ARA Postgres/API data to the central SIEM alongside GitLab + Octopus audit
streams. (DESIGN.md §13)

### Trust Boundary

- Drift-detection jobs run `--check` only — **no changes applied**.
- The scheduled pipeline uses the **deploy runner** (has prod inventory access) but
  not apply permissions — `--check` flag enforces read-only execution.
- Drift alerts are proposals for human review, not auto-remediation triggers.
- Auto-remediation (re-run without `--check`) requires human approval + normal MR
  gate chain. (SPEC.md §2; DESIGN.md §14.2)

## Examples

```bash
# Manual drift check (from control node) — read-only
ansible-playbook --check --diff -i inventories/prod site.yml

# Parse ARA for changed tasks in last run
ara result list --playbook-id <id> --changed

# GitLab: trigger drift-detection pipeline manually
glab pipeline run --ref main --variables CI_PIPELINE_SOURCE=schedule
```

> TODO: Set alert target (email/Slack/PagerDuty webhook) once notification config is
> available from ingested runbooks.
> TODO: Define drift-remediation SLA (time-to-remediate thresholds) once the change-
> management policy doc is ingested.
> TODO: Add ARA Postgres connection string from environment discovery.
