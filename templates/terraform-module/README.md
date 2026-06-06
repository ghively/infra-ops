# Terraform / OpenTofu module

Canonical reusable-module scaffold. Every module has this exact layout;
`scripts/validate-structure.js --type terraform-module` enforces it.

## Files

- `versions.tf` — pinned `required_version` + `required_providers`
- `variables.tf` — typed, described, validated inputs
- `main.tf` — module logic (no backend/provider config here)
- `outputs.tf` — values for callers

## Usage

Reference from a root/env module; never configure a backend or provider inside a
reusable module. Pass secrets as `sensitive = true` variables — never hardcode them.
