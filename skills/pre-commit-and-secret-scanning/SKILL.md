---
name: pre-commit-and-secret-scanning
description: >
  The fast, developer-machine tier of quality and secret-leak prevention: a
  .pre-commit-config.yaml with yamllint, a fast ansible-lint subset, gitleaks and
  TruffleHog, plus end-of-file/whitespace fixers. Advisory (CI is authoritative) and
  budgeted under ~10s. Triggers on: pre-commit, pre-commit hook, git hook, local lint,
  fast feedback, secret scan local, developer machine.
origin: infra-ops
---

# Pre-Commit & Secret Scanning Skill

## When to Use

Use when setting up or reviewing the **pre-commit** tier — the checks that run on the
developer's machine before code is committed, catching the obvious before it ever
reaches CI. This complements (does not replace) the runtime `pan-egress-filter` hook
and the binding `iac-sast-scanning` CI gate.

## How It Works

- **Pre-commit is advisory; CI is authoritative.** Keep the pre-commit set a **subset**
  of the CI gates (`pre-commit ⊆ CI`) so it never disagrees with the gate that actually
  blocks merges. A developer can bypass a local hook; CI cannot be bypassed.
- **Budget ~10 seconds.** Run only fast checks locally: YAML lint, a fast ansible-lint
  profile (not the full production sweep), secret scanning on the staged diff, and
  whitespace/EOF fixers. Heavy checks (Molecule, full SAST) stay in CI.
- **Two-layer secret detection** — gitleaks (regex/entropy, fast) plus TruffleHog
  (verified live secrets) on the staged changes. Findings are **redacted**; the value
  is never printed.

## Examples

```yaml
# .pre-commit-config.yaml — fast, advisory, pre-commit ⊆ CI
repos:
  - repo: https://github.com/pre-commit/pre-commit-hooks
    rev: v4.6.0
    hooks: [{id: end-of-file-fixer}, {id: trailing-whitespace}, {id: check-yaml}]
  - repo: https://github.com/adrienverge/yamllint
    rev: v1.35.1
    hooks: [{id: yamllint}]
  - repo: https://github.com/ansible/ansible-lint
    rev: v24.9.2
    hooks: [{id: ansible-lint, args: ["--profile", "basic"]}]   # fast subset; CI runs production
  - repo: https://github.com/gitleaks/gitleaks
    rev: v8.18.4
    hooks: [{id: gitleaks}]
```

```bash
pre-commit install        # activate the git hook
pre-commit run --all-files
```

## Trust boundary

- Local, read-only over the working tree; no network egress beyond pinned hook installs.
- Never prints a matched secret/PAN value — redact and cite location; a confirmed hit →
  the `incident-response` skill.
- Advisory only — a green pre-commit does not imply a green CI gate.
