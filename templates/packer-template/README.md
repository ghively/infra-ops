# Packer image template

Canonical Packer build scaffold for **immutable** images;
`scripts/validate-structure.js --type packer-template` enforces it.

## Files

- `build.pkr.hcl` — pinned `required_plugins`, `source`, and `build` blocks (Ansible provisioner)
- `variables.pkr.hcl` — typed, described inputs

## Usage

Bake the image here, then deploy it by replacement with `terraform-env`. Configure the
inside of the host with the Ansible provisioner — don't hand-config running instances.
No secrets in the template; pull them from the secrets manager at build time.
