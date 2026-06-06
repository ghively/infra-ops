# Contributing to infra-ops

Thank you for your interest in contributing! This document outlines how to contribute effectively.

## Getting Started

1. Fork and clone the repository
2. Install dependencies: `npm install`
3. Run tests: `npm test && npm run validate`

## What to Work On

Check [`TODO.md`](TODO.md) for the ordered build backlog. Items are prioritized and include enough instruction for execution when context is available.

## Development Workflow

### Before Making Changes

1. Read [`SPEC.md`](SPEC.md) for component status and conventions
2. Read [`docs/infra-agent/DESIGN.md`](docs/infra-agent/DESIGN.md) for full rationale
3. Understand the hard trust boundary ([`SPEC.md §2`](SPEC.md#2-the-hard-trust-boundary-never-violate))

### Making Changes

1. Create a branch: `git checkout -b feature/description`
2. Follow the conventions in [`SPEC.md §4`](SPEC.md#4-how-to-extend-conventions-follow-these)
3. Run tests frequently: `npm test && npm run validate`
4. Update component status in [`SPEC.md §3`](SPEC.md#3-component-inventory-status)
5. Update [`TODO.md`](TODO.md) if completing an item

### Commit Messages

Use clear, descriptive commit messages:

- `feat(agent): add new specialist for X`
- `fix(hook): resolve Y in pan-egress-filter`
- `docs(spec): update component status`

### Pull Requests

1. Ensure all tests pass
2. Update documentation as needed
3. Reference related issues or TODO items
4. Describe what changed and why

## Component Conventions

### Agents (`agents/*.md`)

```markdown
---
name: agent-name
description: Brief description
tools: ["Read", "Grep", "Glob"]
model: sonnet
color: blue
---

## Prompt Defense Baseline
(paste from rules/common/prompt-defense-baseline.md)

You are the agent-name: [role definition]

## Mission
[What this agent does]

## Workflow
[Step-by-step process]

## Constraints
[Safety rules and limitations]

## Output
[Expected output format]
```

### Skills (`skills/<name>/SKILL.md`)

```markdown
---
name: skill-name
description: Brief description
---

## When to Use
[When this skill applies]

## How It Works
[Step-by-step explanation]

## Examples
[Concrete examples]
```

### Commands (`commands/*.md`)

```markdown
---
description: What this command does
---

[Usage and behavior]
```

## Safety Guidelines

The infra-ops plugin operates in a PCI-regulated environment. All contributions must:

1. **Maintain the hard trust boundary** — Never allow agent prod execution or crown-jewel access
2. **Propose, never dispose** — Changes are human-gated
3. **Cite sources** — Compliance claims reference documentation
4. **Protect sensitive data** — PAN/secrets blocked at tool boundary

See [`SPEC.md §2`](SPEC.md#2-the-hard-trust-boundary-never-violate) for details.

## Questions?

Open an issue for questions or discussion before making significant changes.
