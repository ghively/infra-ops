# PCI DSS v4.0 / v4.0.1 for an Ansible + Self-Hosted GitLab CI/CD + Octopus Deploy Pipeline Managed by an AI Agent

**Purpose.** Justify the compliance architecture of an AI agent that manages a DevOps pipeline (Ansible for configuration management, self-hosted GitLab for source + CI/CD, Octopus Deploy for release orchestration) across a mixed Windows/Linux estate. Every claim below is cited. Where a claim could not be confirmed against a primary source, it is flagged **[UNCERTAIN]** with what was found.

**Sourcing note.** The authoritative documents are published by the PCI Security Standards Council (PCI SSC) in its Document Library. The full PCI DSS v4.0.1 standard and the official Scoping & Segmentation guidance are distributed as PDFs that the research tooling could not parse to text (they returned binary). Exact requirement *wording* below is therefore quoted from high-quality secondary sources that reproduce the requirement language (PCI SSC blog posts, QSA firms such as Schellman, vendor compliance docs, and the AWS PCI DSS v4.0 whitepaper). Primary PCI SSC URLs are cited wherever a primary page was reachable. **Before treating any exact requirement number/text below as audit-grade, verify against the PCI DSS v4.0.1 PDF in the PCI SSC Document Library** (https://www.pcisecuritystandards.org/document_library/).

---

## 0. Version context: v4.0 → v4.0.1 and the future-dated wall

- PCI DSS v4.0 was published March 2022; **v4.0 was retired 31 December 2024** and **v4.0.1** is the current version. v4.0.1 is a *limited revision*: "corrections to formatting and typographical errors" and clarifications, with **no additional or deleted requirements**. ([PCI SSC blog: Just Published PCI DSS v4.0.1](https://blog.pcisecuritystandards.org/just-published-pci-dss-v4-0-1))
- v4.0 introduced **64 new requirements; 51 are "future-dated"** and became **mandatory on 31 March 2025** (best practice until then). After that date they are assessed in every assessment. ([PCI SSC blog: Now is the Time to Adopt the Future-Dated Requirements](https://blog.pcisecuritystandards.org/now-is-the-time-for-organizations-to-adopt-the-future-dated-requirements-of-pci-dss-v4-x); [GuidePoint Security: Major Future-Dated Requirements](https://www.guidepointsecurity.com/blog/pci-dss-4-0-major-future-dated-requirements/))
- **As of today (2026-06-03), all future-dated requirements are in force.** The agent and pipeline must be designed against the *full* v4.0.1 control set, not the transitional subset.

Clarifications in v4.0.1 most relevant here ([PCI SSC blog: v4.0.1](https://blog.pcisecuritystandards.org/just-published-pci-dss-v4-0-1)):
- **Req 6:** the 30-day patch window applies **only to critical vulnerabilities** (v3.2.1 language reinstated).
- **Req 8:** MFA "does not apply to accounts only authenticated with phishing-resistant authentication factors" — relevant if the agent or operators use phishing-resistant auth.
- **Req 12 / Customized Approach:** the customized-approach templates were moved out of Appendix E to online resources; new definitions added (e.g., "Phishing Resistant Authentication").

---

## 1. Scoping & Segmentation (Req 1) — keep the pipeline and the agent OUTSIDE the CDE

### What the standard says
- PCI DSS applies to all system components **included in or connected to** the Cardholder Data Environment (CDE). The CDE comprises the people, processes, and technologies that **store, process, or transmit cardholder data (CHD) or sensitive authentication data (SAD)**, plus any component that can **impact the security** of that data. ([PCI SSC Guidance for PCI DSS Scoping and Network Segmentation (PDF)](https://listings.pcisecuritystandards.org/documents/Guidance-PCI-DSS-Scoping-and-Segmentation_v1.pdf); [PCI SSC blog: Scoping & Segmentation for Modern Network Architectures](https://blog.pcisecuritystandards.org/new-information-supplement-pci-dss-scoping-and-segmentation-guidance-for-modern-network-architectures))
- Three scoping categories: **CDE / in-scope** systems; **connected-to or security-impacting** systems (on a separate network but with access to, or that can affect the security of, the CDE — both are *in scope*); and **out-of-scope** systems. ([VGS: AI and PCI Compliance](https://www.verygoodsecurity.com/blog/posts/ai-and-pci-compliance-what-every-company-needs-to-know-in-2026) summarizing scope; [PCI SSC Scoping & Segmentation PDF](https://listings.pcisecuritystandards.org/documents/Guidance-PCI-DSS-Scoping-and-Segmentation_v1.pdf))
- "The intent of segmentation is to **prevent out-of-scope systems from being able to communicate with systems in the CDE** or impact the security of the CDE." Segmentation is *optional* but is the primary method to **reduce scope**. The mere existence of separate VLANs/subnets is **not** segmentation — separation must be enforced by **purpose-built controls**. ([PCI SSC Scoping & Segmentation PDF](https://listings.pcisecuritystandards.org/documents/Guidance-PCI-DSS-Scoping-and-Segmentation_v1.pdf))
- If segmentation is used to reduce scope, **Req 11.4.5** mandates testing the segmentation controls **at least every 6 months (service providers)** / **annually (merchants)** and after changes. ([VistaInfosec: Req 11 changes](https://vistainfosec.com/blog/pci-dss-requirement-11-changes-from-v3-2-1-to-v4-0-explained/))

### Design implications for the pipeline + agent
- **Why CI/CD and the agent should sit OUTSIDE the CDE:** GitLab, Octopus, the Ansible control node, and the AI agent are management/administrative tooling. If they can *configure*, *deploy to*, or *reach* CDE hosts, they are at minimum **security-impacting / connected-to** systems and pull themselves into scope. The architectural goal is to make them **out-of-scope** by:
  - placing them in a separate management network/zone with **deny-by-default** firewalling to the CDE;
  - brokering all CDE-touching actions through a **jump/bastion or deployment relay** (e.g., Octopus Tentacle/worker, an Ansible execution node, a hardened bastion) that *is* in scope, so the in-scope surface is small and well-defined rather than "the whole CI/CD platform." Octopus's Tentacle/worker model and environment-scoped permissions support exactly this isolation pattern. ([Octopus: PCI Compliance and Octopus Deploy](https://octopus.com/docs/security/pci-compliance-and-octopus-deploy))
- **If they are in-scope** (cannot be fully isolated — common for config-management tools that must push to CDE hosts), then *the agent, GitLab runners, Octopus server/workers, and the Ansible control node inherit the full applicable PCI DSS control set* (hardening Req 2, patching Req 6, access Req 7/8, logging Req 10, etc.). This is the expensive outcome; the architecture should minimize the in-scope footprint to the deployment relay and treat the orchestration brains as out-of-scope, connected only through that relay.
- **Mixed Windows/Linux estate:** scope is per-system-component, so Windows domain controllers, jump hosts, and Linux config targets that are in the CDE each carry the controls. Segmentation testing (11.4.5) must cover every segmentation method between the management zone and the CDE.
- **A self-hosted GitLab is an asset here:** keeping source, CI, and audit data on-prem/self-hosted avoids exporting CHD-adjacent build artifacts and logs to an external SaaS, which would otherwise expand third-party scope (Req 12.8).

---

## 2. Secure Development & Change Control (Req 6) — versioned, reviewed IaC *is* the evidence

### What the standard says
- **6.5 / 6.4 change control:** change-management procedures must apply to **all changes to all system components** in production — additions, removals, or modifications — with documented reason/justification, and changes must be reviewed and approved. ([RSI Security: PCI DSS Req 6](https://blog.rsisecurity.com/pci-dss-requirement-6-controls-for-secure-applications-and-systems/); [KirkpatrickPrice: Req 6.4 change control](https://kirkpatrickprice.com/video/pci-requirement-6-4-follow-change-control-processes-procedures-changes-system-components/))
- **6.5.3 (future-dated):** "pre-production environments are separated from production environments and the separation is enforced with access controls." **6.5.4 (future-dated):** "roles and functions are separated between production and pre-production environments to provide accountability such that only reviewed and approved changes are deployed." ([PCI DSS Guide: change control](https://pcidssguide.com/change-control-management-for-pci-dss/); [VistaInfosec: Req 6 changes](https://vistainfosec.com/blog/pci-dss-requirement-6-changes-from-v3-2-1-to-v4-0-explained/))
- **6.3.2 (future-dated, mandatory since 31 Mar 2025):** maintain an **inventory of bespoke and custom software, including third-party/open-source components**, to support vulnerability and patch management. ([Cybeats: PCI 6.3.2 & 11.3.1.1](https://www.cybeats.com/blog/pci-dss-4-0-sboms-a-2025-readiness-guide); [GuidePoint](https://www.guidepointsecurity.com/blog/pci-dss-4-0-major-future-dated-requirements/); [Halock: software catalog mandate](https://www.halock.com/what-is-the-new-pci-dss-v4-0-1-software-catalog-mandate/))
- **6.4.3 / 11.6.1 (payment-page scripts):** inventory + authorize every script in the customer browser and detect tampering of payment-page HTTP headers/content. ([Feroot: PCI 4.0 client-side](https://www.feroot.com/education-center/pci-dss-4-0-and-client-side-security-changes-impacts/); [GuidePoint](https://www.guidepointsecurity.com/blog/pci-dss-4-0-major-future-dated-requirements/)) (Mostly relevant only if the estate serves e-commerce payment pages.)
- **6.4.3 (production data):** production PANs must not be used for dev/test. ([PCI DSS Guide: Req 6](https://pcidssguide.com/pci-dss-requirement-6/))

### Design implications
- **Versioned, peer-reviewed IaC produces native change-control evidence.** Git history + GitLab **Merge Requests** with required reviewers, **CODEOWNERS**-enforced reviewers, and **protected branches** map directly onto PCI change-control expectations: peer review (≈6.5.3), separation of duties / independent checkpoint (≈6.5.4), and an enforced, non-circumventable approval gate (≈6.4). ([Schellman: branch protection in change management](https://www.schellman.com/blog/pci-compliance/how-to-use-branch-protection-in-change-management); [GitLab Docs: merge request approvals](https://docs.gitlab.com/user/project/merge_requests/approvals/)) **Caveat:** the QSA source explicitly calls branch protection a *foundation*, not by itself sufficient — the QSA still needs the documented change-management *process* wrapped around it. ([Schellman](https://www.schellman.com/blog/pci-compliance/how-to-use-branch-protection-in-change-management))
- **dev/test/prod separation (6.5.3/6.5.4)** maps to **Octopus environments/lifecycles** with environment-scoped RBAC, and to separate GitLab environments/runners. The author of an Ansible change ≠ the MR approver ≠ the person who triggers the prod Octopus deployment (see §3, §8).
- **6.3.2 inventory** = the agent must keep a machine-readable **SBOM/dependency inventory** for its own bespoke automation (Ansible roles/collections, custom scripts, Octopus step templates) *and* the third-party components they pull. This is naturally generated from `requirements.yml`, lockfiles, and SBOM tooling in CI.
- The agent should **never act as an unreviewed change path**: any change it authors must flow through the same MR → review → approval → Octopus deployment pipeline as a human's. The agent is a *proposer*, gated by human/independent approval, never a self-approving deployer.

---

## 3. Least Privilege & Access (Req 7 / Req 8)

### What the standard says
- **7.2.1–7.2.3:** access-control system on a **need-to-know**, **least-privilege**, **deny-all-by-default** basis, by role. ([PCI DSS Guide: Req 7](https://pcidssguide.com/pci-dss-requirement-7/); [VistaInfosec: Req 7 changes](https://vistainfosec.com/blog/pci-dss-requirement-7-changes-from-v3-2-1-to-v4-0-explained/))
- **7.2.4 / 7.2.5 / 7.2.5.1:** review **user accounts** at least every 6 months; review **application/system (service) accounts** and their privileges at a frequency set by a **targeted risk analysis (TRA)**; confirm accounts retain only **least privileges** needed. ([GuidePoint](https://www.guidepointsecurity.com/blog/pci-dss-4-0-major-future-dated-requirements/); [Schellman: service-account requirements](https://www.schellman.com/blog/pci-compliance/pci-dss-service-account-requirements))
- **8.2.x:** **unique IDs** for every user; shared/generic accounts restricted. **8.3.6:** minimum password length **12 chars** (or 8 if a system cannot support 12). **8.4.2 / 8.5.1:** **MFA for ALL access into the CDE** (not just admins/remote). ([GuidePoint](https://www.guidepointsecurity.com/blog/pci-dss-4-0-major-future-dated-requirements/); [VistaInfosec: Req 8 changes](https://vistainfosec.com/blog/pci-dss-requirement-8-changes-from-v3-2-1-to-v4-0-explained/))
- **Service/system accounts (8.6.1–8.6.3):** **8.6.1** — if an app/system account can be used for **interactive login**, interactive use is prevented unless an exceptional circumstance, which requires management approval, documentation, and individual accountability. **8.6.2** — passwords/passphrases for accounts usable for interactive login are **not hard-coded** in scripts, config/property files, or custom source. **8.6.3** — service-account credentials are **changed periodically** at a TRA-defined frequency with appropriate complexity. ([Schellman: service-account requirements](https://www.schellman.com/blog/pci-compliance/pci-dss-service-account-requirements); [GuidePoint](https://www.guidepointsecurity.com/blog/pci-dss-4-0-major-future-dated-requirements/))

### Design implications
- **The AI agent runs as a uniquely-identified, least-privilege service account**, not a shared/human identity, with privileges scoped only to what each task needs (write to a GitLab branch, open an MR, trigger a *non-prod* Octopus deploy). Distinct accounts/roles per pipeline stage; **deny-by-default**.
- **No hardcoded secrets (8.6.2)** — the agent's and runners' credentials are fetched at runtime from a secrets manager (see §8), never embedded in Ansible vars, GitLab CI YAML, Octopus variables-in-plaintext, or the agent's prompts/config.
- **Separation of duties:** the agent (or a developer) **writes** the change; a **different** identity **approves** the MR; a **third** controlled gate (human approver or Octopus manual-intervention step) **promotes to prod**. The agent must be structurally incapable of approving its own change or deploying to prod unilaterally. ([Schellman: branch protection](https://www.schellman.com/blog/pci-compliance/how-to-use-branch-protection-in-change-management); [Octopus: PCI](https://octopus.com/docs/security/pci-compliance-and-octopus-deploy))
- **Periodic access review (7.2.5/7.2.5.1):** the agent's own privileges and those of all pipeline service accounts must be reviewed on a TRA-defined cadence — build a recurring attestation into the pipeline.
- **MFA (8.4.2)** applies to any human (or interactive agent) access *into the CDE*; if the agent must ever reach CDE hosts interactively, that path needs MFA or phishing-resistant auth — strengthening the case for keeping the agent out of the CDE and acting only through a gated relay.

---

## 4. Protect Stored & Transmitted CHD (Req 3 / Req 4) — the LLM egress problem

### What the standard says
- **Req 3:** PAN must be rendered **unreadable wherever stored** — via one-way strong hash of the entire PAN, truncation (≤ first 6 + last 4), **tokenization**, or strong cryptography with key management. **SAD must never be stored after authorization**, even encrypted (no full track data, no CVV/CVC). Logs are explicitly called out as a place PAN must not appear in the clear. ([HeroDevs: Req 3](https://www.herodevs.com/blog-posts/pci-dss-4-0-requirement-3-how-to-protect-stored-account-data); [PCI SSC Data Storage Do's and Don'ts (PDF)](https://listings.pcisecuritystandards.org/pdfs/pci_fs_data_storage.pdf))
- **3.5.1.2 (future-dated):** disk/partition-level encryption alone **no longer qualifies** as rendering PAN unreadable except on removable media. ([GuidePoint](https://www.guidepointsecurity.com/blog/pci-dss-4-0-major-future-dated-requirements/))
- **Req 4 (4.2.1 / 4.2.1.1):** **strong cryptography (TLS 1.2+)** for PAN transmitted over open/public networks; certificates must be **valid, not expired/revoked**, with an inventory of trusted keys/certs. ([Prime Factors: PCI 4.0 in transit](https://www.primefactors.com/resources/blog/payments/complying-with-pci-dss-4-0/); [GuidePoint](https://www.guidepointsecurity.com/blog/pci-dss-4-0-major-future-dated-requirements/))

### LLM / AI egress — the critical design constraint
- **An AI system is in PCI scope the moment it can store, process, transmit, or impact the security of CHD** — including indirect access via connected logs/DBs/APIs, *especially if it can change CDE systems*. ([VGS: AI and PCI Compliance](https://www.verygoodsecurity.com/blog/posts/ai-and-pci-compliance-what-every-company-needs-to-know-in-2026)) An infrastructure-managing agent that can change CDE hosts is therefore already a **security-impacting** system (§1).
- **Sending CHD into a prompt to a third-party/cloud LLM exports that data to a third party.** VGS frames the risk: "Data leakage through prompts and outputs — if sensitive data is included in prompts, it may be exposed in responses or logs," and third-party AI vendors processing prompts/outputs/logs **become part of the broader compliance picture and expand third-party risk**. The safest posture: "**prevent AI systems from touching raw card data at all. Use tokenization to replace sensitive data before it reaches any AI system.**" ([VGS](https://www.verygoodsecurity.com/blog/posts/ai-and-pci-compliance-what-every-company-needs-to-know-in-2026))
- Practically, any CHD egressing to an external cloud LLM is at minimum an **uncontrolled disclosure / scope-expansion event** and brings the LLM provider into scope as a third party (Req 12.8). **[UNCERTAIN]** No primary PCI SSC document was located that *names* LLM prompt egress as a defined "disclosure event"; this conclusion is derived from Req 3/4 + scope rules + the VGS analysis, not from PCI SSC text. Verify with your QSA.

### Design implications
- **Hard architectural boundary: CHD/SAD must never enter the agent's context, prompts, tool outputs, or any model call** — local or remote. Treat logs, command output, file contents, DB rows, and error traces the agent ingests as potential PAN carriers and **redact/tokenize/de-identify at the source** before they reach the model.
- Use **tokenization/de-identification** so the agent operates only on **non-sensitive tokens**, never raw card data. ([VGS](https://www.verygoodsecurity.com/blog/posts/ai-and-pci-compliance-what-every-company-needs-to-know-in-2026); [Google Cloud: tokenizing CHD for PCI](https://docs.cloud.google.com/architecture/tokenizing-sensitive-cardholder-data-for-pci-dss); [Bluefin: tokenization & scope](https://www.bluefin.com/bluefin-news/tokenization-cardholder-data-pci-compliance/))
- Prefer **self-hosted / in-VPC inference** for any path that could conceivably see CHD, to avoid third-party egress entirely; pair with PAN-detection scanning on agent inputs/outputs (DLP-style egress filter).
- **TLS everywhere (Req 4):** agent↔GitLab, agent↔Octopus, runner↔target, and secrets-manager traffic must use TLS 1.2+ with valid certs; maintain the cert/key inventory (4.2.1.1).
- **No PAN in logs (Req 3 + Req 10):** the agent's own audit/change ledger, GitLab job logs, and Octopus task logs must be PAN-free; add masking on any captured stdout/stderr.

---

## 5. Logging, Audit Trails & Retention (Req 10)

### What the standard says
- **10.2 — events to log** (automated audit trail on all in-scope components, sufficient to reconstruct events): all **individual user access to CHD**; all actions by **root/admin/privileged** users; access to **audit trails**; **invalid logical access attempts**; **use of and changes to identification/authentication mechanisms** (incl. **new accounts, privilege elevation, changes to admin accounts** — 10.2.1.5); and **start/stop/pause of the audit logs**. ([HeroDevs: Req 10](https://www.herodevs.com/blog-posts/pci-dss-4-0-requirement-10-how-to-log-and-monitor-all-access-to-system-components-and-cardholder-data); [PCI DSS Guide: Req 10](https://pcidssguide.com/pci-dss-requirement-10/))
- **Per-event detail (10.2.2):** user ID, event type, date/time, success/failure, origin, and identity/name of affected data/component/resource. ([PCI DSS Guide: Req 10](https://pcidssguide.com/pci-dss-requirement-10/))
- **10.3 — protect logs / immutability:** read access limited to those with a job need (10.3.1); **file-integrity-monitoring / change-detection on audit logs so existing log data cannot be altered without an alert** (10.3.4). ([HeroDevs: Req 10](https://www.herodevs.com/blog-posts/pci-dss-4-0-requirement-10-how-to-log-and-monitor-all-access-to-system-components-and-cardholder-data))
- **10.4 — review:** daily review of critical logs, with **automated mechanisms** for the daily review (**10.4.1.1**, future-dated). ([VistaInfosec: Req 10](https://vistainfosec.com/blog/pci-dss-requirement-10-changes-from-v3-2-1-to-v4-0-explained/))
- **10.6 — time synchronization:** all systems use consistent, protected time; time data and time-config changes are access-restricted. ([PCI DSS Guide: Req 10](https://pcidssguide.com/pci-dss-requirement-10/))
- **10.7 — failures of critical security controls** (incl. logging/FIM) are detected, alerted, and responded to promptly. ([PCI DSS Guide: Req 10](https://pcidssguide.com/pci-dss-requirement-10/))
- **10.5.1 — retention:** **at least 12 months**, with **at least the most recent 3 months immediately available** for analysis. ([PCI DSS Guide: log retention](https://pcidssguide.com/what-are-the-pci-dss-log-retention-requirements/))

### Design implications
- **Three audit streams compose the evidence:** **GitLab audit events** (who changed what in source/CI, MR approvals), **Octopus audit log** (who deployed what, to which environment, with which approvals), and the **agent's own append-only change ledger** (every action the agent proposed/took, with actor=agent-service-account, timestamp, target, success/failure). GitLab provides an advanced audit-events system and a native **PCI DSS v4.0.1 compliance framework** (`pci_dss_v4-0-1.json`) plus compliance-violation reporting. ([GitLab Docs: compliance features](https://docs.gitlab.com/administration/compliance/compliance_features/); [GitLab Docs: compliance standards](https://docs.gitlab.com/user/compliance/compliance_frameworks/compliance_standards/)) Octopus "carefully audits every activity." ([Octopus: PCI](https://octopus.com/docs/security/pci-compliance-and-octopus-deploy))
- **ARA/SIEM forwarding:** ship all three streams to a central, **write-once / tamper-evident** store (SIEM or log archive with FIM, satisfying 10.3.4) outside the control of the agent and the pipeline operators, so logs cannot be retroactively edited by the same identity that generated them.
- **Immutability of the agent's ledger:** the agent must not be able to delete or rewrite its own audit records (10.3.4) — append-only, forwarded off-box, integrity-monitored.
- **Time sync (10.6):** all of agent host, GitLab, Octopus, runners, and Windows/Linux targets must sync to a common, access-restricted NTP source so cross-system correlation is valid.
- **Retention (10.5.1):** 12-month retention, 3 months hot. Build this into the central log store, not just local rotation.
- **Logged content must be PAN-free** (cross-reference §4 / Req 3).

---

## 6. Testing & Monitoring (Req 11) and Policy/Governance (Req 12)

### What the standard says
- **Req 11:** internal + external **vulnerability scans** and **penetration testing** (11.4) at least annually and after significant change; **11.3.1.2** internal scans must be **authenticated** (future-dated); **11.4.5** test **segmentation controls** every 6 months (service providers)/annually (merchants) when used to reduce scope; **11.5/11.6** change/tamper detection (incl. payment pages, 11.6.1). ([VistaInfosec: Req 11](https://vistainfosec.com/blog/pci-dss-requirement-11-changes-from-v3-2-1-to-v4-0-explained/); [GuidePoint](https://www.guidepointsecurity.com/blog/pci-dss-4-0-major-future-dated-requirements/))
- **Req 12 governance:** maintain security policy, **annual scope confirmation (12.5.2 / 12.5.2.1)**, third-party service-provider management (12.8) and TPSP responsibility matrices, incident response (incl. **12.10.7** — handle PAN found outside expected locations), and **targeted risk analyses (12.3.1)** for every "periodic"/risk-based control plus **12.3.2** TRA for each customized-approach control. ([CampusGuard: TRA explained](https://campusguard.com/post/pci-dss-v4-0-targeted-risk-analysis-explained/); [PCI SSC blog: TRA guidance](https://blog.pcisecuritystandards.org/just-published-pci-dss-v4-x-targeted-risk-analysis-guidance); [GuidePoint](https://www.guidepointsecurity.com/blog/pci-dss-4-0-major-future-dated-requirements/))

### The v4.0 "customized approach"
- v4.0 added the **customized approach**: instead of the prescriptive *defined* control, an entity may meet a requirement's **Customized Approach Objective** with alternate controls/new technology, documented in a **controls matrix (Appendix E)** and justified by a **targeted risk analysis (12.3.2)**. It is intended only for **risk-mature organizations** with robust risk management, and is "not a workaround to avoid meeting requirements." ([PCI SSC blog: Is the Customized Approach Right for You?](https://blog.pcisecuritystandards.org/pci-dss-v4-0-is-the-customized-approach-right-for-your-organization))

### Design implications
- **The agent's design choices map to TRAs (12.3.1).** Any "periodic" frequency the architecture picks — service-account credential rotation (8.6.3), service-account review (7.2.5.1), log-review automation — must be backed by a documented TRA. Bake TRA artifacts into the compliance docs the agent maintains.
- **The agent itself is a candidate customized-approach control** (e.g., "AI-driven continuous configuration enforcement" as an alternate means to a hardening/monitoring objective). If you go this route, you owe a controls matrix + TRA showing it provides **at least equivalent protection** to the defined requirement — a heavy documentation burden. ([PCI SSC: Customized Approach](https://blog.pcisecuritystandards.org/pci-dss-v4-0-is-the-customized-approach-right-for-your-organization))
- **Segmentation testing (11.4.5)** must be scheduled and evidenced for the management-zone↔CDE boundary that keeps the pipeline out of scope (§1). The agent can *orchestrate* this testing but must not be the *only* validator (independence).
- **Scope confirmation (12.5.2):** annual re-confirmation that the agent/pipeline are still out-of-scope (or correctly in-scope) as the estate evolves.
- **TPSP (12.8):** any external service the agent uses (cloud LLM, SaaS, hosted runner) must be in the third-party inventory with a responsibility matrix — another reason to prefer self-hosted GitLab and in-VPC inference.

---

## 7. What changed in v4.0 / v4.0.1 — the DevOps/automation-relevant future-dated requirements

All effective **31 Mar 2025** (now mandatory). Most relevant to scripts/automation/DevOps:

| Req | Change | Pipeline/agent impact |
|---|---|---|
| **6.3.2** | Inventory of bespoke/custom software + 3rd-party components | Agent maintains SBOM/dependency inventory for Ansible roles, scripts, Octopus templates ([Cybeats](https://www.cybeats.com/blog/pci-dss-4-0-sboms-a-2025-readiness-guide)) |
| **6.4.3 / 11.6.1** | Authorize & integrity-check payment-page scripts; tamper detection | Only if estate serves payment pages ([Feroot](https://www.feroot.com/education-center/pci-dss-4-0-and-client-side-security-changes-impacts/)) |
| **6.5.3 / 6.5.4** | Pre-prod separated from prod; roles/functions separated | Octopus environments + GitLab branch protection / RBAC ([PCI DSS Guide](https://pcidssguide.com/change-control-management-for-pci-dss/)) |
| **7.2.4 / 7.2.5 / 7.2.5.1** | Review user (6-mo) & service accounts (TRA-based); least privilege | Recurring access attestation for agent + pipeline service accounts ([GuidePoint](https://www.guidepointsecurity.com/blog/pci-dss-4-0-major-future-dated-requirements/)) |
| **8.3.6** | 12-char minimum passwords | All accounts incl. service accounts ([GuidePoint](https://www.guidepointsecurity.com/blog/pci-dss-4-0-major-future-dated-requirements/)) |
| **8.4.2** | MFA for ALL access into the CDE | Strengthens case to keep agent out of CDE ([GuidePoint](https://www.guidepointsecurity.com/blog/pci-dss-4-0-major-future-dated-requirements/)) |
| **8.6.1** | Restrict interactive login for service accounts | Agent's account is non-interactive by design ([Schellman](https://www.schellman.com/blog/pci-compliance/pci-dss-service-account-requirements)) |
| **8.6.2** | No hard-coded passwords in scripts/config/source | Secrets from a vault at runtime ([Schellman](https://www.schellman.com/blog/pci-compliance/pci-dss-service-account-requirements)) |
| **8.6.3** | Rotate service-account credentials (TRA frequency) | Dynamic/short-lived secrets ([Schellman](https://www.schellman.com/blog/pci-compliance/pci-dss-service-account-requirements)) |
| **10.4.1.1** | Automated daily log review | Forward to SIEM with automated analytics ([VistaInfosec](https://vistainfosec.com/blog/pci-dss-requirement-10-changes-from-v3-2-1-to-v4-0-explained/)) |
| **11.3.1.2 / 11.4.x / 11.4.5** | Authenticated internal scans; pen-tests; segmentation testing | Agent orchestrates but isn't sole validator ([VistaInfosec](https://vistainfosec.com/blog/pci-dss-requirement-11-changes-from-v3-2-1-to-v4-0-explained/)) |
| **12.3.1 / 12.3.2** | TRAs for periodic controls / customized approach | Documented TRAs for every chosen frequency ([CampusGuard](https://campusguard.com/post/pci-dss-v4-0-targeted-risk-analysis-explained/)) |
| **12.5.2 / 12.5.2.1** | Annual scope confirmation | Re-confirm agent/pipeline scope yearly ([PCI SSC](https://blog.pcisecuritystandards.org/now-is-the-time-for-organizations-to-adopt-the-future-dated-requirements-of-pci-dss-v4-x)) |
| **12.10.7** | IR plan for PAN found in unexpected locations | Plan for the case where the agent surfaces PAN in logs/output ([GuidePoint](https://www.guidepointsecurity.com/blog/pci-dss-4-0-major-future-dated-requirements/)) |

v4.0.1 clarifications relevant here: 30-day patch window = critical vulns only; MFA exception for phishing-resistant factors; customized-approach templates moved online. ([PCI SSC blog: v4.0.1](https://blog.pcisecuritystandards.org/just-published-pci-dss-v4-0-1))

---

## 8. Separation of Duties in CI/CD & PCI-accepted secrets management

### Separation of duties (SoD) in the pipeline
- **The committer/author ≠ the approver ≠ the prod deployer.** GitLab enforces SoD natively: an **MR creator cannot approve their own MR**, and required approvals + CODEOWNERS + protected branches create an **independent checkpoint** so that "collusion would be required to sneak malicious code into production" (≈6.5.4). ([GitLab Docs: merge request approvals](https://docs.gitlab.com/user/project/merge_requests/approvals/); [Schellman: branch protection](https://www.schellman.com/blog/pci-compliance/how-to-use-branch-protection-in-change-management))
- **Octopus** adds environment-scoped **RBAC**, **manual-intervention/approval gates**, and ITSM (ServiceNow/Jira) integration that can **block deployments until a change is approved** — supporting SoD and audit-friendly regulated change management (≈6.5.3/6.5.4). ([Octopus: GRC](https://octopus.com/devops/grc/); [Octopus: financial-industry compliance](https://octopus.com/blog/financial-industry-compliance); [Octopus: PCI](https://octopus.com/docs/security/pci-compliance-and-octopus-deploy))
- **Agent placement in SoD:** the agent occupies the **author/proposer** role only. It opens MRs and can deploy to **non-prod**, but **prod promotion requires a separate human/independent approval gate** (Octopus manual intervention or a protected GitLab environment). The agent must not hold both authoring and prod-approval privileges on the same change.

### Secrets management accepted under PCI
- PCI doesn't endorse a specific product, but a centralized secrets manager directly satisfies **8.6.2** (no hard-coded secrets), **8.6.3** (rotation), **Req 3** (key management), and **Req 10** (audit of secret access). **HashiCorp Vault** is the canonical example: it "enables applications to retrieve secrets securely at runtime, **eliminating the need to hard-code credentials**," can "**generate credentials on demand and automatically rotate them**" (dynamic, short-lived secrets), "manages keys to protect data at rest and in transit," and "records all access in **tamper-evident audit logs**." Vault Radar can scan repos to **detect hard-coded secrets** before they ship. ([HashiCorp: PCI DSS 4 compliance with Vault & Vault Radar](https://www.hashicorp.com/en/blog/pci-dss-4-compliance-with-hashicorp-vault-and-vault-radar); [HashiCorp: achieving PCI compliance with Vault](https://www.hashicorp.com/en/blog/achieving-pci-compliance-leveraging-hashicorp-vault-to-protect-payment-data))
- **Design implications:** agent, GitLab CI, runners, Octopus, and Ansible all pull credentials from the vault at runtime via short-lived/dynamic secrets; nothing sensitive lives in repo, CI YAML, Ansible vars, or Octopus plaintext variables. Vault audit logs feed the central log store (§5). Ansible Vault can encrypt at-rest vars but is **not** a substitute for runtime secret brokering + rotation — prefer dynamic secrets for credentials the agent uses against CDE-adjacent systems.

---

## Requirement → Design-Implication Summary Table

| PCI DSS area | Requirement(s) | Concrete pipeline/agent design implication |
|---|---|---|
| Scoping/segmentation | 1.x, 11.4.5, 12.5.2 | Put GitLab/Octopus/Ansible-controller/agent in an isolated management zone; reach CDE only via a small, in-scope deployment relay; deny-by-default; test segmentation ≥ every 6 mo; annual scope re-confirmation |
| Secure dev & change control | 6.3.2, 6.4, 6.5.3, 6.5.4 | All change as reviewed/approved IaC via GitLab MR + CODEOWNERS + protected branches; SBOM inventory; dev/test/prod separated in Octopus; agent = proposer, never self-approver |
| Least privilege & access | 7.2.x, 8.2.x, 8.3.6, 8.4.2, 8.6.1–8.6.3 | Agent = unique, non-interactive, least-privilege service account; no hardcoded secrets; rotated creds; MFA on any CDE access; periodic access reviews |
| Protect CHD | 3.x, 4.2.1, 3.5.1.2 | **CHD/SAD must never enter the model context**; tokenize/de-identify before the agent sees data; prefer self-hosted/in-VPC inference; TLS 1.2+ everywhere; PAN-free logs |
| Logging & retention | 10.2, 10.3.4, 10.4.1.1, 10.6, 10.7, 10.5.1 | Compose GitLab + Octopus + agent append-only ledger → tamper-evident SIEM; FIM on logs; common NTP; 12-mo/3-mo-hot retention; automated daily review |
| Testing & governance | 11.4.x, 12.3.1, 12.3.2, 12.8, 12.10.7 | Agent orchestrates (not sole validator) scans/pen-tests/segmentation tests; TRAs back every chosen frequency; TPSP inventory for any external service; IR plan for stray PAN |
| v4.0.1 deltas | future-dated set | All future-dated controls in force now; design to the full v4.0.1 set |
| SoD & secrets | 6.5.4, 8.6.2/8.6.3 | Author ≠ approver ≠ prod-deployer enforced in GitLab+Octopus; secrets via Vault (dynamic, rotated, audited) |

---

## Sources

Primary (PCI SSC):
- https://blog.pcisecuritystandards.org/just-published-pci-dss-v4-0-1
- https://blog.pcisecuritystandards.org/now-is-the-time-for-organizations-to-adopt-the-future-dated-requirements-of-pci-dss-v4-x
- https://blog.pcisecuritystandards.org/pci-dss-v4-0-is-the-customized-approach-right-for-your-organization
- https://blog.pcisecuritystandards.org/just-published-pci-dss-v4-x-targeted-risk-analysis-guidance
- https://blog.pcisecuritystandards.org/new-information-supplement-pci-dss-scoping-and-segmentation-guidance-for-modern-network-architectures
- https://listings.pcisecuritystandards.org/documents/Guidance-PCI-DSS-Scoping-and-Segmentation_v1.pdf
- https://listings.pcisecuritystandards.org/pdfs/pci_fs_data_storage.pdf
- https://www.pcisecuritystandards.org/document_library/

Vendor / QSA / secondary (reproduce requirement text or map controls):
- https://www.guidepointsecurity.com/blog/pci-dss-4-0-major-future-dated-requirements/
- https://www.schellman.com/blog/pci-compliance/how-to-use-branch-protection-in-change-management
- https://www.schellman.com/blog/pci-compliance/pci-dss-service-account-requirements
- https://www.verygoodsecurity.com/blog/posts/ai-and-pci-compliance-what-every-company-needs-to-know-in-2026
- https://www.hashicorp.com/en/blog/pci-dss-4-compliance-with-hashicorp-vault-and-vault-radar
- https://www.hashicorp.com/en/blog/achieving-pci-compliance-leveraging-hashicorp-vault-to-protect-payment-data
- https://docs.gitlab.com/administration/compliance/compliance_features/
- https://docs.gitlab.com/user/compliance/compliance_frameworks/compliance_standards/
- https://docs.gitlab.com/user/project/merge_requests/approvals/
- https://octopus.com/docs/security/pci-compliance-and-octopus-deploy
- https://octopus.com/devops/grc/
- https://octopus.com/blog/financial-industry-compliance
- https://www.herodevs.com/blog-posts/pci-dss-4-0-requirement-3-how-to-protect-stored-account-data
- https://www.herodevs.com/blog-posts/pci-dss-4-0-requirement-10-how-to-log-and-monitor-all-access-to-system-components-and-cardholder-data
- https://pcidssguide.com/pci-dss-requirement-10/
- https://pcidssguide.com/what-are-the-pci-dss-log-retention-requirements/
- https://pcidssguide.com/change-control-management-for-pci-dss/
- https://pcidssguide.com/pci-dss-requirement-6/
- https://pcidssguide.com/pci-dss-requirement-7/
- https://vistainfosec.com/blog/pci-dss-requirement-6-changes-from-v3-2-1-to-v4-0-explained/
- https://vistainfosec.com/blog/pci-dss-requirement-7-changes-from-v3-2-1-to-v4-0-explained/
- https://vistainfosec.com/blog/pci-dss-requirement-8-changes-from-v3-2-1-to-v4-0-explained/
- https://vistainfosec.com/blog/pci-dss-requirement-10-changes-from-v3-2-1-to-v4-0-explained/
- https://vistainfosec.com/blog/pci-dss-requirement-11-changes-from-v3-2-1-to-v4-0-explained/
- https://www.cybeats.com/blog/pci-dss-4-0-sboms-a-2025-readiness-guide
- https://www.halock.com/what-is-the-new-pci-dss-v4-0-1-software-catalog-mandate/
- https://www.feroot.com/education-center/pci-dss-4-0-and-client-side-security-changes-impacts/
- https://www.primefactors.com/resources/blog/payments/complying-with-pci-dss-4-0/
- https://campusguard.com/post/pci-dss-v4-0-targeted-risk-analysis-explained/
- https://docs.cloud.google.com/architecture/tokenizing-sensitive-cardholder-data-for-pci-dss
- https://www.bluefin.com/bluefin-news/tokenization-cardholder-data-pci-compliance/
- https://kirkpatrickprice.com/video/pci-requirement-6-4-follow-change-control-processes-procedures-changes-system-components/
- https://blog.rsisecurity.com/pci-dss-requirement-6-controls-for-secure-applications-and-systems/

### Open / uncertain items to verify with a QSA against the v4.0.1 PDF
1. **Exact requirement numbering/wording** — confirmed via secondary sources, not the parsed PCI SSC PDF (tooling returned binary). Verify each against the v4.0.1 standard before audit use.
2. **"LLM prompt egress = defined disclosure event"** — derived from Req 3/4 + scope rules + VGS analysis; no PCI SSC document was found that names it as such.
3. **Service-provider vs merchant frequencies** (e.g., 11.4.5 6-mo vs annual) — depends on your entity type; confirm which applies.
4. **Whether the agent constitutes a "customized approach" control** — a policy decision with heavy TRA/controls-matrix documentation obligations if chosen.
