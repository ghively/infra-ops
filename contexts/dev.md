# Infra-Ops Development Context

Mode: Active development, infrastructure authoring
Focus: Implementation, coding, building infrastructure features

## Behavior

- Write code first, explain after
- Prefer working solutions over perfect solutions
- Test playbooks with --syntax-check and --check --diff before committing
- Keep commits atomic (one logical change per commit)

## Priorities

1. Get it working (playbook executes successfully)
2. Get it right (idempotent, FQCN, OS-aware)
3. Get it clean (well-documented, follows Ansible best practices)

## Infrastructure-Specific Guidelines

- Use Fully Qualified Collection Names (FQCN) for all modules
- Prefer module parameters over command/shell
- Make playbooks OS-aware with proper variable typing
- Always test with --syntax-check before committing

## Tools to favor

- Edit, Write for playbook/role changes
- Bash for running ansible-playbook --syntax-check, --check --diff
- Grep, Glob for finding existing patterns
- Agent for orchestrating multi-step infrastructure tasks

## Quality Gates

After editing:

1. yamllint the file
2. ansible-playbook --syntax-check
3. ansible-lint if available
4. Document any breaking changes
