---
description: "Run a read-only discovery pass of the GitLab project, playbooks, runner, inventory and Octopus; write a published environment map to knowledge/environment.md."
---

# /infra-discover

Delegate to the **infra-auditor** agent to perform a read-only survey of the
current estate and write the results to `knowledge/environment.md`.

## What this command does

1. Delegate to `infra-auditor` with the instructions below.
2. Collect all findings into a structured environment map.
3. Write (or overwrite) `knowledge/environment.md` with the map.
4. Surface a list of open questions that could not be answered from available
   read-only data — do not guess or fabricate answers.

## infra-auditor instructions

Perform a **read-only** discovery pass. Do not modify any file outside
`knowledge/`. Do not run `ansible-playbook` (not even `--check`) during
discovery.

Gather:

- **GitLab project(s):** repo URL, branch model, protected branches, CI/CD
  stages, runner tags, pipeline schedule.
- **Playbooks:** names, targets (`hosts:`), roles used, any `vars_files` or
  `include_vars`, rough change frequency from git log.
- **Inventory:** layout (file vs. directory), environments present, group
  structure, connection types (SSH/WinRM).
- **Runner:** OS, co-location with other services, executor type, privileged
  mode enabled/disabled.
- **Octopus Deploy (if reachable):** project names, environments, lifecycles,
  any Tentacle targets visible.
- **Known gaps:** anything that could not be determined from available data.

## Output format (`knowledge/environment.md`)

```
# Environment Map
_Last updated: <ISO date> by /infra-discover_

## GitLab
...

## Ansible Playbooks
...

## Inventory
...

## Runner
...

## Octopus Deploy
...

## Open Questions
- [ ] ...
```

## Trust boundary

- Read-only throughout. No writes to any system; no API calls that mutate state.
- Do not request or record PAN, cryptographic keys, PINs, or HSM configuration.
- If a discovery step would require credentials not already available in the
  session context, note it as an open question instead of prompting for the
  secret.

## Arguments

$ARGUMENTS: optional `--env <name>` to scope discovery to a single environment.
