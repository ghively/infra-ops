---
description: "Ingest a document into the local knowledge base: classify sensitivity, index, and propose cited answers to open scoping questions."
---

# /knowledge-ingest

Delegate to the **knowledge-curator** agent to classify and index a document,
then surface cited proposals for any open scoping questions the document can
answer. All answers are proposals for human confirmation — never silent
assertions.

## Usage

```
/knowledge-ingest <path-or-url>
```

$ARGUMENTS: local file path or a readable URL. The document can be a PDF,
Markdown, text file, network diagram description, policy document, runbook,
CMDB export, or prior QSA/CPSA report.

## Ingestion pipeline

### Step 1 — Receive and classify sensitivity

The knowledge-curator inspects the document and assigns one of:

| Class | Definition | Storage lane |
|-------|-----------|--------------|
| `public` | No restricted data | `knowledge/ingested/<slug>.md` (committed) |
| `internal` | Internal-only, no CHD | `knowledge/ingested/<slug>.md` (gitignored) |
| `chd-adjacent` | References cardholder data, PAN context, or HSA scope | Local lane only; never sent to cloud LLM; stored in `knowledge/ingested/` (gitignored) |
| `key-material` | Contains key components, PINs, HSM config | **REJECT** — out of scope; escalate to human immediately |

If a document is `key-material` class, stop ingestion and surface a clear
escalation message. Do not store, summarise, or process further.

### Step 2 — Index and summarise

For `public` and `internal` documents, produce a concise summary (≤200 words)
plus a list of key facts and their source location (document section / page).

For `chd-adjacent` documents, route all processing to the **sensitive-local-analyst**
agent running on the local (Ollama) lane. No content leaves the local process.

### Step 3 — Propose cited answers to open questions

Cross-reference the ingested document against the open questions in
`knowledge/environment.md` (the `## Open Questions` section) and in
`SPEC.md §1` and `DESIGN.md §17`.

For each question the document can answer:

```
**Q:** <question text>
**Proposed answer:** <answer>
**Citation:** <document name>, §<section>, p.<page> (or line N)
**Confidence:** HIGH / MEDIUM / LOW
**Status:** PROPOSED — awaiting human confirmation
```

Answers with `MEDIUM` or `LOW` confidence must include a note on what
additional evidence would raise confidence.

### Step 4 — Update the knowledge index

Append an entry to `knowledge/ingested/INDEX.md`:

```
| <slug> | <sensitivity class> | <one-line summary> | <ISO date> |
```

Do not update the instinct ledger (`knowledge/instincts/`) — instinct promotion
requires human approval and a separate workflow.

## Trust boundary

- CHD-adjacent content never leaves the local lane (no cloud API call).
- `key-material` class documents are rejected immediately.
- All answers are labelled PROPOSED; none are promoted to instincts without
  explicit human approval.
- Do not store or log raw PAN, key components, PINs, or HSM configuration in
  any file, log, or memory.
