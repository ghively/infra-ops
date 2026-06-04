# Infra-Ops Agent — Ground-Up Design (v2: card-manufacturer scope)

> A harness-native DevOps agent for a **credit-card manufacturer / personalization bureau** running
> Ansible + self-hosted GitLab CI/CD + Octopus Deploy across a mixed Windows/Linux estate. Claude
> Code is the lean orchestrator of an isolated-specialist subagent system. Every decision is
> justified by **(a)** an external best-practice source and **(b)** a concrete ECC precedent
> (`path:line`). ECC is the launchpad, not scripture — net-new agents/skills are designed where the
> card-production context warrants.
>
> **Status:** design proposal for review — no implementation yet. Phased plan in §14.
> **Companion research:** twelve cited reports in [`docs/infra-agent/research/`](research/).
>
> **Decisions locked with the user:** GitOps + gated execution · broad read (corporate) · docs
> in-repo **and** published · dev→test→staging→prod promoting one immutable artifact · **local-only
> LLM for sensitive data** · Octopus kept (multiple Tentacles) · lean orchestrator + isolated
> specialists · repo topology = our recommendation · **the company manufactures cards in-house: full
> data-prep + personalization + key management/HSMs** · **the agent should eventually reach into the
> production zone** (heaviest compliance lift) · **no inference hardware yet — this PoC also specs
> what to buy** · **some scoping facts can't be answered directly — provide internal documentation
> and the agent answers from it (cited) via a governed, human-gated self-improvement loop (§14)**.

---

## 0. The standards reality (this reframes everything)

Because you **manufacture and personalize cards in-house with your own key management/HSMs**, the
production floor is **not** governed by PCI DSS. It is governed by (research/pci-card-production.md
§1):

- **PCI Card Production & Provisioning — Physical + Logical Security Requirements v3.0 (2022)** — the
  governing standard *inside* the High Security Area (HSA).
- **PCI PIN Security Requirements v3.1** — because you do key management / PIN / key injection.
- **PCI PTS HSM** — the HSMs must be PCI-approved or FIPS 140-2 Level 3+.
- **PCI DSS v4.0.1** — governs **corporate IT** and any account-data environment outside the floor,
  and is referenced *by* the CP standard for specific controls (e.g., TLS).

These are **enforced by the card brands** (Visa/Mastercard/Amex/Discover/JCB), assessed **on-site by
CPSA-L / CPSA-P assessors** under a **listed-vendor** model with signed AOC+ROC — *not* QSA
self-attestation (research/pci-card-production.md §1). The design must be defensible to an on-site
brand assessor, which raises the bar on the agent's **auditable exclusion** from the HSA.

**Consequence:** this is a **two-zone, two-deployment** system, not one agent with broad reach.

---

## 1. The one architectural idea — split by zone

**Corporate zone (PCI DSS):** the agent reads broadly, authors code, opens MRs; the pipeline applies
after a human approves; it may auto-deploy to **Dev** behind a gate. This is the GitOps + gated-
execution model (`commands/multi-execute.md:14-17` code sovereignty; `skills/gateguard/SKILL.md:26-30`
DENY→FORCE→ALLOW).

**Production zone (PCI CP Logical+Physical + PIN):** a **separate, air-gapped, in-HSA deployment**
that is **authoring/advisory only**. It prepares reviewed artifacts that in-zone staff apply under
**human, dual-control, witnessed, CISO-approved** test→live promotion (research/pci-card-production.md
§3.3 §6.2). It **never** touches cleartext PAN, keys, key components, PINs, or HSMs, **never** holds
remote-admin into the HSA, and runs on a **local-only LLM with no internet egress** because the
perso/DP networks must be *"independent of … Internet-connected networks"* and **"a VLAN is not
considered a separate network"** (research/pci-card-production.md §3.1, §5.4).

The single hard rule both zones share: **the agent proposes; humans/pipelines dispose** — turned up
to its strictest setting inside the HSA.

---

## 2. The trust boundary, per zone

