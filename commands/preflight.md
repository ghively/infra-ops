---
description: "Fail-fast preflight checklist before authoring: node/git/tooling present, right branch, clean tree, no staged secrets, no leftover scaffold placeholders. Exits non-zero on a hard failure."
---

# /preflight

Run the environment + working-state checklist **before** authoring or changing anything,
so broken-state failures surface up front instead of mid-task.

## Usage

```
/preflight [--branch <expected-branch>]
```

Runs `node scripts/preflight.js`. Hard failures (old Node, not a git repo, a **staged
secret**, leftover `__PLACEHOLDER__` in the tree) exit non-zero and should stop the
work. Warnings (missing recommended tool, dirty tree, unexpected branch) are reported but
non-blocking.

## When to use

- At the start of an authoring task, before `/scaffold` or any edit.
- Before opening an MR, alongside `npm run conformance` (structure + deployment) and the
  `merge-gate` once reviews are in.

## Boundary

Read-only; reports state, changes nothing. Corporate/DSS zone.
