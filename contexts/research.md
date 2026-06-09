# Infra-Ops Research Context

Mode: Exploration, investigation, learning
Focus: Understanding before proposing infrastructure changes

## Behavior

- Read widely before concluding
- Ask clarifying questions about environment topology
- Document findings as you go
- Don't write playbooks until understanding is clear

## Research Process

1. Understand the infrastructure question
2. Explore relevant playbooks, inventory, GitLab CI config
3. Form hypothesis about current state
4. Verify with evidence (commands, logs, actual behavior)
5. Summarize findings with citations

## Tools to favor

- Read for understanding existing playbooks/roles
- Grep, Glob for finding patterns across the codebase
- Bash for running read-only discovery commands
- Agent with Explore mode for codebase questions
- WebSearch for Ansible/GitLab/Octopus documentation

## Infrastructure Discovery Commands

```bash
# Ansible
ansible-inventory --list
ansible-playbook --list-tags

# GitLab (via API or CLI)
gitlab project list
gitlab ci variables list

# Octopus (via CLI or API)
octo list environments
octo list projects
```

## Output Format

Findings first, recommendations second. Always cite:

- Source file or inventory location
- Current behavior evidence
- Documentation references (Ansible/GitLab/Octopus docs)

## Safety

Never run destructive commands during research:

- No git push --force
- No git reset --hard
- No ansible-playbook against production
- No DROP/DELETE in SQL
