# PCI Card Production & Provisioning (PCI CP) + PCI PIN for a Card Manufacturer / Personalization Bureau — and what it means for an AI DevOps agent (Ansible + GitLab + Octopus)

**Purpose.** The user said *"we manufacture credit cards."* That is a fundamentally different regulatory posture from a merchant or processor. A card **manufacturer / personalization bureau** is governed primarily by the **PCI Card Production and Provisioning Security Requirements** (Physical + Logical), and — if it touches PINs or injects keys — by **PCI PIN Security**. PCI DSS does not disappear, but it is *not* the governing standard for the production floor. This document corrects and deepens the compliance design for an AI agent managing the Ansible / self-hosted GitLab / Octopus Deploy infrastructure in such an environment. Every claim is cited; uncertain claims are flagged **[UNCERTAIN]**.

**Sourcing note.** Authoritative wording below is quoted directly from the **PCI Card Production and Provisioning – Logical Security Requirements v2.0 (Dec 2016)** PDF, which was downloaded from the PCI SSC listings site and parsed to text locally (the v3.0 / v3.0.1 PDFs are gated behind a click-through agreement and could not be fetched as text by the tooling — see Version Context). Section numbers and quoted requirement text are from that v2.0 normative document; the **current production version is v3.0 (June 2022)**, so **verify exact section numbers against the v3.0 PDF in the PCI SSC Document Library before treating any number below as audit-grade** ([PCI SSC Card Production – Logical standard page](https://www.pcisecuritystandards.org/standards/card-production-and-provisioning-logical/)). The control *substance* (segmentation, dual control, HSM, remote access, change control) is stable across v2→v3.

---

## 0. Version context

- **PCI Card Production and Provisioning Security Requirements v3.0** was published / last updated **June 2022**, and consists of two separate documents: **Physical Security Requirements** and **Logical Security Requirements**. v3.0 added, among other things, coverage for **cloud-based / secure-element (SE) provisioning, over-the-air (OTA) personalization and lifecycle management**, and an appendix on the use of a **Security Operations Center (SOC)**. ([PCI SSC press release: Updates Card Production and Provisioning Security Standard](https://www.pcisecuritystandards.org/about_us/press_releases/pci-security-standards-council-updates-card-production-and-provisioning-security-standard/); [Help Net Security summary](https://www.helpnetsecurity.com/2022/01/18/pci-card-production-and-provisioning-security-requirements-3-0/))
- PCI SSC ran an **exploratory RFC (Feb 13 – Mar 16, 2026)** to decide whether a **v3.0.1** maintenance release is needed; as of this writing v3.0 remains the production version. ([PCI SSC blog: RFC PCI CP Physical & Logical v3.0.1](https://blog.pcisecuritystandards.org/request-for-comments-pci-card-production-and-provisioning-physical-and-logical-security-standards-v3.0.1))
- **PCI PIN Security Requirements v3.1** was published **March 2021** and is the current PIN standard: **33 requirements grouped under 7 control objectives**. ([PCI SSC blog: Just Released Version 3.1 of the PCI PIN Security Standard](https://blog.pcisecuritystandards.org/just-released-version-3-1-of-the-pci-pin-security-standard))
- Companion file: PCI **DSS** v4.0.1 (current) analysis for this same pipeline lives at `docs/infra-agent/research/pci-dss-devops.md`.

---

## 1. The standards landscape — which standards apply to a card manufacturer

| Standard | What it governs | Who publishes / who assesses / who enforces | Relevance to the AI DevOps agent |
|---|---|---|---|
| **PCI Card Production & Provisioning – Physical Security Requirements** (v3.0, 2022) | Tangible security of the production facility: building protection, secure rooms / high-security area (HSA), access controls, CCTV, asset & material security, secure storage and **secure transport** of card stock and finished cards (rail/sea/air/courier). Applies to manufacturers, personalizers, pre-personalizers, chip embedders, data-prep, card storing, shipping & mailing, OTA/SE provisioning. ([PCI SSC Physical standard page](https://www.pcisecuritystandards.org/standards/card-production-and-provisioning-physical/); [press release](https://www.pcisecuritystandards.org/about_us/press_releases/pci-security-standards-council-updates-card-production-and-provisioning-security-standard/)) | **Published by PCI SSC.** Assessed **on-site** by a **Card Production Security Assessor – Physical (CPSA-P)**. **Enforced by the payment brands**, not PCI SSC. ([CPSA qualification page](https://www.pcisecuritystandards.org/program_training_and_qualification/cpsa_qualification/)) | Mostly out of the agent's lane (physical), but defines the **HSA boundary** the agent must never cross logically. |
| **PCI Card Production & Provisioning – Logical Security Requirements** (v3.0, 2022) | Logical/IT security of the production data flow: data classification, network security & **segregation of data-prep and personalization networks**, system hardening, change management, audit logging, access control, **secure software development**, **key management (HSM, dual control, split knowledge)**, PIN distribution, OTA/cloud provisioning. Covers data preparation, pre-personalization, personalization, PIN generation, mailers, carriers & distribution. ([PCI SSC Logical standard page](https://www.pcisecuritystandards.org/standards/card-production-and-provisioning-logical/); Logical Security Requirements v2.0, §§1–10) | **Published by PCI SSC.** Assessed **on-site** by a **Card Production Security Assessor – Logical (CPSA-L)** — a *separate* qualification from CPSA-P; a person may hold either or both. **Enforced by the payment brands.** ([CPSA qualification page](https://www.pcisecuritystandards.org/program_training_and_qualification/cpsa_qualification/); [Card Production Security Assessor program](https://www.pcisecuritystandards.org/assessors_and_solutions/card_production_security_assessors/)) | **This is the standard that constrains the agent the most.** Nearly every section in §§4–10 bounds what CI/CD, config-management, and remote automation may do. |
| **PCI PIN Security Requirements** (v3.1, 2021) | Secure management, processing and transmission of cardholder PINs; **cryptographic key lifecycle**, HSM use, key injection, split knowledge / dual control, key ceremonies. Applies if you do **PIN mailers, PIN generation, key injection (KIF), remote key loading, or act as a CA/RA**. ([PCI SSC PIN v3.1 blog](https://blog.pcisecuritystandards.org/just-released-version-3-1-of-the-pci-pin-security-standard); [who must comply – SISA](https://www.sisainfosec.com/blogs/do-you-need-to-adhere-to-pci-pin-security-requirements/); [Futurex: key injection compliance](https://info.futurex.com/key-injection-compliance-2024)) | **Published by PCI SSC.** Assessed by a **Qualified PIN Assessor (QPA)** / via brand-defined SAQ or on-site, depending on role. **Enforced by the payment brands.** ([SISA: who must comply](https://www.sisainfosec.com/blogs/do-you-need-to-adhere-to-pci-pin-security-requirements/)) | Applies **only if** PIN/key-injection activities exist. Reinforces the same absolute: **automation never handles cleartext PINs or keys.** |
| **PCI PTS HSM** (device standard) | Physical & logical security of the **HSM hardware itself** (device approval). | PCI SSC approves devices; vendors build to it. ([PCI HSM Security Requirements v4 PDF](https://listings.pcisecuritystandards.org/documents/PCI_HSM_Security_Requirements_v4.pdf)) | The HSMs in the perso environment must be **PCI-approved or FIPS 140-2 Level 3+** (see §8.14 of the Logical standard, quoted below). Defines hardware the agent must treat as a black box. |
| **PCI DSS** (v4.0.1, current) | Protection of environments that **store/process/transmit** cardholder account data — the *baseline* data-security standard. | PCI SSC publishes; **QSA / ISA / SAQ**; brands/acquirers enforce. ([PCI SSC Standards](https://www.pcisecuritystandards.org/standards/)) | Applies to **corporate IT and any CDE outside the production floor**, and parts of the perso environment by reference (e.g., the Logical standard cites PCI DSS Req 4.1 for TLS). Governs where the agent *does* reasonably operate (general servers, corporate pipeline). |

### How PCI CP relates to / differs from PCI DSS

- **Different standard, different entity type, different assessor.** PCI SSC is explicit that *"knowledge of PCI DSS is not a prerequisite"* for PCI CP assessments — these standards apply to **different types of entities** in the payment ecosystem (PCI DSS = data environments that store/process/transmit account data; PCI CP = vendors that **manufacture and personalize cards** and provision data onto cards/devices). ([PCI SSC press release](https://www.pcisecuritystandards.org/about_us/press_releases/pci-security-standards-council-updates-card-production-and-provisioning-security-standard/); [PCI SSC Standards](https://www.pcisecuritystandards.org/standards/))
- **Assessment is card-brand-driven, not QSA-driven.** *"Compliance programs for all PCI SSC standards are managed by the payment brands"* ([PCI SSC Logical standard page](https://www.pcisecuritystandards.org/standards/card-production-and-provisioning-logical/)). The brands (Visa, Mastercard, Amex, Discover, JCB) define what validation is required and maintain lists of approved/compliant vendors. Discover, for example: issuers may use any card-production vendor *"as long as such vendors are compliant with PCI Card Production and Provisioning Physical & Logical Security Requirements,"* assessments *"must be completed by a PCI certified Card Production Security Assessor (CPSA) company and must include an applicable on-site assessment,"* and the vendor submits a signed **AOC + ROC** on request. ([Discover Global Network: Card Production Vendor Compliance](https://www.discoverglobalnetwork.com/solutions/pci-compliance/card-production-vendor-compliance/))
- **"Listed vendor" model.** Unlike PCI DSS self-attestation, card production compliance is effectively a **brand-approved/listed-vendor** regime — issuers can only place work with vendors the brands recognize as CP-compliant. ([Discover Global Network](https://www.discoverglobalnetwork.com/solutions/pci-compliance/card-production-vendor-compliance/); [PCI SSC CPSA program](https://www.pcisecuritystandards.org/assessors_and_solutions/card_production_security_assessors/))
- **Do both apply?** Yes, in layers. PCI CP is the governing standard **inside** the production / personalization environment; PCI DSS governs corporate IT and any separate environment that stores/processes/transmits account data, and PCI CP itself **references PCI DSS** for specific controls (e.g., the Logical standard requires VPN TLS *"in accordance with PCI Data Security Requirement 4.1"* — Logical Security Requirements v2.0 §5.6.2). PIN/key-injection activities add PCI PIN on top. **[UNCERTAIN]** The exact division of which corporate systems fall under PCI DSS vs. PCI CP is set by each brand's program and the entity's specific activities; confirm with the acquiring brand and the CPSA.

---

## 2. The production data flow — where real PAN, cardholder data, and keys live (and where they are in scope)

The Logical standard structures the flow as: **Issuer/Data Source → (private line / Internet) → Card Production DMZ → Data-Preparation Network → Personalization Network → fulfillment (mailers/carriers/distribution)** (Logical Security Requirements v2.0 §5.1).

- **Data Preparation (DP) network** — *"the network that contains the server(s) where the cardholder data is stored pending personalization … where the data is prepared and sent to the production floor."* (§5.1.4). This is where **cleartext PAN, expiry, cardholder name** are decrypted and prepared.
- **Personalization network** — *"the network that contains the card personalization machines."* (§5.1.5). This is where data and keys are written to magnetic stripe / chip; **chip personalization keys** and **PIN keys** are used here.
- **Data classification** (§4.1):
  - **Secret Data** = *"All symmetric (e.g., Triple DES, AES) and private asymmetric keys (e.g., RSA) — except keys used only for encryption of cardholder data."* Examples: *"Chip personalization keys; PIN keys and keys used to generate CVVs, CVCs, CAVs, or CSCs; PINs."* Managed under **§8 Key Management: Secret Data**.
  - **Confidential Data** = cardholder data and the keys used to encrypt it. Examples: *"PAN, expiry, service code, cardholder name; TLS keys; … Authentication credentials for requesting tokens."* Managed under **§9 Key Management: Confidential Data**.
- **Encryption everywhere except the moment of use** (§4.2): all secret and confidential data must be *"Encrypted at all times during transmission and storage,"* *"Decrypted for the minimum time required for data preparation and personalization,"* and the vendor *"must only decrypt or translate cardholder data on the data-preparation or personalization or cloud-based provisioning network and not while it is on an Internet or public facing network."*
- **Access to cardholder data** (§4.3): *"Prevent direct access to cardholder data from outside the … personalization network"* and *"Prevent physical and logical access from outside the high security area (HSA) to the data-preparation or personalization networks."* PANs must be **masked** (max first-6 / last-4) unless the issuer authorizes otherwise.

**Net scope picture:** cleartext PAN/cardholder data and all secret keys live **only** inside the HSA, on the **dedicated** DP and personalization networks, and keys live **only** inside HSMs (or as split components in custodian custody). Everything outside the HSA must never see cleartext.

---

## 3. Logical Security Requirements that directly constrain IT / DevOps / automation

Quoted from **PCI Card Production – Logical Security Requirements v2.0** (verify numbering against v3.0).

### 3.1 Network segmentation / segregation (§5.2 General Requirements)
- (e) *"Ensure that the personalization and data-preparation systems are on dedicated network(s) independent of the back office (e.g., accounting, human resources, etc.) and Internet-connected networks. **A virtual LAN (VLAN) is not considered a separate network.**"*
- (g) *"Access from within the high security area to anything other than the personalization or cloud-based networks must be **'read-only.'**"*
- (i) *"Have controls in place to restrict 'write' permission to any system external to the personalization network to only pre-approved functions that have been authorized by the VPA … These write functions must not transmit cardholder data."*
- (f) cloud-based provisioning must be *"physically and logically segregated … It cannot be in the same rack as other servers used for different purposes."*
- The vendor must maintain a current network topology diagram and **the CISO must formally sign off** on the topology (§5.2 a–c).

> **Implication:** a corporate CI/CD plane and an AI agent on the back-office network are, by definition, *outside* the dedicated perso/DP networks. Pushing configuration *into* those networks is a "write" from an external system and is heavily restricted; in/out of the HSA is constrained to **read-only** for anything that isn't the perso/cloud network itself.

### 3.2 Remote access (§5.6) — the single biggest constraint on a remote automation agent
- (a) *"Remote access is permitted only for the administration of the network or system components."*
- (c) only *"from pre-determined and authorized locations using vendor-approved systems."*
- (d) *"Access using personally owned hardware is prohibited."*
- (h)/(i) *"Remote access is prohibited to any system where clear-text cardholder data is being processed,"* and *"Remote access is prohibited to clear-text cardholder data, clear-text cryptographic keys, or clear-text key components/shares."*
- (j.i) systems *"accept connections only from preauthorized source systems."*
- (k) non-vendor remote admins must meet *"the same pre-screening qualification requirements as employees working in high security areas"* (and carry liability insurance).
- (l) *"All remote access must use a VPN"* with **multi-factor authentication** (§5.6.2 g), 5-minute idle timeout (j), lockout after 3 failures (h), and *"Remote access must be logged, and the log must be reviewed weekly"* (k).

> **Implication:** an AI agent acting as a *remote administrator* into perso systems is squarely in §5.6 territory — pre-authorized source only, MFA, no personal hardware, full logging, weekly review, **and an absolute prohibition on reaching cleartext PAN/keys**. A non-human "user" that cannot be pre-screened, badged, and held to HSA-staff standards is a poor fit for any remote-admin role here.

### 3.3 System hardening & change management (§6)
- **§6.1/§5.4** baselines must follow industry hardening standards (*"CIS, ISO, SANS, NIST"*); deny-all-not-permitted; disable unnecessary services/ports.
- **§6.2 Change Management:** documented change control with authorized requests, impact & back-out, audit trail; *"all changes are approved by the CISO or authorized individual prior to deployment"*; emergency-change procedure; version control for all software; *"a controlled process for the transfer of a system from test mode to live mode"* — and crucially: *"both development and production staff must sign off on the transfer of a system from test to live … This sign-off must be **witnessed under dual control.**"*
- **§6.3 Configuration & Patch Management:** config validated against the authorized baseline **monthly**; security patches within **30 days** (critical/Internet-facing within **7 business days**); *"Make a backup of the system being changed before applying any patches."*
- **§6.4 Audit Logs:** logs for all networks/devices/apps with user ID, event type, timestamp, success/failure, origin, affected resource, access to logs, privilege changes; tiered review cadence (real-time alerts, daily IDS/IPS, weekly auth servers, monthly routers/accounts); *"Protect and maintain the integrity of the audit logs from any form of modification"*; retain **1 year** (3 months online).

> **Implication:** IaC + GitLab MR review + pipeline records can *evidence* change control, **but** the standard demands a human, dual-control, witnessed test→live promotion and CISO approval before deployment. An agent may *prepare* changes; it **cannot be the approving authority**, and the test→live gate cannot be fully automated away.

### 3.4 Secure software development & separation of duties (§6.6)
- (b) SDLC must follow secure-coding guidance (*"OWASP Guide, SANS CWE Top 25, CERT Secure Coding"*).
- §6.6.3 (a) *"access to source code for applications used on the personalization network is restricted to authorized personnel only."*
- §6.6.3 (d) *"separation of duties exists between the staff assigned to the development environment and those assigned to the production environment."*
- §6.6.3 (b/c) in-house perso software must *"log any restart"* and *"enforce authorization at restart."*

> **Implication:** the agent and the corporate GitLab live in the **development** world. Source for personalization-floor software is access-restricted; dev/prod separation of duties means the same identity (human or agent) should not both author and deploy to perso.

### 3.5 Access control (§7) and web/issuer interfaces (§6.7)
- §7 mandates per-user accounts, password controls, session locking, account lockout, quarterly access validation.
- §6.7 issuer/web-service interfaces require **mutual TLS with X.509 from a trusted CA** (or a §5.6.2 VPN), current TLS, SHA-2+.

---

## 4. HSMs & key management — automation must never touch keys or PAN

From **§8 Key Management: Secret Data** and **§8.14 Key-Management Security Hardware**:

- **§8.1(b):** *"The principles of split knowledge and dual control must be included in **all** key life cycle activities involving key components … The only exceptions … involve those keys that are managed as cryptograms or stored within an SCD."*
- **§8.1(c):** *"barriers beyond procedural controls to prevent any one individual from gaining access to key components or shares sufficient to form the actual key."*
- **§8.1(d):** any PC where clear key components pass *"must never be connected to any network and must be powered down when not in use … dedicated and … hardened and managed under dual control at all times."*
- **§8.1(g):** *"Cryptographic keys must not be hard-coded into software."*
- **§8.2 / §8.3:** symmetric & private keys may exist **only** as plaintext inside an SCD, as a cryptogram, or as **2+ full-length components / "m of n" shares (m ≥ 2)**; *"No single person shall be able to access or use all components or a quorum of shares."*
- **§8.4.1(b):** *"All physical equipment associated with key-management activity … as well as equipment such as personal computers — must be managed following the principle of dual control."*
- **§8.14 Key-Management Security Hardware:** *"All key-management activity must be performed using a HSM"*; HSMs *"must be approved by PCI or certified to FIPS 140-2 Level 3, or higher"*; *"The HSM must be under physical **dual control at all times.**"*

> **Hard rule for the agent:** key generation, loading, distribution, backup, destruction, and all key ceremonies are **out-of-band, dual-control, split-knowledge, HSM-bound human operations**. An autonomous agent — or any networked, single-actor process — **cannot** participate: it would violate dual control, split knowledge, the air-gap on component-handling PCs (§8.1d), and the no-hard-coded-keys rule (§8.1g). The agent must treat HSMs as opaque appliances it never configures, keys it never sees, and ceremonies it is never in the room for.

---

## 5. Implications for the AI agent + Ansible / GitLab / Octopus

### 5.1 What must stay completely OUT of the HSA / DP / personalization environment
- The **AI agent's "brain"** (the LLM and its orchestration), the **corporate GitLab** server, **CI runners**, the **Octopus server**, and the **Ansible control node** are management/automation tooling that belongs on the **back-office / management network** — which §5.2(e) requires to be **separate** from the dedicated perso/DP networks (and a VLAN is explicitly *not* sufficient separation).
- Because in/out of the HSA must be **read-only** except for VPA-approved write functions that *carry no cardholder data* (§5.2 g, i), general config-management push *into* the perso/DP networks is **not** a normal, freely-permitted action — it is a tightly scoped, pre-authorized exception, if allowed at all.

### 5.2 Is config-management automation even permitted to reach personalization systems?
- Not as ordinary remote admin. Any reach is governed by **§5.6 Remote Access** (pre-authorized source, vendor-approved system, MFA, no personal hardware, no cleartext PAN/keys, weekly log review) **and** §5.2's read-only/write-restriction rules. The realistic posture: **automation manages the corporate/IT estate and the development side; it does not autonomously reconfigure live personalization machines.** Changes that *do* reach perso go through documented change control with **CISO approval** and a **dual-control, witnessed test→live promotion** (§6.2) — a human gate the agent cannot replace.

### 5.3 Air-gap / data-diode considerations
- §8.1(d) effectively mandates **air-gapped, powered-down, dual-control PCs** for clear key components. The DP/perso networks are dedicated and isolated, cardholder data is decrypted only there (§4.2 d), and writes from external systems are restricted (§5.2 i). This argues for a **one-way / data-diode-style ingress** of issuer data into DP and **no general management egress** out of perso — the perso network should be reachable for narrowly approved, no-CHD functions only. **[UNCERTAIN]** PCI CP does not literally use the term "data diode"; it mandates segregation, read-only access, and write restrictions that a diode/one-way pattern satisfies — confirm acceptable architecture with the CPSA.

### 5.4 Why a local-only LLM (no internet egress) matters *even more* here
- The perso/DP networks must be *"independent of … Internet-connected networks"* (§5.2 e) and cardholder data must never be decrypted on an Internet/public-facing network (§4.2 d). A cloud LLM implies egress and a data path off-prem — incompatible with these isolation rules and with §4.3/§5.6 prohibitions on external access to CHD/keys. A **fully local, no-egress LLM** keeps the agent's reasoning inside the trust boundary, avoids exporting any production data or build/audit artifacts, and aligns with the back-office-stays-separated posture. (Consistent with the on-prem rationale already argued for PCI DSS in `pci-dss-devops.md`; here it is *more* binding because the production environment is explicitly air-gapped from the Internet.)

### 5.5 Segregation of manufacturing/perso network from corporate IT
- §5.2(e) is unambiguous: perso/DP must be on **dedicated networks independent of the back office** (HR, accounting) and the Internet — and **VLAN ≠ separate network**. The agent operating in corporate IT is, by design, on the far side of that boundary. Octopus's environment-scoped Tentacle/worker model and Ansible's per-inventory targeting can *enforce* that the agent's automation simply has **no inventory entries, no credentials, and no network path** into the perso/DP zone. ([Octopus: PCI Compliance and Octopus Deploy](https://octopus.com/docs/security/pci-compliance-and-octopus-deploy))

---

## 6. The realistic compliance-scope split — where the agent may and may not operate

```
┌─────────────────────────────────────────────────────────────────────────┐
│ CORPORATE IT / GENERAL SERVERS                          (PCI DSS v4.0.1)  │
│  • AI agent brain (LOCAL, no-egress LLM)                                   │
│  • GitLab (source, MRs, CI), Octopus server, Ansible control node         │
│  • Build/test, IaC repos, non-CHD app servers, back-office systems        │
│  → AGENT OPERATES HERE: hardening, patching, IaC, change prep, logging.   │
│  → Still subject to PCI DSS scoping/segmentation (see pci-dss-devops.md). │
└───────────────┬──────────────────────────── DEDICATED, SEPARATE ─────────┘
                │  (dedicated network, NOT a VLAN; MFA VPN; read-only in;
                │   write-restricted, no-CHD, VPA-approved functions only)
┌───────────────▼──────────────────────────────────────────────────────────┐
│ HIGH SECURITY AREA (HSA) — CARD PRODUCTION         (PCI CP Logical+Physical│
│                                                     + PCI PIN if keys/PINs)│
│  ┌──────────────────────────┐   ┌─────────────────────────────────────┐   │
│  │ DATA-PREPARATION NETWORK │   │ PERSONALIZATION NETWORK             │   │
│  │  cleartext PAN/CHD,       │──▶│  perso machines, chip/PIN keys,     │   │
│  │  prep servers            │   │  HSMs (PCI-approved / FIPS L3+)      │   │
│  └──────────────────────────┘   └─────────────────────────────────────┘   │
│  Key ceremonies: dual control + split knowledge, air-gapped component PCs   │
│  → AGENT MUST NOT OPERATE HERE. No cleartext PAN. No keys. No HSM config.   │
│  → No autonomous deploys to live perso. Test→live = human, dual-control,    │
│    CISO-approved, witnessed promotion. Remote access = §5.6 humans only.    │
└────────────────────────────────────────────────────────────────────────────┘
```

### "What the agent MAY touch"
- Corporate IT / general servers: OS hardening, patch orchestration, IaC authoring, config drift remediation, CI builds, log shipping, vulnerability scanning — under PCI DSS controls.
- The **development side** of perso software (authoring, building, testing in a separated dev environment), respecting §6.6.3 dev/prod separation of duties and restricted source-code access.
- **Preparing** (not approving/promoting) changes destined for the perso environment: open MRs, run pipelines, produce artifacts and change records that feed the human, dual-control §6.2 promotion.

### "What the agent MUST NOT touch"
- **Cleartext PAN / cardholder data** anywhere (§4.3, §5.6 h/i).
- **Cryptographic keys, key components/shares, or HSMs** — generation, loading, backup, destruction, ceremonies, or configuration (§8, §8.14, §8.1 d/g). These are out-of-band, dual-control, split-knowledge human operations.
- **PINs / PIN data** (and PIN-key operations under PCI PIN if in scope).
- **Autonomous deployment to live personalization machines.** The test→live gate requires CISO approval and a **dual-control, witnessed** human sign-off (§6.2 h); the agent cannot be the sole/approving actor.
- **Remote administration into the perso/DP networks as a self-directed actor** — §5.6 requires pre-authorized human admins (pre-screened to HSA standards, MFA, vendor-approved non-personal hardware) and forbids any path to cleartext PAN/keys.
- **Any internet-egressing reasoning path** that could carry production data off the air-gapped perso/DP networks (§5.2 e, §4.2 d) — hence a **local-only LLM**.

---

## 7. The 6 hardest constraints card production places on this agent's architecture (vs. plain PCI DSS)

1. **A mandatory air-gapped, internet-independent production network.** PCI DSS lets you *scope* the CDE and connect management tooling through controlled paths; PCI CP **requires** perso/DP networks *"independent of … Internet-connected networks,"* with **VLAN explicitly insufficient** (§5.2 e). The agent cannot be "carefully connected" — it must be on the *other* network entirely, which forces a **local, no-egress LLM**.
2. **Read-only-in / write-restricted boundary into the HSA.** *"Access from within the high security area to anything other than the personalization or cloud-based networks must be 'read-only,'"* and external writes are limited to VPA-pre-approved, no-CHD functions (§5.2 g/i). Ordinary config-management *push* — the core of Ansible/Octopus — is largely **disallowed** into perso, not merely "in scope."
3. **Dual control + split knowledge over the entire key lifecycle, HSM-bound.** *"All key life cycle activities … split knowledge and dual control,"* HSM *"under physical dual control at all times,"* component PCs air-gapped and powered down, **no hard-coded keys** (§8.1, §8.14). PCI DSS Req 3 has key-management rules, but PCI CP makes **two-person, out-of-band, hardware-bound** ceremonies non-negotiable — **structurally excluding any single automated actor**.
4. **Human, dual-control, witnessed test→live promotion with CISO approval.** §6.2(c/h) requires CISO approval before deployment and *"both development and production staff … sign off … witnessed under dual control"* for test→live. GitOps "merge = deploy" automation, acceptable in many PCI DSS shops, **cannot be the final gate** here; the agent prepares but never promotes.
5. **Remote access is a pre-screened-human, MFA, approved-hardware privilege — closed to cleartext PAN/keys.** §5.6: no personal hardware, pre-authorized source only, remote admins held to **HSA-staff screening**, and an **absolute bar** on reaching cleartext CHD, keys, or key components. A non-human agent cannot satisfy the personnel-vetting model, so it cannot hold remote-admin into perso.
6. **Card-brand-driven, listed-vendor, on-site CPSA assessment — no self-attestation.** Compliance is **enforced by the payment brands** via on-site **CPSA-L/CPSA-P** assessors and signed **AOC+ROC** ([Discover](https://www.discoverglobalnetwork.com/solutions/pci-compliance/card-production-vendor-compliance/); [CPSA program](https://www.pcisecuritystandards.org/program_training_and_qualification/cpsa_qualification/)). The agent's design must be **defensible to an on-site assessor and the issuing brands**, not just to an internal QSA/SAQ — raising the bar on auditable evidence, separation of duties, and the agent's explicit *exclusion* from the HSA.

---

## Sources

- PCI SSC — Card Production & Provisioning – Logical (standard page): https://www.pcisecuritystandards.org/standards/card-production-and-provisioning-logical/
- PCI SSC — Card Production & Provisioning – Physical (standard page): https://www.pcisecuritystandards.org/standards/card-production-and-provisioning-physical/
- PCI SSC — Press release: Updates Card Production and Provisioning Security Standard (v3.0): https://www.pcisecuritystandards.org/about_us/press_releases/pci-security-standards-council-updates-card-production-and-provisioning-security-standard/
- PCI SSC — Card Production & Provisioning **Logical Security Requirements v2.0 (Dec 2016)** (primary normative source for quoted §§4–10): https://listings.pcisecuritystandards.org/documents/PCI_Card_Production_Logical_Security_Requirements_v2_Nov2016.pdf
- PCI SSC — Card Production & Provisioning Physical Security Requirements v2.0: https://www.pcisecuritystandards.org/documents/PCI_Card_Production_Physical_Security_Requirements_v2_Nov2016.pdf
- PCI SSC — Blog: RFC PCI CP Physical & Logical v3.0.1: https://blog.pcisecuritystandards.org/request-for-comments-pci-card-production-and-provisioning-physical-and-logical-security-standards-v3.0.1
- PCI SSC — Card Production Security Assessor (CPSA) Qualification: https://www.pcisecuritystandards.org/program_training_and_qualification/cpsa_qualification/
- PCI SSC — Card Production Security Assessors (CPSA) program: https://www.pcisecuritystandards.org/assessors_and_solutions/card_production_security_assessors/
- PCI SSC — Blog: Just Released Version 3.1 of the PCI PIN Security Standard: https://blog.pcisecuritystandards.org/just-released-version-3-1-of-the-pci-pin-security-standard
- PCI SSC — PCI HSM Security Requirements v4 (PTS HSM): https://listings.pcisecuritystandards.org/documents/PCI_HSM_Security_Requirements_v4.pdf
- PCI SSC — Standards overview: https://www.pcisecuritystandards.org/standards/
- Discover Global Network — Card Production Vendor Compliance (brand enforcement / listed-vendor model): https://www.discoverglobalnetwork.com/solutions/pci-compliance/card-production-vendor-compliance/
- Help Net Security — PCI CP v3.0 summary (SOC appendix, OTA/SE coverage): https://www.helpnetsecurity.com/2022/01/18/pci-card-production-and-provisioning-security-requirements-3-0/
- SISA — Who must comply with PCI PIN Security Requirements: https://www.sisainfosec.com/blogs/do-you-need-to-adhere-to-pci-pin-security-requirements/
- Futurex — Key Injection Compliance (KIF / PCI PIN): https://info.futurex.com/key-injection-compliance-2024
- Octopus Deploy — PCI Compliance and Octopus Deploy (environment scoping / isolation): https://octopus.com/docs/security/pci-compliance-and-octopus-deploy
- Companion (PCI DSS for this pipeline): `docs/infra-agent/research/pci-dss-devops.md`
