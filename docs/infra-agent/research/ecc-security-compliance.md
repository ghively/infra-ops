# ECC Security & Compliance Scaffolding — Template for a PCI-DSS Capability

Research extract of ECC's security/regulatory mechanisms, mined as the template for a
`pci-compliance` capability in an infra-management agent. Every claim is cited to real
source as `path:line`. PCI mappings reference PCI-DSS v4.0 requirement numbers.

---

## Part A — The Regulated-Data-Skill TEMPLATE (extracted from healthcare-phi / hipaa)

ECC's healthcare skills are the closest existing analog to a PCI compliance skill: they
protect a defined sensitive-data class with a repeatable structure. That structure is the
template to adapt for cardholder data (CHD/SAD).

### A1. Skill frontmatter + tri-layer model

`skills/healthcare-phi-compliance/SKILL.md:1-10` declares a versioned skill with
`name`, `description`, `origin`, `version`. The core mental model is three layers:

> "Healthcare data protection operates on three layers: **classification** (what is
> sensitive), **access control** (who can see it), and **audit** (who did see it)."
> — `skills/healthcare-phi-compliance/SKILL.md:24`

**PCI adaptation:** classification = Cardholder Data (PAN, expiry, cardholder name) and
Sensitive Authentication Data (CVV, full track, PIN); access control = least-privilege +
network segmentation; audit = PCI Req 10 logging.

### A2. Data classification block (the "what is sensitive" registry)

`skills/healthcare-phi-compliance/SKILL.md:26-31` enumerates exactly what counts as PHI
vs PII. A PCI skill replaces this list with the PCI data matrix: PAN, SAD, expiry,
service code. Note the schema-tagging pattern at `:84-93`:

> `COMMENT ON COLUMN patients.aadhaar IS 'PHI: national_id';` — tag sensitive columns at
> the schema level. For PCI: `COMMENT ON COLUMN cards.pan IS 'CHD: primary_account_number';`

### A3. Access control via Row-Level Security + insert-only audit (tamper-proof)

`skills/healthcare-phi-compliance/SKILL.md:34-50` shows the canonical RLS + tamper-proof
audit-log pattern — the audit table is insert-only by policy:

> ```sql
> CREATE POLICY "audit_no_modify" ON audit_log FOR UPDATE USING (false);
> CREATE POLICY "audit_no_delete" ON audit_log FOR DELETE USING (false);
> ```
> — `skills/healthcare-phi-compliance/SKILL.md:48-49`

This directly satisfies **PCI Req 7** (restrict access by need-to-know) and **Req 10.5**
(protect audit trails from modification).

### A4. Audit entry shape (the evidence schema)

`skills/healthcare-phi-compliance/SKILL.md:56-68` defines an `AuditEntry` interface with
`timestamp, user_id, action (create|read|update|delete|print|export), resource_id,
ip_address, session_id`. This is the literal evidence record a PCI Req 10.2 audit trail
needs (who, what, when, where, success/failure).

### A5. Leak-vector checklist + deployment gate (the "controls" enumeration)

`skills/healthcare-phi-compliance/SKILL.md:70-108` lists leak vectors (error messages,
console output, URL params, browser storage, service-role keys, logs) and a
**Deployment Checklist** (`:95-108`) of pass/fail controls. For PCI, the analogous
checklist asserts: no PAN in logs/URLs/storage, PAN masked when displayed (Req 3.4),
strong crypto in transit (Req 4), no SAD stored post-auth (Req 3.2).

### A6. Thin "regulation entrypoint" overlay pattern

`skills/hipaa-compliance/SKILL.md` is deliberately thin and delegates implementation to
`healthcare-phi-compliance`, adding only **decision gates**:

> "Apply HIPAA-specific decision gates: Is this data PHI? Is this actor a covered entity
> or business associate? Does a vendor require a BAA before touching the data? Is access
> limited to the minimum necessary scope? Are read/write/export events auditable?"
> — `skills/hipaa-compliance/SKILL.md:28-34`

**PCI adaptation:** ship a thin `pci-compliance` entrypoint over a `cardholder-data-compliance`
implementation skill, with gates: Is this CHD/SAD? Is this system in the CDE (cardholder
data environment)? Is the third party a PCI-validated service provider (Req 12.8)? Is
access least-privilege (Req 7)? Are all accesses logged (Req 10)?

### A7. Eval harness — severity tiers + hard deployment gate

