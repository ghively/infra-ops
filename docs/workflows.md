# infra-ops — Operational Workflows

_Last updated: 2026-06-06. Companion to [`docs/architecture.md`](./architecture.md) — this file is the operational how-to; architecture.md is the structural reference._

Each workflow below covers a named operation from trigger to completion. Diagrams carry the primary description; prose gives the key constraints and decision points.

---

## 1. Standard Infrastructure Change (end-to-end)

The normal path for any corporate-zone infrastructure change: planning → authoring → three-way review → change record → human merge.

```mermaid
sequenceDiagram
    participant Op as Operator
    participant O as Orchestrator
    participant IP as infra-planner
    participant IA as iac-author
    participant PR as playbook-reviewer
    participant CR as pci-compliance-reviewer
    participant SS as secrets-scanner
    participant CS as change-scribe

    Op->>O: Change brief (plain text)

    Note over O: Classify — ambiguous brief → infra-planner
    O->>IP: Plan request (brief + knowledge/environment.md pointer)
    IP-->>O: Phased plan · dependency graph · confidence score (0–100)

    alt Confidence < 70
        Note over O,IP: Open unknowns block planning
        O->>Op: Request clarification or additional documentation
    else Confidence ≥ 70
        O->>IA: Author playbook / role / CI file\n(plan pointer + SPEC.md pointer)
        IA-->>O: Feature branch + MR URL + check-mode diff + checklist

        Note over O: Fan out review gate — all 3 in parallel
        par Parallel review
            O->>PR: Review diff
        and
            O->>CR: Review diff
        and
            O->>SS: Scan diff
        end

        PR-->>O: VERDICT + severity table
        CR-->>O: VERDICT + PCI control table
        SS-->>O: VERDICT + findings

        alt All PASS or WARN only
            Note over O: Gate cleared — WARN is advisory only
            O->>CS: Generate change record\n(diff + MR URL)
            CS-->>O: Changelog entry + ADR (if architectural)\ndocs/changes/<record>.yml
            O->>Op: MR ready — review and merge\n(GitLab approvals + human sign-off required)
        else Any reviewer returns BLOCK (cycle 1 of 2)
            O->>IA: Consolidated BLOCK findings (all 3 reviewers)
            IA-->>O: Revised diff

            par Re-review cycle 2
                O->>PR: Re-review revised diff
            and
                O->>CR: Re-review revised diff
            and
                O->>SS: Re-scan revised diff
            end

            PR-->>O: VERDICT (cycle 2)
            CR-->>O: VERDICT (cycle 2)
            SS-->>O: VERDICT (cycle 2)

            alt Still BLOCK after cycle 2
                Note over O: Hard cap reached — escalate
                O->>Op: ESCALATE — open BLOCK findings\nMR not ready · human decision required
            else Gate cleared
                O->>CS: Generate change record
                CS-->>O: Changelog + docs/changes/<record>.yml
                O->>Op: MR ready — review and merge
            end
        end
    end
```

The orchestrator never merges automatically. All promotions beyond Dev are human-gated (GitLab approvals + Octopus manual-intervention steps). The hard cap of two revision cycles prevents runaway loops; on second failure the open findings go directly to the operator.

---

## 2. HSA Change Workflow

Changes to the High Security Area (PCI Card Production + PIN) follow the same skeleton as the standard flow but with air-gap, dual-control, and CPSA-sign-off constraints at every step.