| Capability | Corporate zone (DSS) | Production zone / HSA (CP + PIN) |
|---|---|---|
| **READ** | Broad: GitLab API, Ansible inventory/facts/`--check`, Octopus API, CMDB/monitoring | Limited to in-zone, non-CHD systems; **no** cleartext PAN/keys ever (CP §4.3, §5.6 h/i) |
| **WRITE to code** | branches + MRs (never protected branches) | branches + MRs in an **in-zone** GitLab only; dev/prod SoD (CP §6.6.3) |
| **EXECUTE** | trigger CI; Octopus release + deploy to **Dev** behind gate | **none autonomous**; test→live is human + dual-control + CISO-approved + witnessed (CP §6.2) |
| **Promotion to prod** | human-gated (GitLab approvals + Octopus manual intervention) | human-only, dual-control, witnessed; agent cannot be an approver |
| **Secrets / keys** | Vault references only; never plaintext | **never** — keys/components/ceremonies are out-of-band, dual-control, split-knowledge, HSM-bound (CP §8, §8.14, §8.1 d/g) |
| **Network** | management network, segmented from CDE | **dedicated, internet-independent network** (VLAN ≠ separation); in/out of HSA is **read-only** except VPA-approved, no-CHD writes (CP §5.2 e/g/i) |
| **LLM** | cloud tiers for non-sensitive + local lane for sensitive | **local-only, no egress** (CP §5.2 e, §4.2 d) |
| **Remote admin into HSA** | n/a | **prohibited** for a non-human actor — §5.6 requires pre-screened humans, MFA, approved non-personal hardware, no cleartext-PAN/key path |

ECC precedent for read/write asymmetry: read-only specialist agents declared with read-only `tools:`
and "do not apply configuration" safety rules (`docs/deep-dive/01-agents.md:836-842`); write-capable
ones gated by `gateguard-fact-force.js` + `block-no-verify.js` (research/ecc-security-compliance.md §C).

---

## 3. Component map (two deployments, in ECC terms)

Claude Code is the **lean orchestrator** in both zones: classify → lazy-load skills → delegate to
isolated specialist subagents (each in its own context window) → enforce guarantees via **hooks**, not
prompts → track as a resumable task ledger (`docs/deep-dive/README.md` §2).

```
══ CORPORATE ZONE (PCI DSS) ═════════════════════════════════════════════════════════
  Claude Code orchestrator → subagents:
    infra-planner(opus) · iac-author(opus→sonnet/local) · playbook-reviewer(sonnet)
    pci-compliance-reviewer(sonnet) · infra-auditor(sonnet) · sensitive-local-analyst(LOCAL)
    change-scribe(haiku)
  Hooks: sensitivity-router · pan/secret-egress-filter · infra-gateguard · governance-ledger
         · change-scribe-hook · context-monitor/suggest-compact
  Skills (lazy): ansible-patterns/-testing · gitlab-cicd-pipeline · octopus-release
                 · pci-dss-compliance · drift-detection · multi-env-promotion · (reuse) gateguard…
  MCP (few, pinned): self-hosted GitLab MCP · Ansible Dev Tools MCP · Octopus API (read)
  Models: cloud tiers (haiku/sonnet/opus) for non-sensitive  +  LOCAL lane for CHD-adjacent

         ── dedicated, separate network (NOT a VLAN); MFA VPN; read-only in; ──
         ── write-restricted, no-CHD, VPA-approved functions only ────────────

══ PRODUCTION ZONE / HSA (PCI CP Logical+Physical + PIN) ═════════════════════════════
  In-zone Claude Code (authoring/advisory ONLY) → subagents:
    perso-iac-author(LOCAL) · perso-change-reviewer(LOCAL) · cp-compliance-reviewer(LOCAL)
  Hooks: hsa-boundary-guard (block any key/PAN/HSM reference) · dual-control-promotion-gate
         · governance-ledger (append-only, off-box) · block-no-verify
  Skills (lazy): pci-cp-compliance · pci-pin-awareness · perso-change-control
  Models: LOCAL ONLY — air-gapped Ollama/vLLM box inside the HSA, zero internet egress
  HARD EXCLUSIONS: no PAN · no keys/components · no PINs · no HSM config · no autonomous deploy
```

### 3.1 Subagent model tiers — ECC precedent + justification

ECC rule: **start cheapest; escalate only on a clear reasoning gap** (`skills/agentic-engineering/SKILL.md:63`);
never "use the most expensive model for all requests" (`skills/cost-aware-llm-pipeline/SKILL.md:172`).
ECC's own distribution is 8 opus / 53 sonnet / 1 haiku across 63 agents (research/ecc-model-selection.md §1).

