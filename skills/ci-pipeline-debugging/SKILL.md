---
name: ci-pipeline-debugging
description: >
  Diagnose a failing GitLab CI/CD pipeline or Ansible job without leaking masked
  variables: read job logs/traces safely, reproduce the execution environment locally,
  and recognize common Molecule/ansible-lint/idempotence/runner-tag failure signatures.
  Triggers on: pipeline failed, red pipeline, job failed, CI failure, debug pipeline,
  molecule failure, runner tag, ansible error, check-mode failure.
origin: infra-ops
---

# CI Pipeline Debugging Skill

## When to Use

Use when a GitLab CI job or an Ansible run has failed and you need to find the root
cause. This is the playbook the `iac-debugger` agent leans on. It is **read-only and
reproduction-only** — diagnose and propose, never apply or rerun against prod.

## How It Works

1. **Read the failure safely** — pull the job log/trace read-only (`glab ci trace`/
   `get`, or a read-only GitLab MCP if configured). **Never echo masked CI variables**;
   do not enable `CI_DEBUG_TRACE` on protected jobs (it can expose secrets). Find the
   **first** error, not the downstream cascade.
2. **Classify the failure** (see signatures) — code defect, drift, environment/runner,
   secret-connectivity, or trust-boundary.
3. **Reproduce minimally** — re-run the narrowest read-only command in the same
   execution environment (EE) image: `ansible-lint`, `--syntax-check`,
   `--check --diff --tags <x>`. Pin the EE by digest so the repro matches CI.
4. **Confirm semantics with Context7** before blaming syntax (modules/keywords are
   version-specific).
5. **Propose the minimal fix + verification command** — hand authoring to `iac-author`.

## Common failure signatures → cause

| Signature in the log | Likely cause | First check |
|---|---|---|
| `changed=N` on a re-run / Molecule `idempotence` step fails | non-idempotent task (missing `creates:`/`changed_when:`) | the task reported `changed` on 2nd converge |
| `couldn't resolve module/action` / FQCN error | collection not installed in the EE, or short module name | `requirements.yml` / EE contents |
| `This job is stuck` / no runner | runner **tag** mismatch or no runner for the tag | job `tags:` vs registered runner tags |
| `ansible-lint` non-zero, `production` profile | rule violation (FQCN, risky `command`/`shell`, `no_log`) | the named rule id |
| Vault `permission denied` / 403 on lookup | JWT/OIDC `aud` mismatch or missing role binding | `bound_audiences` vs CI `id_tokens` aud |
| `Permission denied (publickey)` to a host | SSH key/known_hosts in the job, not a playbook bug | `before_script` key setup |
| WinRM/psrp timeout on Windows hosts | transport/credential/firewall, not the role logic | connectivity, not the task |

## Examples

### Reproduce a Molecule idempotence failure locally

```bash
# Same EE image (digest-pinned), narrowest scope:
molecule converge -s default
molecule idempotence -s default   # second converge must report no changes
# A task that shows changed here is the non-idempotent culprit — cite it.
```

### Read a failing job without leaking secrets

```bash
glab ci trace <job-id>            # read-only; do NOT set CI_DEBUG_TRACE on protected jobs
# Identify the FIRST failing line; ignore the downstream cascade.
```

## Trust boundary

- Read-only / reproduction-only; never apply, never run without `--check`, never prod.
- Never print masked variables or secret values from logs; redact and cite location.
- A PAN/key/secret surfaced in a log → route to `incident-response` + flag; stop.
- HSA failures → in-zone local lane.

## Deep Reference

### Failure Signature Table
| Error | Likely cause | First check |
|-------|-------------|-------------|
| `ERROR! the role 'X' was not found` | Missing collection or wrong path | `ansible-galaxy collection list` |
| `fatal: [host]: FAILED! => changed: false` with no message | Handler not notified | Check `notify:` chain |
| `UNREACHABLE! => SSH Error: Permission denied` | Wrong SSH key or user | Check `ansible_user` and key in group_vars |
| `WinRM connection failed` | WinRM not enabled or firewall | `Test-WSMan` from target, check port 5985/5986 |
| `No module named 'X'` in CI | Missing Python dependency | Add to `requirements.txt` or CI image |
| `yaml.scanner.ScannerError` | Indentation or tab in YAML | `yamllint -d default <file>` |
| Pipeline timeout | Job exceeded `timeout:` value | Increase timeout or split job |

### Reading a Failed ansible-lint Report
Focus on `[rule-name]` tags. Suppressable: `[yaml[line-length]]`. Never suppress: `[fqcn]`, `[no-changed-when]`, `[risky-file-permissions]`.

### Safe Job Log Access
```bash
# Via GitLab API (read-only)
curl --header "PRIVATE-TOKEN: $GITLAB_TOKEN" \
  "https://gitlab.example.com/api/v4/projects/<id>/jobs/<job_id>/trace"
```
Never extract secrets from job logs. If a job log contains a masked variable value, report it to the security team immediately.