```mermaid
sequenceDiagram
    participant Op as Operator
    participant O as Orchestrator
    participant PP as perso-planner
    participant IA as perso-iac-author
    participant PV as perso-iac-reviewer
    participant CR as perso-cp-compliance-reviewer
    participant PS as perso-scribe
    participant CPSA as CPSA / QSA

    Note over O,PP: ALL inference in HSA zone is local (Ollama)\nNo cloud path — enforced by sensitivity-router hook\n+ ollama-router.js

    Op->>O: HSA change brief

    O->>PP: Plan request (brief + local knowledge base only)
    Note over PP: Context7 and external MCP tools are BLOCKED\nReason only from local repo + ingested knowledge
    PP-->>O: Phased plan · dual-control gates · confidence score

    alt Confidence < 70
        O->>CPSA: Request clarification\n(scope ambiguity — cannot proceed)
        Note over O: Stop until CPSA provides additional documentation
    else Confidence ≥ 70
        O->>IA: Author changes (air-gapped GitLab, local runner)
        IA-->>O: Feature branch + MR URL + check-mode diff

        par Parallel review
            O->>PV: Review diff (correctness/idempotency)
        and
            O->>CR: Review diff (CP + PIN controls)
        end

        PV-->>O: VERDICT + correctness findings
        CR-->>O: VERDICT + CP/PIN control table

        alt Any BLOCK
            O->>IA: Consolidated findings
            IA-->>O: Revised diff
            Note over O: Re-review (same parallel pattern, max 2 cycles)
        else Gate cleared
            Note over O: Dual-control gate required before deploy
            O->>CPSA: Request deployment sign-off\n(MR + change record + dual approver evidence)
            CPSA-->>O: Sign-off token (2 distinct approvers confirmed)

            O->>PS: Generate HSA change record
            PS-->>O: docs/changes/hsa/<record>.yml\n(dual-control evidence included)

            O->>Op: MR ready — deploy requires CPSA dual-control sign-off\nNo auto-promotion, no cloud path
        end
    end
```

Key constraints that differ from the standard flow: no Context7 or external MCP calls from any HSA agent; all inference runs through `ollama-router.js` (localhost only, refuses non-local endpoints); the `dual-control-promotion-gate` requires two distinct named approvers; the CPSA deployment gate blocks all deploy actions until sign-off is recorded.

---

## 3. Drift Detection and Remediation

Drift is detected on a scheduled CI pipeline. When Ansible's check mode reports divergence from the desired state, the infra-auditor surfaces it and the finding feeds directly into the standard change workflow.

```mermaid
flowchart TD
    Trigger(["Scheduled CI pipeline trigger\n(e.g., nightly or on-demand)"])
    Check["ansible-playbook --check --diff\nruns against production inventory\n(read-only — no changes applied)"]

    NoDrift["No changes detected\nPipeline passes"]
    LogStore["Log pass event\nto State Store observations"]

    DriftAlert["Changes detected\nDrift alert raised"]
    AuditInvoke["infra-auditor invoked\n(read-only discovery)"]
    DriftReport["Drift report generated\nFiles affected · expected vs actual\nARA-tagged evidence"]

    ToOrch["Drift report → Orchestrator"]
    ToPlanner["Orchestrator → infra-planner\n(remediation plan request)"]
    StandardChange["Standard change workflow\n(see Workflow 1)\nPlan → Author → Review → Merge"]
    Deploy["Human approves + merges MR\nOctopus promotes to production\nPost-deploy verify: --check returns clean"]

    Trigger --> Check
    Check -->|"no diff output"| NoDrift
    NoDrift --> LogStore
    Check -->|"diff output present"| DriftAlert
    DriftAlert --> AuditInvoke
    AuditInvoke --> DriftReport
    DriftReport --> ToOrch
    ToOrch --> ToPlanner
    ToPlanner --> StandardChange
    StandardChange --> Deploy

    classDef ok fill:#27ae60,color:#fff
    classDef warn fill:#e67e22,color:#fff
    classDef action fill:#2980b9,color:#fff
    class NoDrift,LogStore ok
    class DriftAlert warn
    class AuditInvoke,DriftReport,ToOrch,ToPlanner,StandardChange,Deploy action
```

The `infra-auditor` is read-only — it produces evidence and a report but never applies changes. The `drift-detection` skill defines the ARA-tagging conventions and alert thresholds. Remediation always flows through the standard review gate; drift does not create an exception path.

---

## 4. Secret Detection — Layered Defence

Secret and PAN detection is a defence-in-depth stack. No single layer is the sole gate; all four must pass for a change to reach production.