| Subagent | Zone | Tier | ECC precedent | Why |
|---|---|---|---|---|
| infra-planner | corp | **opus** | `agents/planner.md:5`, `gan-planner.md:5-6` | Multi-file invariant planning from ambiguity; infrequent (research/ecc-model-selection.md §7.4) |
| iac-author | corp | **opus** greenfield → sonnet/local routine | `agents/architect.md:5`; `/model-route` `commands/model-route.md:12-17` | Structural authoring = opus; mechanical edits route down |
| playbook-reviewer | corp | **sonnet** | `agents/code-reviewer.md:5` | Fixed-checklist review on every MR; ~4× cheaper than opus (research/ecc-model-selection.md §7.2) |
| pci-compliance-reviewer | corp | **sonnet** | `agents/security-reviewer.md:5`; `healthcare-eval-harness` gates | Severity-tiered rule comparison (research/ecc-security-compliance.md §A7) |
| infra-auditor | corp | **sonnet** | `agents/harness-optimizer.md:5`, `network-config-reviewer` | Read-only drift/compliance; opus overkill, haiku risks nuance (research/ecc-model-selection.md §7.3) |
| sensitive-local-analyst | corp | **LOCAL Ollama** | `agents/healthcare-reviewer.md:5` (domain-risk) | Any CHD-adjacent corporate work stays on-prem |
| change-scribe | corp | **haiku** | `agents/doc-updater.md:5` (only haiku agent) | Mechanical doc generation |
| perso-iac-author / -reviewer / cp-compliance-reviewer | **HSA** | **LOCAL ONLY** | healthcare-reviewer domain-risk + CP §5.2 e | The HSA is air-gapped; **no cloud tier exists in-zone**, period |

Cost discipline at runtime uses ECC's shipped mechanisms: immutable cost tracker
(`skills/cost-aware-llm-pipeline/SKILL.md:49-76`), complexity-threshold routing (`:32-41`), prompt
caching (read = 10% of input), Batch API (50% off) for nightly scans (research/hybrid-ollama-model-routing.md §6).

---

## 4. The hybrid model architecture (cloud tiers + local lanes)

Corporate zone runs **two planes** with a classifier deciding before any egress; the HSA runs the
local plane **only**.

```
CORP request ─▶ LOCAL sensitivity classifier (PAN/Luhn + PII/NER + data-tags)
                 sensitive ─▶ LOCAL lane (egress BLOCKED)      non-sensitive ─▶ cloud router (haiku▸sonnet▸opus, +cache, +batch)
                 └────────────── immutable audit: {req_id, label, tier, egress=local|cloud} ──────────────┘
HSA request  ─▶ LOCAL lane ONLY (air-gapped; no cloud path exists)
```

- **Why local for sensitive / mandatory for HSA:** sending CHD to a cloud LLM exports it to a TPSP and
  *expands* scope; for the HSA it's outright prohibited (internet-independent network, no cleartext on
  public-facing paths) (research/pci-card-production.md §5.4; research/hybrid-ollama-model-routing.md §1;
  research/pci-dss-devops.md §4).
- **ECC already supports the local route in code:** `get_provider("ollama")` → `OLLAMA_BASE_URL`-pinned
  localhost adapter using only `urllib` (no cloud SDK imported), with capability-aware tool degradation
  (`src/llm/providers/ollama.py:25-26,31-52`; `resolver.py:49-58`; `prompt/builder.py:106-109`).
  "Data never leaves the local machine as long as `OLLAMA_BASE_URL` points to localhost"
  (research/ecc-context-and-ollama.md §2.6). *Caveat:* register a function-calling-capable model — the
  bundled ones are `supports_tools=False`.

---

## 5. Hardware & procurement (you're buying from scratch)

You need **two (likely three) inference boxes** because the HSA cannot share infrastructure with
corporate. All grounded in research/local-llm-hardware.md.

### 5.1 Model choice
- **Workhorse: `Qwen2.5-Coder-32B-Instruct`** (dense) — the benchmark-leading open coder (tops
  EvalPlus/LiveCodeBench/BigCodeBench, ~GPT-4o on Aider), strong native tool calling
  (research/local-llm-hardware.md §1; research/hybrid §3).
- **Efficient alternative / PoC: `Qwen3-Coder-30B-A3B`** (MoE, 30B total / ~3.3B active) — 30B-class
  reasoning at ~18–19 GB VRAM, 128K context, fits a single 24–32 GB GPU; strong agent tool calling
  (research/local-llm-hardware.md §1, §5).
- Both expose **native tool calling** (Hermes parser) — essential for an *agent*, not just chat.

### 5.2 Serving stack
- **PoC → Ollama** (single binary + GGUF, trivial air-gap transfer, fine for one operator).
- **Production → vLLM** — ~20× higher throughput under concurrency (793 vs 41 tok/s on A100), native
  tool-call parsing, OpenAI-compatible API, offline install (`HF_HUB_OFFLINE=1`). Avoid **TGI**
  (maintenance mode since Dec 2025) (research/local-llm-hardware.md §3-4).

### 5.3 Recommended builds (near-BOM)

