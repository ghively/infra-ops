# MCP Servers & Tools

How infra-ops uses MCP servers and external CLIs, and how to add the optional ones
safely. Every recommendation is scoped to the trust boundary: **propose-never-dispose**,
**no PAN/keys/PINs/HSM**, **CHD-adjacent work stays on the local Ollama lane**,
**corporate/DSS zone only — never the air-gapped HSA**.

> Guiding rule: because a single Linux box is currently both the agent host and the
> GitLab runner (SPEC §1 gap), any token an MCP server holds is co-resident with CI
> execution. Use **read-only, least-privilege, short-lived** tokens, single-project
> scope, and env-var injection only. Revisit once runner topology is split.

## Bundled (shipped in `plugin.json` — safe, no credentials)

| Server | Why | Used by |
|---|---|---|
| **context7** (`@upstash/context7-mcp`) | Current library/framework docs (Ansible modules, GitLab CI keywords, Octopus/Vault APIs) so agents don't rely on stale memory | iac-author, playbook-reviewer, pci-compliance-reviewer, infra-planner, infra-auditor, iac-debugger |
| **sequential-thinking** (`@modelcontextprotocol/server-sequential-thinking`) | Structured multi-step reasoning for dependency-graph/rollback decomposition; no credentials, no egress | infra-planner |

## Optional — document & operator-enable (hold live credentials; NOT bundled)

Add these to **your** user/project MCP config, not to the shipped plugin, supplying
read-only credentials. Snippets:

```jsonc
// GitLab (self-hosted), READ-ONLY — unblocks reviewers/auditor/scribe/planner pulling
// real MR & CI data. PAT scope: read_api only; GITLAB_READ_ONLY_MODE blocks writes.
"gitlab": {
  "command": "npx",
  "args": ["-y", "@zereight/mcp-gitlab"],
  "env": {
    "GITLAB_API_URL": "https://gitlab.internal.example/api/v4",
    "GITLAB_PERSONAL_ACCESS_TOKEN": "${GITLAB_READ_TOKEN}",
    "GITLAB_READ_ONLY_MODE": "true"
  }
}

// Octopus Deploy, READ-ONLY — wires up Octopus discovery (currently a gap). API key
// via env var only (never CLI args). --read-only blocks all writes/promotions.
"octopus": {
  "command": "npx",
  "args": ["-y", "@octopusdeploy/mcp-server", "--read-only"],
  "env": {
    "OCTOPUS_URL": "https://octopus.internal.example",
    "OCTOPUS_API_KEY": "${OCTOPUS_READ_API_KEY}"
  }
}

// git (local repo history) — credential-free; add if you want structured git history
// beyond the agents' native Read/Grep/Glob/Bash.
"git": { "command": "uvx", "args": ["mcp-server-git", "--repository", "."] }
```

### Discouraged (crown-jewels adjacent)

- **HashiCorp Vault MCP** — a misscoped token could read key components / PIN / CHD
  secret *values*, violating hard rule #2. If ever enabled: a **metadata/`list`-only**
  policy on non-CHD mounts, never `read` on secret data, run local-only, with
  `pan-egress-filter` as the fail-closed backstop. Prefer the `secrets-vault` skill +
  Context7 over a live Vault connection.

### Not applicable / skip

- **Ansible AAP MCP** — the estate runs plain Ansible + GitLab CI, not Automation
  Platform; revisit only if/when AAP is adopted (and then read-only). There is no MCP
  server for the Ansible CLI/linters — that layer is CLIs-as-hooks (below).
- **filesystem / generic fetch** — widen the data-exfil surface for no capability the
  agents lack under the hook guardrails. Skip in a PCI estate.

## Trust-boundary constraints (must hold for any server above)

1. **Read-only only.** A write-capable GitLab/Octopus token would break propose-never-
   dispose (merge MRs, trigger deploys, auto-promote). Enforce `GITLAB_READ_ONLY_MODE`
   / Octopus `--read-only`. The official GitLab server is **not** read-only by default
   and is paywalled — constrain its OAuth role explicitly before use.
2. **Never wired into the HSA.** The air-gapped zone has no cloud path; CHD-adjacent
   work goes through `scripts/lib/ollama-router.js` only.
3. **No egress tools for sensitive agents.** `sensitive-local-analyst` gets no MCP tool
   that egresses.

## CLI tools wired as hooks / CI (quality enforcement)

The deterministic enforcement layer (see the `iac-sast-scanning` skill) uses CLIs, not
MCP: yamllint + ansible-syntax (PostToolUse hooks today) → ansible-lint (SARIF) →
gitleaks + TruffleHog → Checkov/KICS → `--check --diff` (ARA-recorded) → Molecule.
Pin every tool by digest so verdicts are reproducible.