```mermaid
flowchart TD
    Dev(["Developer workstation"])

    L1["Layer 1: pre-commit hook (gitleaks)\nRuns locally before git commit\nFast — catches obvious secrets at source\nSkill: pre-commit-and-secret-scanning"]
    L1Block["Commit blocked\nDeveloper fixes locally"]

    L2["Layer 2: secrets-scanner agent\nTriggered when MR is opened\nSemantic + pattern scan of full diff\nReturns VERDICT: PASS|WARN|BLOCK"]
    L2Block["VERDICT: BLOCK\nMR cannot merge — findings returned to iac-author\n(enters standard remediation loop)"]

    L3["Layer 3: GitLab Secret Detection template\nCI pipeline — authoritative CI gate\nRuns gitleaks + TruffleHog in SARIF mode\nBlocks pipeline on finding"]
    L3Block["Pipeline blocked\nSARIF report uploaded to GitLab Security dashboard"]

    L4["Layer 4: pan-egress-filter hook (runtime)\nLuhn-validates 13–19 digit sequences\nMatches private keys, AWS AKIA, GitHub tokens\nSlack xox, JWTs — at every tool boundary\nFail-closed: INFRAOPS_DLP_FAIL_CLOSED=1"]
    L4Block["Tool call DENIED\nSession continues — no data escapes"]

    OK(["All layers pass\nChange proceeds to merge"])

    Dev --> L1
    L1 -->|"secret found"| L1Block
    L1 -->|"clean"| L2
    L2 -->|"BLOCK"| L2Block
    L2 -->|"PASS / WARN"| L3
    L3 -->|"finding"| L3Block
    L3 -->|"clean"| L4
    L4 -->|"PAN / secret detected"| L4Block
    L4 -->|"clean"| OK

    classDef block fill:#c0392b,color:#fff
    classDef pass fill:#27ae60,color:#fff
    classDef layer fill:#2980b9,color:#fff
    class L1Block,L2Block,L3Block,L4Block block
    class OK pass
    class L1,L2,L3,L4 layer
```

Layer 4 (pan-egress-filter) runs on every tool call throughout the session — it is not limited to pre-merge. `INFRAOPS_DLP_FAIL_CLOSED=1` makes it deny even on parse errors, trading availability for certainty. The `governance-capture` hook logs any detected pattern to the `governanceEvents` State Store collection for audit.

---

## 5. Governed Learning Loop (Instinct Promotion)

The learning loop converts observed tool-use patterns into governed instincts. Every step except passive observation requires human involvement. No silent self-modification ever occurs.

```mermaid
sequenceDiagram
    participant Hook as observe-runner hook
    participant SS as State Store (observations)
    participant KC as knowledge-curator
    participant Gate as learning-promotion-gate
    participant DG as dual-control-promotion-gate (HSA only)
    participant IL as instinct-ledger.js
    participant Human as Human Operator

    Note over Hook: Runs async on every PostToolUse event
    Hook->>SS: Append tool sequence + file correlation\n(observations collection)

    Note over KC: Human-invoked — /knowledge-ingest or Q&A session
    KC->>SS: Read observations
    KC->>KC: Identify repeating pattern\nScore confidence (0.0 – 1.0)\nFind supporting citation

    alt Confidence < 0.7 or compliance item lacks citation
        KC->>Human: Candidate rejected — insufficient confidence or missing citation
    else Confidence ≥ 0.7 and citation present
        KC->>Human: Propose instinct candidate\n(YAML draft with evidence)
        Human->>Gate: /instinct-promote --approve <id> --approver <name>

        alt Corporate zone
            Gate->>Gate: Validate: human approver present\nconfidence ≥ 0.7 · citation present · zone = corporate
            Gate-->>IL: Gate PASS
        else HSA zone
            Gate->>DG: Delegate to dual-control gate
            Note over DG: Requires 2 distinct named approvers\nCPSA sign-off required
            DG->>Human: Request second approver
            Human->>DG: Second approver confirms
            DG-->>IL: Dual-control PASS
        end

        IL->>IL: Write knowledge/instincts/<zone>/<id>.yml\n(status: active, promoted_by: gate)
        IL->>SS: Log governanceEvent (promotion)\n(governanceEvents collection)
        IL-->>KC: Promotion confirmed

        Note over Human: Rollback available at any time
        Human->>IL: /instinct-rollback <id>
        IL->>IL: Update status: deprecated\nLog rollback governance event
    end
```

The `instinct-ledger.js` library is the **only** writer of instinct YAML. The `knowledge-curator` drafts candidates but never writes directly to `knowledge/instincts/`. The `governance-ledger` hook writes an independent tamper-evident audit record of every promotion and rollback event.

---

## 6. Incident Response

The agent plays a bounded, supporting role during incidents — it never leads the response, never handles evidence directly for CHD incidents, and defers to security team authority immediately.

