# knowledge/ — infra-ops Knowledge Directory

This directory is the agent's living knowledge base. It grows as documents are
ingested and the environment is discovered. **Sensitive content must never be
committed** — see `.gitignore` and the sensitivity rules below.

---

## Directory layout

```
knowledge/
  README.md           ← this file (committed)
  environment.md      ← living environment map (committed if non-sensitive)
  ingested/           ← sensitivity-classified ingested documents (gitignored)
    INDEX.md          ← index of ingested docs with sensitivity class (committed)
  instincts/          ← versioned YAML instinct ledger (committed; promotion gated)
```

---

## `environment.md` — the living environment map

Written and updated by `/infra-discover`. Contains:

- GitLab project details, branch model, CI/CD stages, runner topology.
- Ansible playbook inventory (names, targets, roles).
- Inventory layout (environments, group structure, connection types).
- Octopus Deploy projects and lifecycle overview.
- Open questions — items that could not be determined from read-only discovery
  and need to be answered by ingesting documentation or human confirmation.

The environment map is the agent's primary ground truth for reasoning about the
estate. Keep it accurate; update it whenever `/infra-discover` runs or a human
corrects a fact.

---

## `ingested/` — sensitivity-classified documents

Documents ingested via `/knowledge-ingest` are stored here after sensitivity
classification. The entire `knowledge/ingested/` directory is gitignored to
prevent accidental commit of sensitive content.

Sensitivity classes (assigned on ingest):

| Class | Definition | Handling |
|-------|-----------|----------|
| `public` | No restricted data | Summarised and stored locally |
| `internal` | Internal-only, no CHD | Stored locally; never sent to cloud LLM |
| `chd-adjacent` | References cardholder data or HSA scope | Local lane (Ollama) only; no cloud path |
| `key-material` | Key components, PINs, HSM config | **REJECTED on ingest** — escalate to human |

`INDEX.md` (committed) tracks slug, class, one-line summary, and ingest date
for each document without containing any sensitive content itself.

---

## `instincts/` — versioned YAML instinct ledger

The instinct ledger records domain knowledge that the agent has derived from
evidence and had promoted to a durable "instinct" — a fact it can reason from
in future sessions without re-deriving.

Instincts are stored as versioned YAML files under `instincts/`. They are
committed and version-controlled.

### Promotion requirements (hard gates)

**An instinct may only be promoted after:**

1. A human explicitly approves the promotion (documented in the MR that adds
   the instinct entry).
2. For any compliance-relevant claim: a specific doc citation is included
   (`source:` field pointing to an ingested document slug and section).
3. The governance ledger entry is appended by the `governance-ledger` hook.

Silent self-modification is prohibited. The agent may propose an instinct
(confidence-scored, evidence-cited) but may never promote it without the
above gates.

### Instinct YAML format

```yaml
# instincts/<slug>.yml
id: <slug>
claim: "<human-readable statement of the instinct>"
confidence: HIGH | MEDIUM | LOW
source: "<ingested doc slug>, §<section>"  # required for compliance items
evidence_summary: "<one-paragraph summary of supporting evidence>"
promoted_at: "<ISO date>"
promoted_by: "<human username or MR reference>"
governance_ledger_ref: "<fingerprint or entry ID from governance ledger>"
```

---

## What must never be committed

Per `.gitignore`:

- `knowledge/ingested/` — all ingested documents (may contain CHD-adjacent content).
- `knowledge/instincts/*.local.*` — local-only instinct drafts pending review.
- `*.vault`, `*.pem`, `*.key` — any cryptographic material.
- `*.local.md` — local working notes.

If you are unsure whether content is safe to commit, **do not commit it** and
ask a human reviewer.