| Tier | Where | GPU | Model / stack | ~Cost |
|---|---|---|---|---|
| **PoC / pilot** | corporate | **RTX 5090 32 GB** (or 4090 24 GB) | Qwen3-Coder-30B-A3B Q4 · Ollama | **$3.4–5.1k** |
| **Production (corp)** | corporate | **2× L40S 48 GB** (ECC, rack, passive) | Qwen2.5-Coder-32B Q4 · vLLM (mTLS via nginx) | **$24–35k** |
| **Budget production** | corporate | **1× used A100 80 GB** | Qwen2.5-Coder-32B Q8 · vLLM | **$10–18k** |
| **In-HSA box** | **inside the HSA, air-gapped** | RTX 6000 Ada 48 GB **ECC** (or L40S) | Qwen2.5-Coder-32B Q4/Q8 · vLLM or Ollama | **$10–18k** |

Notes (research/local-llm-hardware.md §2, §5-6): prefer **ECC** memory for any 24/7 / PCI box (RTX
5090/4090 have none — acceptable for PoC, not the HSA); **dual L40S** gives either 2× concurrency
(replicas) or a 70B via tensor-parallel if eval shows the 32B falling short; **A100 80 GB used** is
strong value. *Avoid Apple Silicon for the PCI boxes* (macOS hardening/update model fights egress-
blocked zones; "M4 Ultra does not exist" — M3 Ultra 192 GB is the Apple max). The in-HSA box must be
installed/patched via **internal mirrors / approved media** (no internet), FIPS mode (RHEL/Rocky 9),
LUKS disk encryption, SELinux enforcing, SSH key-only from a jump host, vLLM behind nginx mTLS, logs
to internal SIEM (research/local-llm-hardware.md §6).

> Start the PoC on the **single RTX 5090 corporate box**; defer the L40S production box and the in-HSA
> box until the workflow is proven and the CPSA has reviewed the in-zone design (Phase 7).

---

## 6. Context engineering (keep the orchestrator lean)

Adopt ECC's five mechanisms — "token usage explains ~80% of variance; more tokens makes agents worse"
(research/hybrid §6; research/ecc-context-and-ollama.md Part 1):

1. **Trigger-table lazy loading** (`strategic-compact/SKILL.md:101-110`, "50%+ baseline reduction"):
   `"ansible|playbook"→ansible-patterns`, `"molecule|idempoten"→ansible-testing`,
   `"pipeline|runner"→gitlab-cicd-pipeline`, `"octopus|tentacle"→octopus-release`,
   `"pci|cp|perso|hsa"→pci-cp-compliance`, `"pan|chd|cardholder"→pci-dss-compliance`, `"drift"→drift-detection`.
2. **`paths:` rule scoping** (`rules/golang/coding-style.md:1-6`): infra rules load only for
   `**/ansible/**`, `**/*.yml`, `**/inventory/**`, `.gitlab-ci.yml`.
3. **Context-pressure hooks** (`ecc-context-monitor.js:19-26`): warn at 35%/25% remaining; loop detection.
4. **Strategic-compact at phase boundaries** (`suggest-compact.js:89-99`): compact at plan→author,
   author→review; never mid-apply.
5. **Subagent isolation** (`agents/planner.md:1-5`): read-heavy scans (drift, compliance) isolated;
   routine edits not (subagents cost ~15× chat tokens — isolate only when value justifies, research/hybrid §6).

---

## 7. Compliance architecture — layered DSS + CP/PIN

```
┌ CORPORATE IT / GENERAL SERVERS ───────────────────────── PCI DSS v4.0.1 ─┐
│  agent brain (local+cloud), GitLab, Octopus server, Ansible control node,│
│  CI runners, IaC repos, non-CHD app & back-office servers                 │
│  AGENT OPERATES HERE: hardening, patching, IaC, change prep, audit        │
└──────────── dedicated separate network (NOT a VLAN); MFA VPN; ───────────┘
             read-only IN; write-restricted, no-CHD, VPA-approved only
┌ HIGH SECURITY AREA ───────────── PCI CP Logical+Physical (+ PCI PIN) ─────┐
│  Data-Prep network (cleartext PAN) → Personalization network (chip/PIN    │
│  keys, HSMs FIPS L3+).  Keys: dual control + split knowledge, air-gapped  │
│  component PCs.  In-zone agent = authoring/advisory ONLY.                  │
│  NEVER: PAN · keys/components · PINs · HSM config · autonomous deploy.     │
│  test→live = human, dual-control, witnessed, CISO-approved.               │
└───────────────────────────────────────────────────────────────────────────┘
```

