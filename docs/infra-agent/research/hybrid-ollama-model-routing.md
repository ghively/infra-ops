# Hybrid Local/Cloud LLM Architecture & Tiered Model Routing for an Infra-Management Agent

**Purpose:** Justify and design a HYBRID model architecture for an infrastructure-management agent where (A) PCI/cardholder-data-adjacent or otherwise sensitive content is handled by a **local LLM (Ollama, on-prem)** and never egresses to a cloud LLM, and (B) the remaining work uses **weighted/tiered model selection** for cost-optimal capability.

**Status:** Research synthesis. Every substantive claim is cited inline with a URL. Vendor pricing and benchmark numbers change frequently and several secondary sources reference forward-dated/future model names (e.g. "Qwen 3.6", "Opus 4.8") that could not be independently verified against primary vendor pages — these are flagged as **[UNVERIFIED]** and the design deliberately leans on the strongest *primary* sources (Anthropic docs, OWASP, the Qwen2.5-Coder technical report). **Validate all pricing/benchmark figures against primary vendor docs before relying on them.**

Date compiled: 2026-06-03.

---

## Part A — Local / Hybrid Routing for Sensitive Data

### 1. WHY route sensitive/regulated data to a local model

**PCI DSS: external processors expand, not shrink, your scope.** Any third-party entity that stores, processes, transmits, or can impact the security of payment card account data is a Third-Party Service Provider (TPSP) and must adhere to applicable PCI DSS requirements; sending cardholder data (CHD) to an external API makes that vendor part of your cardholder data environment (CDE) and your responsibility to validate ([Mitratech](https://mitratech.com/resource-hub/blog/pci-third-party-service-provider-requirements/), [VikingCloud](https://www.vikingcloud.com/blog/whos-responsible-navigating-pci-compliance-for-third-party-service-providers-tpsps-and-merchants)). Outsourcing "can sometimes expand your compliance scope, not shrink it" when vendors introduce new systems or process CHD on your behalf ([Tripwire](https://www.tripwire.com/state-of-security/pci-dss-compliance-meeting-third-party-vendor-requirements)). You must also maintain a documented list of every TPSP with which account data is shared and obtain their PCI validation evidence ([PCI DSS Guide](https://pcidssguide.com/what-are-the-pci-dss-third-party-service-provider-management-requirements/)). The recognized best practice is **architectural isolation** — keep CHD flowing through dedicated PCI-certified infrastructure so "LLMs [do] not touch sensitive data" ([Sierra, on building PCI-compliant agents](https://sierra.ai/blog/payments)).

**GDPR: each cloud call with personal data is a cross-border transfer event.** "Every cloud AI API call containing personal data is a potential GDPR cross-border transfer — triggering Articles 28 and 46 simultaneously," and cross-border transfer violations sit in the highest penalty tier (up to 4% of global annual turnover) ([Seresa](https://seresa.io/blog/gdpr-international-data-transfers/data-residency-ai-inference-and-your-marketing-agency-a-compliance-checklist)). Lawful transfer requires Standard Contractual Clauses, an adequacy decision, or Binding Corporate Rules ([brics-econ](https://brics-econ.org/data-residency-considerations-for-global-llm-deployments)). The clean architectural answer: **local inference creates zero cross-border-transfer events** — "if data never leaves your hardware, Article 46 doesn't apply" ([Seresa](https://seresa.io/blog/gdpr-international-data-transfers/data-residency-ai-inference-and-your-marketing-agency-a-compliance-checklist)).

**Cloud retention/training concerns.** Even reputable providers retain by default: Anthropic standard API logs are retained ~7 days (deleted after, and not used for training); **Zero Data Retention (ZDR) is available only to qualifying enterprise customers, "subject to Anthropic approval" — not the default** ([anarlog summary of Anthropic policy](https://anarlog.so/blog/anthropic-data-retention-policy/), [datastudios](https://www.datastudios.org/post/claude-data-retention-policies-storage-rules-and-compliance-overview)). OpenAI API data is not trained on by default but is typically retained ~30 days for abuse monitoring unless on an Enterprise ZDR plan ([AxSentinel comparison](https://ax-sentinel.com/blog/ai-data-retention-policies-compared)). ZDR endpoints exist across major providers but "are rarely the default setting" ([abubakarsiddik](https://abubakarsiddik.site/blog/zero-data-retention-llm-providers)).

**What a "local-only for PCI-scoped content" boundary buys you.** (1) It keeps CHD-adjacent content out of any TPSP CDE, shrinking PCI scope to your own on-prem boundary ([Sierra](https://sierra.ai/blog/payments)). (2) It eliminates GDPR cross-border-transfer exposure for that content ([Seresa](https://seresa.io/blog/gdpr-international-data-transfers/data-residency-ai-inference-and-your-marketing-agency-a-compliance-checklist)). (3) It removes dependence on a vendor's ZDR approval/retention posture for the sensitive subset ([AxSentinel](https://ax-sentinel.com/blog/ai-data-retention-policies-compared)). Reflecting this, one source reports "55% of enterprise AI inference is now on-premises, with data residency compliance as the primary driver" ([Seresa](https://seresa.io/blog/gdpr-international-data-transfers/data-residency-ai-inference-and-your-marketing-agency-a-compliance-checklist)) — treat the exact percentage as **[UNVERIFIED]** secondary data, but the direction is consistent across sources.

### 2. Architecture patterns for HYBRID routing

The pattern is: **classify content sensitivity first, then route.** PCI-scoped / CHD-adjacent / PII-bearing work goes to **on-prem Ollama**; everything else goes to a capable cloud model. Keeping the boundary *verifiable* is the hard part.

Design principles:

- **Pre-egress sensitivity classifier (deterministic + model-assisted).** Run a fast, auditable detector (regex/Luhn check for PAN, named-entity/PII detectors, source-system tags) *before* any cloud egress. The classifier itself should be local so the decision never depends on cloud round-trips. (PCI requires demonstrating *where* CHD flows — the classifier and its logs are part of that evidence; [PCI DSS Guide](https://pcidssguide.com/what-are-the-pci-dss-third-party-service-provider-management-requirements/).)
- **Default-deny egress at the network layer.** The on-prem tier should run where outbound internet is blocked, so "local-only" is enforced by network policy, not just code. GDPR guidance frames the only reliable solution as *architectural* — "keep data, models, and processing within the same legal jurisdiction" ([brics-econ](https://brics-econ.org/data-residency-considerations-for-global-llm-deployments)).
- **Verifiable boundary = logged routing decisions + a documented architecture diagram.** GDPR/PCI both want "a documented architecture showing exactly where [regulated] data is processed and stored" ([Seresa checklist](https://seresa.io/blog/gdpr-international-data-transfers/data-residency-ai-inference-and-your-marketing-agency-a-compliance-checklist)). Emit an immutable audit record per request: `{request_id, sensitivity_label, model_tier, egress=local|cloud}`.
- **Redaction/tokenization as a fallback path.** When a task *needs* frontier capability but touches PII, tokenize/redact the sensitive spans on-prem first so only de-identified text egresses — mirroring the "CHD never touches the LLM" isolation pattern ([Sierra](https://sierra.ai/blog/payments)).
- **ZDR + DPA as belt-and-suspenders for the cloud tier.** For the non-sensitive cloud path, still require a signed DPA and ZDR configuration ([Seresa](https://seresa.io/blog/gdpr-international-data-transfers/data-residency-ai-inference-and-your-marketing-agency-a-compliance-checklist)); ZDR-eligible features (e.g. Anthropic prompt caching under a ZDR arrangement) avoid storing data after the response ([Anthropic prompt-caching docs](https://platform.claude.com/docs/en/build-with-claude/prompt-caching)).

### 3. Practical Ollama in production

**Models that are actually good at code/infra/YAML reasoning locally.** The strongest *primary-sourced* recommendation is the **Qwen2.5-Coder** family: Qwen2.5-Coder-32B-Instruct "has achieved the best performance among open-source models on multiple popular code generation benchmarks (EvalPlus, LiveCodeBench, BigCodeBench), and has competitive performance with GPT-4o," scoring ~92.7% on HumanEval (Instruct) / 88.4% base ([Qwen2.5-Coder Technical Report, arXiv 2409.12186](https://arxiv.org/html/2409.12186v2); [Qwen blog](https://qwenlm.github.io/blog/qwen2.5-coder-family/)). Secondary 2026 round-ups corroborate Qwen-Coder, DeepSeek-R1 (reasoning), Llama 3.x, and gpt-oss as the practical local picks, and several name newer entrants — **[UNVERIFIED]**: "Qwen 3.6 27B … 77.2% SWE-bench," "Kimi K2.6," "gpt-oss:20b," "DeepSeek V4" ([Morph Ollama ranking](https://www.morphllm.com/best-ollama-models), [Local AI Master coding models](https://localaimaster.com/models/best-local-ai-coding-models), [PromptQuorum](https://www.promptquorum.com/local-llms/top-open-source-models-ollama)). Treat forward-dated model names as unverified until checked on [ollama.com/library](https://ollama.com/library).

**Hardware / VRAM per size tier** (consistent across sources):

| Model tier | Quant | VRAM floor | Representative GPU | Source |
|---|---|---|---|---|
| 7–8B (Llama 3.1 8B) | Q4 | ~6–8 GB | RTX 3060/3070 | [Local AI Master](https://localaimaster.com/blog/best-ollama-models), [Morph](https://www.morphllm.com/best-ollama-models) |
| 30–32B (Qwen2.5-Coder 32B) | Q4_K_M | **24 GB** | RTX 3090 / 4090 | [CraftRigs](https://craftrigs.com/guides/qwen-2-5-coder-32b-hardware-guide/), [ToolHalla](https://toolhalla.ai/blog/qwen-25-coder-best-local-coding-llm-in-2026-setup-benchmarks) |
| 70B (Llama 3.3 70B) | Q4 | **40 GB+** (else aggressive quant) | A100 40/80GB, 2×24GB | [Morph](https://www.morphllm.com/best-ollama-models) |

`Q4_K_M` gives "~55% VRAM reduction, less than 1% quality loss on benchmarks" and a 32B fits cleanly on a single 24 GB card; Apple Silicon unified memory can run Q8 for more headroom ([ToolHalla](https://toolhalla.ai/blog/qwen-25-coder-best-local-coding-llm-in-2026-setup-benchmarks), [CraftRigs](https://craftrigs.com/guides/qwen-2-5-coder-32b-hardware-guide/)). Pull via `ollama pull qwen2.5-coder:32b` ([ucstrategies](https://ucstrategies.com/news/qwen-2-5-coder-specs-benchmarks-hardware-requirements-2026/)).

**Throughput & limitations vs frontier cloud.** Reasoning ("R1-style") models add latency — "often 2–3x slower than a non-reasoning model at the same parameter count" ([PromptQuorum](https://www.promptquorum.com/local-llms/top-open-source-models-ollama)). The realistic split reported repeatedly: local models handle ~**70–80% of everyday coding/infra tasks at zero marginal cost**, while "cloud models still lead on the hardest benchmarks" — use local for routine + privacy-sensitive work, cloud for complex architecture ([Morph](https://www.morphllm.com/best-ollama-models), [Pinggy](https://pinggy.io/blog/best_open_source_self_hosted_llms_for_coding/)). The 70/30 figure is a secondary-source heuristic — **[UNVERIFIED]** as a precise number, but it is the consensus shape.

### 4. Security of local agents

"Local" reduces **disclosure** risk; it does not eliminate **agent** risk.

- **Prompt injection is the dominant failure mode** because LLMs don't distinguish instructions from data — OWASP ranks it LLM01 ([OWASP LLM01 / Securiti](https://securiti.ai/llm01-owasp-prompt-injection/), [OWASP Foundation](https://owasp.org/www-community/attacks/PromptInjection)). **Indirect** injection is the infra-agent's real threat: hidden instructions inside logs, YAML, HTML, IaC files, or tool output that the agent ingests ([Christian Schneider](https://christian-schneider.net/blog/prompt-injection-agentic-amplification/)).
- **Agentic amplification.** Per OWASP's Top 10 for Agentic Applications, "what was once a single manipulated output can now hijack an agent's planning, execute privileged tool calls, persist malicious instructions in memory, and propagate attacks across connected systems" ([OWASP AI Agent Security Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/AI_Agent_Security_Cheat_Sheet.html), [svitla](https://svitla.com/blog/owasp-vulnerabilities-llm/)).
- **Sandboxing is essential.** Run each session/tool execution in a constrained environment with no host filesystem access so a bad action is contained ([DEV — local AI agent lessons](https://dev.to/andremmfaria/when-chat-turns-into-control-security-lessons-from-running-a-local-ai-agent-21l0)).
- **Defense-in-depth:** input validation on all data sources, goal-lock mechanisms, least-privilege tool sandboxing, and human-in-the-loop approval for high-impact actions (apply, destroy, IAM changes) ([OWASP Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/LLM_Prompt_Injection_Prevention_Cheat_Sheet.html)).

---

## Part B — Model Selection & Cost Optimization

### 5. Tiered model routing

An LLM router **classifies prompt difficulty and routes to the matching tier** — cheap/small for mechanical tasks, frontier for planning/architecture/review. Reported outcomes: classification in ~430 ms and **40–70% cost savings with <2% quality loss on hard tasks** ([Morph LLM Router](https://www.morphllm.com/llm-router)); easy prompts to a cheap model, hard prompts to an expensive one ([MindStudio three-tier routing](https://www.mindstudio.ai/blog/set-up-ai-model-router-llm-stack-c2610)). A three-tier "fast / smart / power" stack is the common production shape ([MindStudio](https://www.mindstudio.ai/blog/set-up-ai-model-router-llm-stack-c2610)).

**Published evidence that routing pays off.** RouteLLM (UC Berkeley/Anyscale/Canva, ICLR 2025) achieved **95% of GPT-4 quality while sending only ~14% of requests to GPT-4** (rest to Mixtral 8x7B), with **>85% cost reduction on MT-Bench**, 45% on MMLU, 35% on GSM8K vs GPT-4-only ([LMSYS RouteLLM blog](https://www.lmsys.org/blog/2024-07-01-routellm/), [lm-sys/RouteLLM GitHub](https://github.com/lm-sys/routellm)). Newer RL-based routers (PickLLM, HierRouter, xRouter) extend this with cost/latency/accuracy reward functions ([PickLLM arXiv 2412.12170](https://arxiv.org/pdf/2412.12170), [HierRouter arXiv 2511.09873](https://arxiv.org/pdf/2511.09873), [xRouter arXiv 2510.08439](https://arxiv.org/html/2510.08439v1)).

**Where bigger models genuinely pay off.** Anthropic's own data: "token usage by itself explains 80% of the variance" in agent performance, and multi-agent/frontier approaches earn their cost on "tasks where the value of the task is high enough to pay for the increased performance" — heavy parallelization, info exceeding one context window, many complex tools ([Anthropic — multi-agent research system](https://www.anthropic.com/engineering/multi-agent-research-system)). Conversely they note most coding tasks have tight dependencies that *don't* parallelize well — a caution against over-fanning-out the infra agent ([Anthropic](https://www.anthropic.com/engineering/multi-agent-research-system)).

### 6. Cost-optimization techniques for agentic use

- **Prompt caching.** Reuse a stable system prompt / large context across calls. Anthropic pricing: **5-min cache write = 1.25× base input; 1-hour write = 2× base input; cache read = 0.1× base input** (i.e. a hit costs 10% of input price). Caching "pays off after just one cache read for the 5-minute duration, or after two reads for the 1-hour duration." Minimum cacheable prompt is **1,024 tokens** (Sonnet/most Opus) or **4,096 tokens** (some models); KV-cache is held in memory, not stored at rest, and the feature is ZDR-eligible ([Anthropic prompt-caching docs](https://platform.claude.com/docs/en/build-with-claude/prompt-caching)).
- **Batching.** The Message Batches API gives a flat **50% discount on input + output** for up to 10,000 async queries processed within 24h — ideal for nightly drift/compliance scans and eval runs ([Anthropic — Message Batches API](https://www.anthropic.com/news/message-batches-api), [Anthropic batch docs](https://platform.claude.com/docs/en/build-with-claude/batch-processing)). Stacking batch (50%) with caching (read at 10%) can reduce cached system-prompt tokens to ~5% of standard pricing ([finout](https://www.finout.io/blog/anthropic-api-pricing)).
- **Context/token budgeting.** "More tokens makes agents worse" — token usage explains ~80% of performance variance, so trim context aggressively ([Anthropic](https://www.anthropic.com/engineering/multi-agent-research-system), [Anthropic — effective context engineering](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents), [Morph context engineering](https://www.morphllm.com/context-engineering)).
- **Routing** (see §5): 40–70% savings ([Morph](https://www.morphllm.com/llm-router)); local-first for the 70–80% routine slice ([Morph Ollama](https://www.morphllm.com/best-ollama-models)).
- **Sub-agent isolation.** Subagents run in **separate context windows**, explore with tens of thousands of tokens, but return only a distilled ~1,000–2,000-token summary to the lead agent — keeping the main context small. Caveat: **multi-agent systems use ~15× more tokens (and agents ~4× more) than chat**, so isolate only when value justifies it ([Anthropic — multi-agent research system](https://www.anthropic.com/engineering/multi-agent-research-system)).
- **Limit tool-call sprawl.** Tool-call frequency is a named driver of cost/variance alongside model choice; cap iterations and give precise tool descriptions ([Anthropic](https://www.anthropic.com/engineering/multi-agent-research-system)).

---

## Deliverable (i): Sensitivity-Based Routing Design

```
                ┌─────────────────────────────────────────────┐
   request ───▶ │  LOCAL sensitivity classifier (on-prem)     │
                │  • PAN/Luhn + PII/NER detectors (regex+model)│
                │  • source-system + data-tag lookup           │
                └───────────────┬──────────────┬──────────────┘
                                │              │
              sensitive / PCI / PII            │ non-sensitive
                                ▼              ▼
                   ┌────────────────────┐   ┌──────────────────────────┐
                   │ ON-PREM Ollama tier│   │ Tiered CLOUD router (§5)  │
                   │ egress = BLOCKED    │   │ small ▸ mid ▸ frontier    │
                   │ Qwen2.5-Coder 32B   │   │ + prompt cache + batch    │
                   └─────────┬──────────┘   └────────────┬─────────────┘
                             │                            │
                   ┌─────────▼────────────────────────────▼─────────┐
                   │ Immutable audit log: {req_id, label, tier,      │
                   │ egress=local|cloud}  +  network default-deny    │
                   └─────────────────────────────────────────────────┘
```

Boundary made verifiable by: (1) local classifier so the routing decision never leaves the perimeter; (2) network-level default-deny egress on the on-prem tier (enforced, not advisory); (3) per-request immutable audit record; (4) optional on-prem redaction path so frontier capability is available on de-identified text. Anchored in PCI architectural-isolation ([Sierra](https://sierra.ai/blog/payments)) and GDPR "documented architecture / data stays in-jurisdiction" guidance ([Seresa](https://seresa.io/blog/gdpr-international-data-transfers/data-residency-ai-inference-and-your-marketing-agency-a-compliance-checklist), [brics-econ](https://brics-econ.org/data-residency-considerations-for-global-llm-deployments)).

## Deliverable (ii): Recommended Local Model + Hardware Tier

**Primary recommendation: `qwen2.5-coder:32b` at `Q4_K_M` on a single 24 GB GPU (RTX 3090/4090 or equivalent).**

- Best *primary-sourced* open-source coder: SOTA among open models on EvalPlus/LiveCodeBench/BigCodeBench, ~92.7% HumanEval (Instruct), competitive with GPT-4o ([Qwen2.5-Coder Technical Report](https://arxiv.org/html/2409.12186v2), [Qwen blog](https://qwenlm.github.io/blog/qwen2.5-coder-family/)).
- Fits 24 GB at Q4_K_M with <1% benchmark loss ([CraftRigs](https://craftrigs.com/guides/qwen-2-5-coder-32b-hardware-guide/), [ToolHalla](https://toolhalla.ai/blog/qwen-25-coder-best-local-coding-llm-in-2026-setup-benchmarks)).
- Tiering on-prem: 7–8B (Llama 3.1 8B, 6–8 GB) for trivial mechanical edits; 32B as the workhorse; reserve a 70B/A100 only if eval shows the 32B failing on infra reasoning. Re-evaluate newer Qwen-Coder / DeepSeek / gpt-oss releases on [ollama.com/library](https://ollama.com/library) — but only after verifying claims, since 2026 round-ups cite **[UNVERIFIED]** forward-dated models.

## Deliverable (iii): Task → Model-Tier Routing Table

| Task type | Sensitivity | Recommended tier | Why / source |
|---|---|---|---|
| Anything touching CHD/PAN/PII (log triage, config w/ secrets, ticket bodies) | **High** | **On-prem Ollama (Qwen2.5-Coder 32B)** | PCI scope + GDPR transfer avoidance ([Sierra](https://sierra.ai/blog/payments), [Seresa](https://seresa.io/blog/gdpr-international-data-transfers/data-residency-ai-inference-and-your-marketing-agency-a-compliance-checklist)) |
| Mechanical edits, YAML lint/format, regex, rename, boilerplate | Low | Cloud **small/fast** (e.g. Haiku-class) or local 7–8B | Cheap-model floor ([MindStudio](https://www.mindstudio.ai/blog/set-up-ai-model-router-llm-stack-c2610), [Morph](https://www.morphllm.com/llm-router)) |
| Routine code/infra changes, summaries, classification | Low | Cloud **mid** or local 32B | 70–80% handled locally/cheaply ([Morph](https://www.morphllm.com/best-ollama-models)) |
| Architecture, multi-file planning, security/design review, incident RCA | Low (de-identified) | Cloud **frontier** (Opus/Sonnet-class) | Frontier pays off on high-value, multi-context work ([Anthropic](https://www.anthropic.com/engineering/multi-agent-research-system)) |
| Frontier capability needed but data is sensitive | High | **On-prem redact/tokenize → cloud frontier** | Isolation pattern ([Sierra](https://sierra.ai/blog/payments)) |
| Bulk async (nightly drift/compliance scans, eval runs) | per-content | Cloud **Batch API** (50% off) | [Anthropic Batches](https://www.anthropic.com/news/message-batches-api) |

## Deliverable (iv): Cost-Optimization Checklist

- [ ] **Route by difficulty** (cheap→frontier); target 40–70% savings ([Morph](https://www.morphllm.com/llm-router)); RouteLLM showed 95% GPT-4 quality at ~14% GPT-4 traffic ([LMSYS](https://www.lmsys.org/blog/2024-07-01-routellm/)).
- [ ] **Local-first for the 70–80% routine/privacy-sensitive slice** ([Morph](https://www.morphllm.com/best-ollama-models)).
- [ ] **Prompt caching** on stable system prompts/large context (read = 10% of input; ≥1,024 tokens to cache) ([Anthropic](https://platform.claude.com/docs/en/build-with-claude/prompt-caching)).
- [ ] **Batch API (50%)** for async/non-interactive jobs; stack with caching ([Anthropic](https://www.anthropic.com/news/message-batches-api), [finout](https://www.finout.io/blog/anthropic-api-pricing)).
- [ ] **Token-budget context** — usage explains ~80% of perf variance; trim aggressively ([Anthropic](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents)).
- [ ] **Cap tool-call iterations**; precise tool descriptions ([Anthropic](https://www.anthropic.com/engineering/multi-agent-research-system)).
- [ ] **Sub-agents only when value justifies** — they cost ~15× chat tokens; return distilled summaries ([Anthropic](https://www.anthropic.com/engineering/multi-agent-research-system)).
- [ ] **ZDR + DPA** on the cloud path; default-deny egress on the local path ([Seresa](https://seresa.io/blog/gdpr-international-data-transfers/data-residency-ai-inference-and-your-marketing-agency-a-compliance-checklist)).

---

## Sources

**PCI / GDPR / data residency**
- https://mitratech.com/resource-hub/blog/pci-third-party-service-provider-requirements/
- https://www.vikingcloud.com/blog/whos-responsible-navigating-pci-compliance-for-third-party-service-providers-tpsps-and-merchants
- https://www.tripwire.com/state-of-security/pci-dss-compliance-meeting-third-party-vendor-requirements
- https://pcidssguide.com/what-are-the-pci-dss-third-party-service-provider-management-requirements/
- https://sierra.ai/blog/payments
- https://seresa.io/blog/gdpr-international-data-transfers/data-residency-ai-inference-and-your-marketing-agency-a-compliance-checklist
- https://brics-econ.org/data-residency-considerations-for-global-llm-deployments

**Cloud LLM retention / ZDR**
- https://anarlog.so/blog/anthropic-data-retention-policy/
- https://www.datastudios.org/post/claude-data-retention-policies-storage-rules-and-compliance-overview
- https://ax-sentinel.com/blog/ai-data-retention-policies-compared
- https://abubakarsiddik.site/blog/zero-data-retention-llm-providers

**Local models / Ollama / hardware**
- https://www.morphllm.com/best-ollama-models
- https://localaimaster.com/models/best-local-ai-coding-models
- https://localaimaster.com/blog/best-ollama-models
- https://www.promptquorum.com/local-llms/top-open-source-models-ollama
- https://pinggy.io/blog/best_open_source_self_hosted_llms_for_coding/
- https://arxiv.org/html/2409.12186v2 (Qwen2.5-Coder Technical Report)
- https://qwenlm.github.io/blog/qwen2.5-coder-family/
- https://craftrigs.com/guides/qwen-2-5-coder-32b-hardware-guide/
- https://toolhalla.ai/blog/qwen-25-coder-best-local-coding-llm-in-2026-setup-benchmarks
- https://ucstrategies.com/news/qwen-2-5-coder-specs-benchmarks-hardware-requirements-2026/
- https://ollama.com/library

**Local-agent security / prompt injection**
- https://securiti.ai/llm01-owasp-prompt-injection/
- https://owasp.org/www-community/attacks/PromptInjection
- https://cheatsheetseries.owasp.org/cheatsheets/AI_Agent_Security_Cheat_Sheet.html
- https://cheatsheetseries.owasp.org/cheatsheets/LLM_Prompt_Injection_Prevention_Cheat_Sheet.html
- https://christian-schneider.net/blog/prompt-injection-agentic-amplification/
- https://dev.to/andremmfaria/when-chat-turns-into-control-security-lessons-from-running-a-local-ai-agent-21l0
- https://svitla.com/blog/owasp-vulnerabilities-llm/

**Model routing / cost optimization**
- https://www.morphllm.com/llm-router
- https://www.mindstudio.ai/blog/set-up-ai-model-router-llm-stack-c2610
- https://www.lmsys.org/blog/2024-07-01-routellm/
- https://github.com/lm-sys/routellm
- https://arxiv.org/pdf/2412.12170 (PickLLM)
- https://arxiv.org/pdf/2511.09873 (HierRouter)
- https://arxiv.org/html/2510.08439v1 (xRouter)
- https://platform.claude.com/docs/en/build-with-claude/prompt-caching
- https://www.anthropic.com/news/message-batches-api
- https://platform.claude.com/docs/en/build-with-claude/batch-processing
- https://www.finout.io/blog/anthropic-api-pricing
- https://www.anthropic.com/engineering/multi-agent-research-system
- https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents
- https://www.morphllm.com/context-engineering

> **Verification caveats:** Pricing multipliers, the 50% batch discount, and minimum-cacheable-token counts are from Anthropic primary docs/announcements and should still be re-checked at publish time. Forward-dated model names ("Qwen 3.6", "DeepSeek V4", "Kimi K2.6", "Opus 4.8", "gpt-oss") and the "55% on-prem" / "70–80% local" percentages come from secondary 2026 round-ups and are flagged **[UNVERIFIED]**. The Qwen2.5-Coder benchmarks, RouteLLM results, OWASP guidance, and Anthropic token-overhead figures are from primary/authoritative sources.