`skills/healthcare-eval-harness/SKILL.md` is the model for a compliance gate. It runs
categories with **CRITICAL (100% required, blocks deploy)** vs **HIGH (95%, warn)** tiers:

> "The first three ... are CRITICAL gates requiring 100% pass rate — a single failure
> blocks deployment." — `skills/healthcare-eval-harness/SKILL.md:25`

The Pass/Fail matrix (`:91-97`) and CI YAML (`:101-156`) run CRITICAL gates with `--bail`.
**This is the pure-function safety pattern:** categories map to deterministic test-path
patterns, thresholds are constants, and the verdict (`SAFE TO DEPLOY` / `BLOCK`) is a
pure function of pass counts. For PCI, the CRITICAL gates become: no-SAD-stored,
PAN-masked, TLS-enforced; HIGH gates become segmentation and key-rotation checks.

---

## Part B — ECC Security Mechanism → PCI-DSS Requirement Map

| ECC mechanism | Source | What it enforces | PCI-DSS req it supports |
|---|---|---|---|
| security-reviewer agent | `agents/security-reviewer.md` | OWASP Top 10, secrets, injection, authz; severity table CRITICAL/HIGH/MEDIUM with fixes (`:58-69`) | Req 6.2 (secure coding), 6.3 (vuln review) |
| security-review skill | `skills/security-review/SKILL.md` | Secrets in env vars, parameterized queries, RLS, TLS headers, rate limiting; pre-deploy checklist (`:472-492`) | Req 6.2, 8 (auth), 4 (transit crypto) |
| security-scan (AgentShield) | `skills/security-scan/SKILL.md` | Audits `.claude/` config: permissive allow-lists, command injection in hooks, secrets in configs; A–F grade (`:130-138`) | Req 2 (secure config), 6.3 |
| security-bounty-hunter | `skills/security-bounty-hunter/SKILL.md` | Reachable-vuln triage (SSRF, authz bypass, SQLi) with CWE mapping + PoC report schema (`:23-34, 73-88`) | Req 11.3 (pen testing) |
| governance-capture hook | `scripts/hooks/governance-capture.js` | Emits `secret_detected/approval_requested/policy_violation/security_finding` events with severity (`:160-242`) | Req 10 (audit logging), 12.10 (incident events) |
| gateguard fact-force | `scripts/hooks/gateguard-fact-force.js` | DENY→FORCE→ALLOW gate on Edit/Write/destructive Bash (`:830-896`) | Req 6.5 / change-control approval |
| quality-gate hook | `scripts/hooks/quality-gate.js` | Post-edit format/lint enforcement per language (`:57-131`) | Req 6.2 (consistent secure coding) |
| block-no-verify hook | `scripts/hooks/block-no-verify.js` | Blocks `--no-verify` / `core.hooksPath` override; exit 2 = block (`:462-477`) | Req 6.4 (no bypass of change controls) |
| Prompt Defense Baseline | `CLAUDE.md`, `.claude/rules/node.md`, all 63 `agents/*.md` | Anti-prompt-injection / no-secret-leak guardrail | Req 6.2 (input trust boundaries), 3 (no credential disclosure) |
| enterprise controls | `.claude/enterprise/controls.md` | Approval expectations, audit suppressions need reason + narrow matcher (`:11-17`) | Req 12 (policy/governance), 10.5 |
| supply-chain IOC scan | `scripts/ci/scan-supply-chain-iocs.js` | Blocks known-malicious package versions + IOC file hashes/strings | Req 6.3.2 (inventory), 6.4.3 (supply-chain integrity) |
| workflow-security validator | `scripts/ci/validate-workflow-security.js` | Rejects untrusted PR-code execution; forces `--ignore-scripts` installs (`:12-66`) | Req 6.4 (CI integrity) |
| unicode-safety scan | `scripts/ci/check-unicode-safety.js` | Blocks zero-width/bidi/invisible chars (`:111-134`) | Req 6.2 (code integrity / hidden-payload defense) |

---

## Part C — Gated Execution + Audit Ledger Pattern (DENY→FORCE→ALLOW + governance-capture)

This is the architectural basis for a PCI **approval gate + audit ledger** on infra changes.

### C1. GateGuard's three-stage gate

`skills/gateguard/SKILL.md:24-31` states the principle: LLM self-evaluation fails, so the
gate forces concrete investigation instead.

> ```
> 1. DENY  — block the first Edit/Write/Bash attempt
> 2. FORCE — tell the model exactly which facts to gather
> 3. ALLOW — permit retry after facts are presented
> ```
> — `skills/gateguard/SKILL.md:26-30`

