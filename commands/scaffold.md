---
description: "Scaffold an IaC unit (ansible-role | ansible-repo | terraform-module | terraform-env) from the canonical template, then enforce the uniform structure with validate-structure."
---

# /scaffold

Create a new infrastructure unit **from the canonical template** so every unit in the
estate has the identical, uniform structure. This is the only sanctioned way to start a
new role/module/repo/env — never hand-build the layout. Delegate the authoring to
**iac-author**.

## Usage

```
/scaffold <type> <name> [--dest <path>]
```

- `<type>` — one of: `ansible-role`, `ansible-repo`, `terraform-module`, `terraform-env`,
  `packer-template`, `python-tool`, `bash-tool`, `powershell-tool`
  (list with `node scripts/validate-structure.js --list`).
- `<name>` — the unit name (replaces `__ROLE_NAME__` / placeholders).
- `--dest <path>` — where to create it (e.g. `roles/<name>`, `modules/<name>`,
  `envs/<env>`).

## What it does (deterministic)

1. **Copy** `templates/<type>/` to the destination — the fixed skeleton, every time.
2. **Substitute** placeholders (`__ROLE_NAME__`, `__role_name__`, env/name) with the
   provided name.
3. **Enforce** the structure:

   ```bash
   node scripts/validate-structure.js --type <type> --path <dest>
   ```

   Exit 0 = conforms. **Non-zero = the unit is rejected** — fix the layout (it is not
   optional). The same check runs in CI via the `structure-conformance` component, so a
   non-conforming unit cannot merge.
4. Hand off to **iac-author** to fill in the unit's logic, keeping the structure intact.

## Boundary

Propose-only, corporate/DSS zone. Scaffolding never deploys; it produces files for an MR.
No secrets/PAN/keys/PINs in any scaffolded file.