```mermaid
flowchart TD
    Detect(["Incident detected\n(monitoring alert, hook flag, or operator report)"])

    CHD{{"Is CHD involved\nor suspected?"}}

    NotifySec["CPSA / QSA notified immediately\nAgent steps back from CHD evidence\n(PCI CP + PIN requirement)"]
    AgentSupport["Agent continues in supporting role\n(non-CHD aspects only)"]

    Contain["Contain\nAgent proposes: isolate affected system\nrevoke compromised credential\nblock suspicious network path\n(proposals only — human executes)"]

    Preserve["Preserve\nIdentify relevant logs (paths, timestamps)\nGenerate hash list for integrity verification\nDo NOT read or reproduce log content"]

    Escalate["Escalate\nNotify security team with:\n· timeline · affected systems\n· proposed containment steps\n· hash list"]

    Record["Write incident record\ndocs/incidents/<timestamp>-<slug>.yml\n(via change-scribe or knowledge-curator)"]

    PostIncident["Post-incident review\nchange-scribe generates\nlessons-learned ADR\ndocs/changes/<record>.yml"]

    Detect --> CHD
    CHD -->|"YES"| NotifySec
    CHD -->|"NO"| AgentSupport
    NotifySec --> AgentSupport
    AgentSupport --> Contain
    Contain --> Preserve
    Preserve --> Escalate
    Escalate --> Record
    Record --> PostIncident

    classDef critical fill:#c0392b,color:#fff
    classDef action fill:#2980b9,color:#fff
    classDef terminal fill:#27ae60,color:#fff
    class NotifySec critical
    class Contain,Preserve,Escalate,Record action
    class PostIncident terminal
```

The `incident-response` skill (loaded by `sensitive-local-analyst` and `pci-compliance-reviewer`) codifies the contain/preserve/escalate pattern per PCI DSS Req 12.10.x and 12.10.7. The agent never directly handles evidence for CHD incidents — the CPSA/QSA takes ownership immediately upon CHD suspicion.

---

## 7. Knowledge Ingestion and Cited Answers

Documents are ingested through a classification gate before being stored. CHD-adjacent documents never travel through the cloud path. Answers to scoping questions are always cited, never guessed.

```mermaid
sequenceDiagram
    participant Op as Operator
    participant O as Orchestrator
    participant KC as knowledge-curator
    participant SR as sensitivity-router hook
    participant OLL as ollama-router.js (local lane)
    participant SS as State Store (knowledgeBase)
    participant KI as knowledge/index.yaml

    Op->>O: /knowledge-ingest <document-path>
    O->>KC: Ingest document (path pointer)

    KC->>KC: Classify sensitivity:\nPUBLIC | INTERNAL | SENSITIVE | CHD-ADJACENT

    alt CHD-ADJACENT
        Note over KC,SR: sensitivity-router blocks cloud path\nunder INFRAOPS_SENSITIVE_FAIL_CLOSED=1
        KC->>SR: Tool call attempted
        SR-->>KC: DENY (cloud path blocked)
        KC->>OLL: Route to local lane\n(ollama-router.js — localhost only)
        OLL-->>KC: Local processing result\n(output stays in-zone)
    else Not CHD-ADJACENT
        KC->>KC: Extract topics + metadata
        KC->>SS: Index entry → knowledgeBase collection
        KC->>KI: Update knowledge/index.yaml
        KC-->>O: Ingestion confirmed\n(classification + topic summary)
        O-->>Op: Document ingested
    end

    Note over Op,KC: Later — operator asks a scoping or compliance question
    Op->>O: Scoping question
    O->>KC: Answer with citation (knowledge base search)

    KC->>SS: Search knowledgeBase collection
    KC->>KC: Generate cited answer\nConfidence score 0–100

    alt Confidence < 50
        KC-->>O: Cannot answer — insufficient documentation\nList missing sources needed
        O-->>Op: Cannot answer — documentation needed:\n<source list>
    else Confidence ≥ 50
        KC-->>O: Cited proposal\n(answer + citation + confidence score)
        O-->>Op: Cited proposal — human confirmation required\nbefore acting on scoping answer
    end
```

The `knowledge-curation` skill defines the classification taxonomy and the cited-answer protocol. All compliance answers are proposals requiring human confirmation — the system never acts on an unconfirmed scoping answer. Documents classified CHD-ADJACENT are kept out of the cloud context entirely; even their metadata is processed locally when `INFRAOPS_SENSITIVE_FAIL_CLOSED=1`.
