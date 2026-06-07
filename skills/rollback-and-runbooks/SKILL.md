---
name: rollback-and-runbooks
description: >
  The single authority for reverting a change and for operational runbooks. Covers the
  forward-fix vs roll-back decision, GitLab re-deploy-previous-artifact, Octopus
  re-deploy-release and Config-as-Code runbooks, database-migration backward-safety,
  and dual-control break-glass. Triggers on: rollback, roll back, revert deploy,
  runbook, restart, DR, disaster recovery, break-glass, redeploy previous, backout.
origin: infra-ops
---

# Rollback & Runbooks Skill

## When to Use

Use when planning or executing a **revert** of a deployed change, or when authoring an
**operational runbook** (restart, rotate, DR, break-glass). This is the single source
for rollback reasoning so it does not get reinvented inconsistently across plans,
authoring, and promotion. Execution is always **human-gated** (propose-never-dispose);
this skill produces the procedure and the decision, not an autonomous prod action.

## How It Works

### Forward-fix vs. roll-back — decide first

| Choose **roll back** when… | Choose **forward-fix** when… |
|---|---|
| the change is isolated and the previous artifact is known-good | the change includes a non-reversible step (e.g. a destructive DB migration) |
| impact is active and you need the fastest safe restore | rolling back would itself cause data loss or schema mismatch |
| no schema/data migration is entangled | the defect is small and a corrected roll-forward is safer than reverting |

**Database migrations are the trap:** a backward migration is not always safe. If a
migration dropped/transformed data, rolling back the artifact without a tested down-
migration corrupts state. Default to forward-fix for entangled migrations; only roll a
migration back with a verified, tested down-path.

### Rollback mechanics (build-once, promote-one-artifact)

- **GitLab:** redeploy the **previous immutable artifact** (same checksum/attestation),
  not a rebuild. Use the environment's last-good deployment or a manual job that
  re-runs the prior artifact. Never `git revert` + rebuild for a hot restore.
- **Octopus:** re-deploy the previous **release** to the environment (Octopus keeps the
  exact prior package), gated by the lifecycle's manual-intervention step. Operational
  actions (restart/rotate/DR) belong in **Octopus runbooks**, not the deploy process.
- **Ansible:** prefer a tagged revert play validated with `--check --diff` before any
  apply; the apply is human-run, never by the agent.

### Runbooks (first-class, audited)

Author operational runbooks as version-controlled, RBAC-gated, audited procedures
(Octopus Config-as-Code runbooks where available). Each runbook states: trigger,
preconditions, exact steps, verification, rollback-of-the-runbook, and who may run it.

### Break-glass (emergency)

A break-glass procedure is **dual-control, time-boxed, and fully logged**: two distinct
authorized humans, an expiry, every action to the governance ledger/SIEM, and a
mandatory post-incident review. The agent may draft and document it; it never executes
it.

## Examples

### Rollback decision record (attach to the MR / change record)

```
Decision: ROLL BACK | FORWARD FIX
Reason: <isolated change, prior artifact known-good>  /  <migration not safely reversible>
Mechanism: GitLab redeploy artifact <sha> | Octopus re-deploy release <n> | tagged revert play
Verification: <command/observation that confirms restore>
Approval: <human gate — who approves the apply>
```

### Octopus re-deploy of the previous release (human-gated)

```
1. Octopus → Project → Releases → select last known-good release
2. Deploy to <env> → triggers the lifecycle manual-intervention gate
3. A human approves the intervention; the prior package is redeployed unchanged
4. Verify health checks + a post-deploy --check --diff shows no drift
```

## Trust boundary

- The agent **proposes** rollbacks/runbooks; humans/pipelines **execute** them.
- No autonomous prod apply, no auto-promote, no break-glass execution by the agent.
- Rollbacks touching the HSA are out of scope here — route to the in-zone lane.

## Deep Reference

### Rollback Decision Matrix
| Scenario | Preferred action | Rationale |
|----------|-----------------|-----------|
| Single task failed, state is known | Fix-forward: patch the task, re-run | Faster than full rollback |
| Multiple tasks failed, state is uncertain | Full rollback | Predictable outcome |
| Schema/data migration changed | Forward-only with compensating migration | Rollback may corrupt data |
| Dependency version changed | Rollback to previous artifact | Pin and redeploy known-good |
| Security vulnerability in released version | Forward-only emergency patch | Documented emergency change process |

### Standard Rollback Playbook Pattern
```yaml
# rollback.yml — always ship alongside site.yml
- hosts: "{{ target_hosts | default('all') }}"
  vars:
    rollback_version: "{{ previous_version }}"
  tasks:
    - name: Stop service
      ansible.builtin.systemd:
        name: "{{ service_name }}"
        state: stopped

    - name: Restore previous package
      ansible.builtin.copy:
        src: "{{ artifact_store }}/{{ service_name }}-{{ rollback_version }}.pkg"
        dest: /opt/{{ service_name }}/current.pkg
        mode: '0644'
      tags: [rollback]

    - name: Start service
      ansible.builtin.systemd:
        name: "{{ service_name }}"
        state: started

    - name: Verify rollback succeeded
      ansible.builtin.uri:
        url: "http://localhost:{{ service_port }}/healthz"
        status_code: 200
      retries: 5
      delay: 3
```

### Break-Glass Procedure
Document in `knowledge/runbooks/break-glass.md`:
1. Who can authorize break-glass (named roles, not individuals)
2. What actions are permitted without the standard change process
3. Maximum window duration
4. Mandatory post-action change record within 24h
5. Governance ledger entry required
