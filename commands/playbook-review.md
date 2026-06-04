---
description: "Review a playbook or MR diff with playbook-reviewer + pci-compliance-reviewer."
---

# /playbook-review

Run a two-agent review of an Ansible playbook file or GitLab MR diff, then
merge the findings into a single prioritised report. Never auto-merge or apply
changes.

## Usage

```
/playbook-review <path-or-MR-reference>
```

$ARGUMENTS: a file path (e.g. `playbooks/updates.yml`) **or** a GitLab MR
reference (e.g. `!42`). If omitted, reviews the current working diff
(`git diff HEAD`).

## Review pipeline

### Step 1 — Gather the diff

- If a **file path** is given: read the file and produce a unified diff against
  `HEAD` (or show the full file if new).
- If an **MR reference** is given: fetch the MR diff via the GitLab API
  (read-only).
- If no argument: use `git diff HEAD`.

### Step 2 — Delegate to `playbook-reviewer`

The playbook-reviewer checks:

- FQCN on every module call.
- No `command`/`shell` where a module exists.
- Idempotency markers (`changed_when`, `creates`, `state:`).
- Role-prefixed variables; no play-level `vars:` or `include_vars`.
- OS targeting by group structure, not by `when:` guard alone.
- Inventory layout compliance (directory per env, `vault.yml` separation).
- Severity tier: **CRITICAL / HIGH / MEDIUM / LOW / INFO**.

### Step 3 — Delegate to `pci-compliance-reviewer`

The pci-compliance-reviewer checks:

- No hardcoded secrets or plaintext credentials.
- `no_log: true` on any task that handles secret values.
- WinRM transport is HTTPS (port 5986), not HTTP (port 5985).
- Least-privilege `become:` scoping.
- No PAN, key material, or PIN data referenced anywhere in the diff.
- Separation of duty (no task both creates and approves its own change).

### Step 4 — Merge findings

Produce a single report with all findings, deduped and sorted by severity:

```
## Playbook Review — <path or MR ref>
Date: <ISO date>

### CRITICAL
- [playbook-reviewer] Task "..." uses shell instead of module. Line N.

### HIGH
...

### Summary
- N critical, N high, N medium, N low, N info findings.
- Recommendation: BLOCK / APPROVE WITH CONDITIONS / APPROVE
```

## Trust boundary

- Read-only: fetches diffs and reads files only.
- Never auto-merges the MR, never applies `ansible-playbook`.
- PAN, keys, PINs, and HSM config are out of scope — if spotted in the diff,
  flag as CRITICAL and stop further analysis of that content.