**Corporate (DSS)** controls reuse ECC primitives directly (research/ecc-security-compliance.md;
research/pci-dss-devops.md): a `pci-dss-compliance` skill modeled on `healthcare-phi-compliance`
(tri-layer classify/access/audit — `skills/healthcare-phi-compliance/SKILL.md:24-108`); CRITICAL/HIGH
eval gates from `healthcare-eval-harness` (`:25`); gated execution via gateguard DENY→FORCE→ALLOW
(`gateguard-fact-force.js:784-797`); un-bypassable via `block-no-verify.js:462-477`; append-only,
fingerprinted audit ledger via `governance-capture.js:105-108,143-244` (extend its PAN/Luhn patterns).

**Production (CP/PIN)** adds net-new, stricter controls (research/pci-card-production.md §3-5):
- **`hsa-boundary-guard` hook** — blocks any tool input/output referencing keys, key components, PINs,
  HSM operations, or cleartext PAN (hard exclusion, §8 §8.14 §4.3).
- **`dual-control-promotion-gate`** — the agent can *prepare* a test→live change but the gate requires
  two human sign-offs (dev + prod staff) witnessed, with CISO approval (§6.2) — automation can never
  be the approver.
- **`pci-cp-compliance` + `pci-pin-awareness` skills** — encode §5.2 segregation, §5.6 remote-access
  limits, §6 hardening/change-control, §8 key-management exclusions as the in-zone reviewer's checklist.
- **Air-gap enforced at the network**, not in code (§5.2 e; VLAN insufficient).

**Audit evidence** = three streams forwarded to a tamper-evident SIEM (FIM, common NTP, retention):
GitLab audit events + approvals · Octopus audit log · the agent's append-only governance ledger
(research/pci-dss-devops.md §5; CP §6.4 requires 1-year/3-month-online retention, log-integrity
protection, tiered review). The whole chain must be **defensible to an on-site CPSA assessor**, with
the agent's **exclusion from the HSA crown jewels auditable** (research/pci-card-production.md §7.6).

---

## 8. Secrets, keys & egress

- **Corporate:** HashiCorp Vault as source of truth; Ansible `community.hashi_vault` runtime lookups so
  the repo/agent hold only *paths*; `no_log: true`; gitleaks MR gate; GitLab↔Vault via JWT/OIDC with
  bound claims (prod path only on protected `v*.*.*` tags) (research/ansible-iac-gitops.md §3;
  research/multi-env-versioning.md §6.3; research/pci-dss-devops.md §8).
- **HSA keys:** entirely **out of scope for the agent** — generation/loading/backup/destruction and
  all ceremonies are dual-control, split-knowledge, HSM-bound human operations on air-gapped,
  powered-down component PCs; no hard-coded keys (CP §8.1 d/g, §8.14). The agent treats HSMs as opaque
  appliances it never configures and keys it never sees.
- **Egress filter** (corporate): PreToolUse DLP hook scans every ingested artifact for PAN (Luhn) and
  secrets before any cloud call; on match → local lane or block. In the HSA there is **no cloud path
  to filter toward** — egress is blocked at the network.

---

## 9. Repository topology (recommendation)

**Hybrid polyrepo**, with **perso/CP content fully isolated** from corporate and DSS content
(research/modular-ansible-repos.md §2, §7):

```
Private Automation Hub / Galaxy NG  (signed collections; perso namespace is restricted)
Collection repos (one each):  corp.base_os · corp.network · corp.observability
                              corp.cde_hardening   (CODEOWNERS: @security @compliance)
                              corp.perso_*  ← HSA/CP content: restricted ACL, in-zone only
Playbook repos (thin):  ansible-playbooks-platform · ansible-playbooks-perso (in-zone GitLab)
Inventory repos:        inventory-platform (dev/test/staging/prod) · inventory-perso (restricted, in-zone)
```

- Polyrepo makes **separation of duties structural** — perso content lives in a restricted repo whose
  ACL excludes non-HSA staff (and gives the corporate agent *no* path), versus a monorepo where a
  mis-set CODEOWNERS "silently removes a protection" (research/modular-ansible-repos.md §2). This maps
  directly onto CP §6.6.3 dev/prod SoD and restricted source access.
- **Pin exact `==` versions** + `requirements.lock.yml`; **sign collections** (GPG via PAH), proxy
  third-party through PAH (CP/DSS supply-chain integrity; ECC precedent `scripts/ci/scan-supply-chain-iocs.js`).
- Inventory separate from roles/collections; one dir per environment (research/modular-ansible-repos.md §6).

---

## 10. Branching, versioning & promotion (dev → test → staging → prod)

