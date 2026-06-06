# __ROLE_NAME__

Canonical Ansible role scaffold. Every role in the estate has this exact layout so
structure and deployment are uniform; `scripts/validate-structure.js --type ansible-role`
enforces it.

## Layout

- `tasks/main.yml` — entry point (FQCN, idempotent)
- `defaults/main.yml` — public, role-prefixed defaults
- `vars/main.yml` — private `__`-prefixed vars
- `handlers/main.yml` — notified handlers
- `meta/main.yml` — `galaxy_info` metadata
- `templates/`, `files/` — Jinja2 templates and static files
- `molecule/default/` — the idempotence scenario (converge twice, verify)

## Usage

1. Replace `__ROLE_NAME__` / `__role_name__` placeholders with the real role name.
2. Add tasks; keep them idempotent and OS-targeted by structure.
3. `molecule test` must pass (syntax → converge → idempotence → verify).