The implementation in `scripts/hooks/gateguard-fact-force.js`:

- **DENY + FORCE** is one hook response: `denyResult()` (`:784-797`) returns
  `permissionDecision: 'deny'` with a `permissionDecisionReason` that *is* the list of
  facts to gather — deny and force are fused. Destructive Bash uses the same path:
  `denyResult(destructiveBashMsg(), { includeRecoveryHint: false })` (`:881`).
- **ALLOW on retry**: state is keyed per file/command; once `markChecked()` records the
  first attempt, the second attempt returns `rawInput` unmodified (`:883` "allow retry
  after facts presented", `:847`).
- **Destructive command detection** keys off a hash of the command (`:876`) and the
  destructive-SQL/`dd` regex (`:54`), so `rm -rf`, `git reset --hard`, `drop table` each
  gate once and demand a rollback plan (`skills/gateguard/SKILL.md:74-82`).

**PCI use:** wrap CDE-affecting infra changes (firewall rules, key rotation, DB grants) in
this gate so the agent must present blast radius + rollback before applying — a machine-
enforced **change-approval control (Req 6.5 / 1.2 network-rule changes)**.

### C2. block-no-verify — controls cannot be bypassed

`scripts/hooks/block-no-verify.js:462-477` returns `blocked: true` with a reason for
`--no-verify` and `core.hooksPath` overrides, and the entrypoint exits with code `2` to
block (`:540-541`). This guarantees the gate above cannot be skipped — the integrity
property PCI **Req 6.4** requires of change-control processes.

### C3. governance-capture — the audit ledger

`scripts/hooks/governance-capture.js` is the evidence/ledger side. `analyzeForGovernanceEvents()`
(`:143-244`) produces structured, severity-tagged events written to a `governance_events`
store (header `:9-13`):

- **secret_detected** (severity `critical`) on AWS keys, JWTs, GitHub tokens, private keys
  (`SECRET_PATTERNS` `:26-32`, emit `:160-175`).
- **approval_requested** (severity `high`) when a Bash command matches `APPROVAL_COMMANDS`
  — force-push, hard-reset, `rm -rf`, `DROP TABLE/DATABASE`, `DELETE FROM` (`:40-46`, emit
  `:183-198`). Commands are fingerprinted via SHA-256 (`:105-108`) rather than logged raw —
  a privacy-preserving ledger pattern directly reusable to avoid logging PAN.
- **policy_violation** on writes to sensitive paths (`.env`, `.pem`, `.key`, `id_rsa`)
  (`SENSITIVE_PATHS` `:49-56`, emit `:203-218`).
- **security_finding** on elevated-privilege commands (`sudo/chmod/chown`) (`:221-242`).

Every event carries `id, sessionId, eventType, payload{severity}, resolvedAt, resolution`
— an immutable-by-design, resolvable ledger entry. **This is the PCI Req 10 audit-trail
record** (correlatable by session, severity-tiered, tamper-evident via fingerprints) and
the **Req 12.10 incident-event** feed.

### C4. Combined pattern for the infra agent

`gateguard (DENY→FORCE→ALLOW)` + `block-no-verify (no bypass)` + `governance-capture
(severity-tagged ledger)` + `enterprise/controls.md (approval expectations, suppressions
need reason + narrow matcher, `:15-17`)` compose into: **every CDE-touching action is
gated, un-bypassable, and recorded with severity and resolution** — the core of a PCI
gated-execution + audit-ledger design.

---

## Source inventory (verified files)

- `skills/healthcare-phi-compliance/SKILL.md`, `skills/hipaa-compliance/SKILL.md`,
  `skills/healthcare-eval-harness/SKILL.md`
- `agents/security-reviewer.md`; `skills/security-review/SKILL.md`,
  `skills/security-scan/SKILL.md`, `skills/security-bounty-hunter/SKILL.md`,
  `skills/gateguard/SKILL.md`
- `scripts/hooks/governance-capture.js`, `scripts/hooks/gateguard-fact-force.js`,
  `scripts/hooks/quality-gate.js`, `scripts/hooks/block-no-verify.js`
- `.claude/enterprise/controls.md`; Prompt Defense Baseline in `CLAUDE.md`,
  `.claude/rules/node.md`, and all 63 `agents/*.md`
- `scripts/ci/scan-supply-chain-iocs.js`, `scripts/ci/validate-workflow-security.js`,
  `scripts/ci/check-unicode-safety.js`