- **Trunk-based + per-environment directories**, pipeline-driven promotion (research/multi-env-versioning.md
  §3, §7.1). `main` is trunk; `environments/prod/**` CODEOWNERS-gated; playbooks environment-agnostic
  (no `when: env=='prod'`).
- **Build once, promote one immutable artifact** tagged `$CI_COMMIT_SHA`; reference EEs by digest;
  Octopus promotes the same release snapshot, only scoped variables change (research/multi-env-versioning.md
  §4.3, §5.2; research/octopus-multitentacle.md §3.2).
- **In the HSA, the final promotion gate is human + dual-control + witnessed + CISO-approved** — the
  "build once, promote" artifact discipline still applies, but "merge = deploy" never does (CP §6.2).

---

## 11. GitLab runner topology (~3 runners, corporate)

Split by OS + trust; route by tags; fence prod reach to one protected, approval-gated runner
(research/gitlab-octopus-cicd.md §2.5, §6):

| # | Runner | Executor | Tags | Jobs | Trust |
|---|---|---|---|---|---|
| 1 | Linux CI | Docker (non-priv, EE) | `linux,docker,ci` | lint/syntax/`--check`/molecule/conftest | untrusted MR code; **no prod secrets**; ephemeral |
| 2 | Linux deploy | Shell (locked)/Docker+EE | `linux,deploy,ansible` | `ansible-playbook` Linux(SSH)+Windows(WinRM/Kerberos) | **protected**, prod-only, Vault access, approval-gated — the only runner with prod reach |
| 3 | Windows | Shell/PowerShell | `windows,shell` | MSBuild/Pester/package→registry | trusted Windows-native **build only** |

The Ansible control node is **Linux**, driving Windows over WinRM/Kerberos — no Windows runner needed
for *deploys* (research/gitlab-octopus-cicd.md §5.1). The HSA gets its **own** in-zone runner(s),
never shared with corporate.

---

## 12. Octopus — kept, with a clean division of labor

You run multiple Tentacles, so Octopus stays (the Tentacle footprint *is* the "KEEP" signal,
research/gitlab-octopus-cicd.md §3.5). Division (research/octopus-multitentacle.md §5):

- **Ansible owns the machine** — OS config/hardening, firewall, IIS *baseline*, runtimes, service
  accounts, WinRM, Tentacle bootstrap. Idempotent, release-independent.
- **Octopus owns the release** — app package deploy, IIS *binding* per release, config transforms,
  Windows services, DB migrations (worker pool), runtime secret injection, smoke tests, rollback,
  promotion gates + audit.
- Topology: listening Tentacles in dev/test; **polling Tentacles over 443** for staging/prod and the
  HSA (outbound-only — satisfies CP/PCI segmentation without inbound holes); worker pool per env;
  **separate Octopus instance for the production/CDE/HSA** (license includes 3 instances)
  (research/octopus-multitentacle.md §1.4, §4.5). CI service account = `Release Creator` + Dev-scoped
  `Deployment Creator` only; Test/Staging/Prod promotion happens inside Octopus via lifecycle phases +
  team-scoped manual intervention (§2-4) — which is exactly the CP §6.2 human dual-control gate.

---

## 13. Auto-documentation & audit (in-repo **and** published)

- **In-repo source of truth:** ADRs + CHANGELOG + per-change record (what/why/blast-radius/rollback)
  generated by **change-scribe** (haiku) from the merged diff via a post-merge hook (ECC precedent:
  `doc-updater` haiku + `governance-capture` ledger).
