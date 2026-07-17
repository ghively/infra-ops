---
description: "Review a playbook or MR diff through the canonical three-reviewer merge gate (playbook-reviewer + pci-compliance-reviewer + secrets-scanner)."
---

# /playbook-review

Run the **canonical review gate** on an Ansible playbook file or GitLab MR diff:
the same deterministic three-reviewer flow the orchestrator uses (CLAUDE.md "The
review gate"). This command does not define its own weaker review — it invokes the
one gate, so "reviewed via `/playbook-review`" means exactly what "reviewed" means
everywhere else. Never auto-merges or applies changes.

## Usage

```
/playbook-review <path-or-MR-reference>
```

$ARGUMENTS: a file path (e.g. `playbooks/updates.yml`) **or** a GitLab MR
reference (e.g. `!42`). If omitted, reviews the current working diff
(`git diff HEAD`).

## Review pipeline

### Step 1 — Gather the diff

- **File path** → read the file and produce a unified diff against `HEAD` (or show
  the full file if new).
- **MR reference** → fetch the MR diff via the GitLab API (read-only).
- **No argument** → use `git diff HEAD`.

### Step 2 — Fan out to all THREE reviewers in parallel

Delegate the diff simultaneously (single message, three Task calls) to:

1. **playbook-reviewer** — correctness + idempotency (FQCN, no `command`/`shell`
   where a module exists, `changed_when`/`creates`/`state:`, role-prefixed vars,
   OS targeting by group, inventory layout, severity tiers).
2. **pci-compliance-reviewer** — PCI control checks (no hardcoded secrets,
   `no_log: true` on secret-handling tasks, WinRM over HTTPS/5986, least-privilege
   `become:`, no PAN/keys/PIN, separation of duty).
3. **secrets-scanner** — deterministic static secret/PAN scan of the diff.

Each reviewer's **first output line MUST be** `VERDICT: PASS|WARN|BLOCK` (a single
token). The reviewers own that contract; this command depends on it.

### Step 3 — Compute the gate decision deterministically

Do **not** judge the outcome by hand. Pass the three verdict tokens to the merge gate:

```
node scripts/merge-gate.js --verdicts <v1>,<v2>,<v3> --cycle <n>
```

- exit **0** → gate cleared (PASS×3, or WARN advisory only)
- exit **1** → BLOCK or incomplete → return consolidated findings to the author for
  one revision pass, then re-review (max 2 cycles)
- exit **3** → revision cap reached → escalate to a human with open findings

A missing or invalid verdict is incomplete → the gate cannot clear (treated as BLOCK).
There is no discretion on a BLOCK.

### Step 4 — Report

Produce a single deduped, severity-sorted report, and state the gate result verbatim:

```
## Playbook Review — <path or MR ref>
Date: <ISO date>

Gate: CLEARED | BLOCKED | ESCALATE   (merge-gate exit 0 | 1 | 3)
Verdicts: playbook-reviewer=<v> · pci-compliance-reviewer=<v> · secrets-scanner=<v>

### CRITICAL
- [<reviewer>] finding … Line N.
### HIGH
…

### Summary
- N critical, N high, N medium, N low, N info findings.
- Gate decision: <as computed by scripts/merge-gate.js — not by hand>.
```

## Trust boundary

- Read-only: fetches diffs and reads files only.
- Never auto-merges the MR, never runs `ansible-playbook`.
- PAN, keys, PINs, and HSM config are out of scope — if spotted in the diff, flag as
  CRITICAL and stop further analysis of that content.