- **Published:** a CI job mirrors in-repo docs to the GitLab Wiki / docs site after merge.
- **Ansible run tracking:** ARA callback records every play/task/result **tagged with commit SHA +
  pipeline ID** (joins *what/when* to GitLab's *who/why*); scheduled `--check --diff` drift jobs
  publish diffs as artifacts; non-empty = alert (research/ansible-iac-gitops.md §4).
- **Auditor-acceptable chain:** signed commit → reviewed MR (lint/conftest/molecule + `--check` diff)
  → protected branch → protected-environment approval (who/when) → deploy + ARA record → SIEM-
  forwarded, FIM-protected, retained (research/gitlab-octopus-cicd.md §4.3; CP §6.4).

---

## 14. Documentation-grounded knowledge & governed self-improvement

You can't answer some of the §17 open questions directly, but you can supply internal documentation.
So the agent **answers them from your docs — with citations — and keeps adapting**. In a
card-production environment this must be a *governed* loop: **propose, never silently self-modify**.
Every learned change is human-approved, evidence-cited, audited, reversible, and zone-sandboxed —
because PCI CP change control requires documented CISO approval + dual-control witnessed promotion
(research/pci-card-production.md §3.3, §6.2). This is precisely ECC's instincts-as-reviewable-data
model, not an autonomous "rewrite itself" loop.

### 14.1 Documentation grounding (answer-from-docs, cited)
- **On-prem knowledge base.** Ingest network/topology diagrams, security policies, runbooks, CMDB
  exports, prior CPSA/QSA reports, HSM & vendor docs, Ansible inventories, Octopus config into a
  **local, queryable** store (local embeddings/retrieval; **no cloud egress**).
- **Sensitivity-classified on ingest** (public / DSS-sensitive / CP-sensitive / contains-CHD).
  CP-sensitive and CHD docs are ingested and queried **only on the local / in-zone lane** and never
  enter a cloud-reachable index (CP §4.2, §5.4; research/pci-card-production.md).
- **Answers carry citations, never guesses.** Scoping questions (DSS-vs-CP system split, HSA network
  reality, HSM vendor, ingress/egress) are answered **by retrieval with a pointer to the source doc**.
  ECC precedents: `iterative-retrieval` (vocabulary-discovery-first), `knowledge-ops`, `search-first`
  (report skipped channels honestly), the evidence-before-action cross-cutting pattern
  (research/ecc-context-and-ollama.md; `docs/deep-dive/skills-group-*`).
- Derived answers are **confidence-scored proposals with citations**, surfaced for your confirmation —
  authoritative only once you approve.

### 14.2 The governed learning loop (observe → propose → verify → promote → rollback)
ECC precedent: `homunculus/instincts` (confidence-scored, evidence-backed, self-curating "few accurate
over many duplicated" — `docs/deep-dive/10-infra-mcp-integrations.md`), `/learn`+`/evolve`+`/promote`,
`continuous-learning-v2` (hooks-for-observation + background analysis), `rules-distill` (deterministic
collection + LLM judgment), `/hookify` (corrections → guardrails).

1. **Observe** (hooks, ~100% reliable vs skills' 50–80%): corrections, doc updates, drift findings,
   recurring fixes, your feedback; a **background LOCAL model** analyzes asynchronously, off the main
   context (research/ecc-context-and-ollama.md; continuous-learning-v2).
2. **Propose**: candidate instinct/rule/answer as a **confidence-scored, evidence-cited** entry
   (e.g., "host X = CP-scope per network diagram Y rev 3").
3. **Verify**: checked against evidence; compliance-relevant items **must cite an authoritative doc**;
   must not widen blast radius (the evidence-gated verifier shape).
4. **Promote**: **only after human approval**; promoted knowledge is **versioned, reviewable YAML
   instincts** — never a silent prompt mutation. Deterministic collection + LLM judgment (rules-distill)
   keeps the inventory reproducible.
5. **Rollback**: every promotion is reversible.

### 14.3 Compliance guardrails on learning (non-negotiable)
- **No unsupervised self-modification.** The loop *proposes*; humans *promote*. The agent never
  rewrites its own behavior — especially in/around the HSA — without change-controlled approval (CP §6.2).
- **Zone-sandboxed.** Corporate-learned knowledge never auto-crosses into the HSA deployment; in-zone
  learning stays in-zone (air-gap, §5.2 e).
- **Untrusted documents.** Ingested docs are untrusted content (an *indirect* prompt-injection vector
  — the infra agent's real threat): Prompt Defense Baseline, sanitize, never act on embedded
  instructions (research/hybrid-ollama-model-routing.md §4, OWASP LLM01).
- **Fully audited & sensitivity-respecting.** Every observe/propose/promote/rollback is an append-only
  governance-ledger event (who/what/when/evidence) feeding CP §6.4 / DSS Req 10; CP/CHD-derived
  learning runs only on the local / in-zone lane.

### 14.4 New components for this
- **`knowledge-curator`** subagent (sonnet in corporate / LOCAL in-zone): ingests + classifies docs,
  answers from them with citations, maintains the instinct ledger.
- Skills (reuse/adapt): `knowledge-ops`, `iterative-retrieval`, `continuous-learning-v2`,
  `rules-distill`, `hookify-rules`; instincts stored as versioned YAML (homunculus pattern).
- Hooks: extend `governance-ledger` to record learning events; a `learning-promotion-gate` that
  blocks any instinct promotion lacking human approval + (for compliance items) a doc citation.

---

## 15. Phased build plan (with test gates)

| Phase | Deliverable | Exit gate |
|---|---|---|
| **0 — Foundations** | PoC inference box (RTX 5090 + Qwen3-Coder-30B-A3B/Ollama); Vault; agent service accounts (unique, non-interactive, least-priv); trust-boundary doc; engage your **CPSA/QSA** early | Local lane egress-blocked & verified; agent has read-only creds + branch/MR write only |
| **1 — Capture current state + knowledge base** | infra-auditor + read-only MCP discover & **document** corporate inventory/playbooks/pipelines/Tentacles; **stand up the on-prem knowledge base, ingest your docs (sensitivity-classified), and have knowledge-curator propose cited answers to the §17 questions** (§14) | A published map of "what exists now" + cited draft answers to the open scoping questions, reviewed by you |
| **2 — Guardrails as code** | hooks: sensitivity-router, PAN/secret egress filter, infra-gateguard, governance-ledger, block-no-verify; `paths:` rules; Prompt Defense Baseline | A CHD test string is provably blocked from the cloud lane; gate can't be bypassed |
| **3 — CI quality gates** | CI components (`ansible-lint`,`-check`,`molecule`,`-deploy`); lint→syntax→check→molecule per MR | A bad-playbook MR is blocked; idempotence gate green |
| **4 — Authoring + Dev deploy** | iac-author + reviewers; agent opens MRs; CI deploys **Dev** behind the gate | A real change: agent MR → review → merge → Dev deploy, fully logged |
| **5 — Promotion + Octopus** | dev→test→staging→prod of one artifact; GitLab approvals + Octopus lifecycle/manual-intervention; prod Octopus instance | Same artifact across 4 envs; prod human-gated; full audit chain |
| **6 — Drift, audit & docs loop** | scheduled drift + nightly compliance scan (Batch API); change-scribe auto-docs; SIEM + retention | Drift alert demonstrated; auditor-style report from the three streams |
| **7 — In-HSA deployment (heaviest)** | air-gapped in-zone box + in-zone GitLab/Octopus + perso-* subagents (LOCAL only); authoring/advisory; dual-control promotion gate | **CPSA-L sign-off** that the agent's design + auditable HSA exclusion are acceptable, *before* go-live |
| **8 — Governed self-improvement** | the full observe→propose→verify→promote→rollback loop (§14): background-LOCAL observation, instinct ledger as versioned YAML, `learning-promotion-gate` requiring human approval + doc citation, zone-sandboxed | Only after 0-7 stable; every promotion human-approved, audited, reversible |

Phase 7 is intentionally last and gated behind your **CPSA assessor**, because anything touching the
HSA must be defensible to the brands' on-site assessment (research/pci-card-production.md §1, §7.6).

---

## 16. Risks & prior-art failure modes designed against

(research/ansible-iac-gitops.md §6; research/hybrid §4) — each mitigated structurally, not by trust:
hardcoded secrets → agent never sees them + gitleaks; dropped OS conditionals → repo structure +
ansible-lint; `command`/`shell` → lint + Molecule idempotence; non-idempotent/hallucinated changes →
`--check --diff` review boundary; prompt injection via MCP/host/log content (incl. **indirect**
injection — the infra agent's real threat) → Prompt Defense Baseline, read-mostly MCP scopes, sandbox
the local agent, treat all fetched content as untrusted (OWASP LLM01); context exhaustion → small
MR-scoped changes + pressure hooks.

---

## 17. Open inputs needed from you

Most of these don't need a cold answer from you: once you supply internal documentation, the
**knowledge-curator** (§14) ingests it and proposes **cited** answers for you to confirm. The list is
what the loop will work to resolve, not homework.

1. **CPSA/QSA engagement** — who assesses you (which brands), and the exact split of which corporate
   systems fall under PCI DSS vs PCI CP (brand/activity-dependent — research/pci-card-production.md §1).
2. **HSA network reality** — is the perso/DP network already air-gapped per CP §5.2(e)? What ingress
   path exists for issuer data (one-way / diode?), and what, if anything, is permitted out?
3. **HSM/key vendor & ceremony process** — to confirm the agent's exclusion boundary precisely (it
   never participates, but we document where it stops).
4. **GitLab tier** — protected environments/deployment approvals are **Premium+**; on CE we substitute
   protected-branch + manual-gate + Octopus manual-intervention.
5. **Procurement appetite** — start PoC on one RTX 5090 box; budget/timeline for the L40S production
   box and the in-HSA box (Phase 5/7)?
6. **Where the agent lives** — its own ops repo, or contributed as an ECC-style package?

---

*Cross-references: §-cited research in `docs/infra-agent/research/`; ECC mechanics in
`docs/deep-dive/`. This is the synthesis to review and iterate before any build.*
