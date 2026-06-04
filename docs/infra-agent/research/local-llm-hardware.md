# On-Premises Hardware for Local LLM Inference: AI DevOps/Infrastructure Agent

**Prepared:** 2026-06-03  
**Scope:** PCI-adjacent, air-gap-required, on-premises inference for a code/infra/YAML reasoning agent  
**Use case:** Log triage, config analysis, YAML/IaC generation, cardholder-data-adjacent tooling — requires native tool/function calling, long context (32K–128K tokens), and no cloud egress  

---

## Table of Contents

1. [Model → VRAM Sizing](#1-model--vram-sizing)
2. [GPU Comparison Table](#2-gpu-comparison-table)
3. [Throughput & Concurrency Realities](#3-throughput--concurrency-realities)
4. [Serving Stack Evaluation](#4-serving-stack-evaluation)
5. [Recommended Builds](#5-recommended-builds)
   - [PoC / Pilot Tier (~$3–8k)](#poc--pilot-tier-3-8k)
   - [Production Tier (~$15–50k+)](#production-tier-15-50k)
6. [Security & Placement Notes](#6-security--placement-notes)
7. [Sources](#7-sources)

---

## 1. Model → VRAM Sizing

### Background: How VRAM is Consumed

VRAM consumption breaks into three components:

1. **Model weights** — the dominant cost, determined by parameter count × bytes-per-weight (quantization level)
2. **KV cache** — grows with context length × batch size × number of layers; the primary variable for long-context agent workloads
3. **Activation overhead** — roughly 10–20% on top of weights; depends on batch size

**Rule of thumb for weights only:**

| Quantization | Bytes/param | Quality loss vs FP16 |
|---|---|---|
| Q4_K_M | ~0.50 B/param | ~3–5% perplexity regression |
| Q5_K_M | ~0.625 B/param | ~1–2% perplexity regression |
| Q8_0 | ~1.0 B/param | <1%; near-identical to FP16 |
| FP16 | ~2.0 B/param | baseline |
| FP8 | ~1.0 B/param | near-identical; CUDA 11.8+ only |

**For agent workloads: add 20–50% VRAM headroom over the weights floor for KV cache at 32K–128K context.** The numbers in the table below are *minimum to load the weights*; add headroom as noted.

### 7B–9B Models

| Model Example | Q4_K_M | Q5_K_M | Q8_0 | FP16 | Notes |
|---|---|---|---|---|---|
| Llama 3.1 8B / Qwen3 8B | ~5–6 GB | ~6.5 GB | ~8–9 GB | ~16–19 GB | Fits single 8GB GPU at Q4; RTX 4070 handles FP16 |
| **+32K ctx KV overhead** | +4–6 GB | +4–6 GB | +4–6 GB | +4–6 GB | At 32K ctx, budget 12–14 GB total for Q4 |
| **Recommended GPU** | RTX 4070 (12 GB) | RTX 4070 Ti (16 GB) | RTX 4080 (16 GB) | RTX 4090 (24 GB) | — |

Tool/function calling support: Llama 3.1/3.2 ✓ (vLLM `llama3_json` parser); Qwen3 ✓ (Hermes-style); Qwen2.5-Coder ✓

### 14B Models

| Model Example | Q4_K_M | Q5_K_M | Q8_0 | FP16 | Notes |
|---|---|---|---|---|---|
| Qwen3 14B / Qwen2.5-Coder 14B | ~8–9 GB | ~11 GB | ~14–15 GB | ~28 GB | Fits RTX 4070 Ti at Q4; Q8 needs 24 GB card |
| **+32K ctx KV overhead** | +6–8 GB | +6–8 GB | +6–8 GB | — | Budget 16–18 GB total for Q4 at 32K |
| **Recommended GPU** | RTX 4070 Ti (16 GB) | RTX 4080 (16 GB) | RTX 4090 (24 GB) | Dual RTX 4090 | — |

Tool/function calling support: Qwen3 14B ✓; Qwen2.5-Coder ✓

### 27B–34B Models (Dense)

| Model Example | Q4_K_M | Q5_K_M | Q8_0 | FP16 | Notes |
|---|---|---|---|---|---|
| Qwen3 32B / Qwen2.5-Coder 32B / DeepSeek-Coder-V2-Lite | ~18–20 GB | ~23–25 GB | ~30–34 GB | ~54–68 GB | Q4 needs 24 GB card with tight headroom; Q8 needs 48 GB |
| **+32K ctx KV overhead** | +8–12 GB | +8–12 GB | +8–12 GB | — | Budget 28–34 GB for Q4 at 32K: needs 48 GB card |
| **Recommended GPU** | RTX 6000 Ada / L40S (48 GB) | RTX 6000 Ada (48 GB) | RTX PRO 6000 Blackwell (96 GB) | 2× L40S (96 GB NVLink-free) | — |

**Tool/function calling:** Qwen2.5-Coder 32B ✓ (best local coder for agents per benchmarks); Qwen3 32B ✓

### 70B Models (Dense)

| Model Example | Q4_K_M | Q5_K_M | Q8_0 | FP16 | Notes |
|---|---|---|---|---|---|
| Llama 3.3 70B / Qwen3 72B | ~38–42 GB | ~50 GB | ~70–75 GB | ~140 GB | Q4 needs 48 GB GPU or 2× 24 GB; Q8 needs 80 GB or 2× 48 GB |
| **+32K ctx KV overhead** | +14–20 GB | — | — | — | Budget 55–65 GB total: needs 80 GB card or 2× 48 GB |
| **Recommended GPU** | A100 80GB / H100 80GB (single) or 2× L40S | — | 2× H100 | Not practical single-GPU | — |

**Tool/function calling:** Llama 3.3 70B ✓; Qwen3 72B ✓

### MoE Models (Mixture of Experts)

MoE models activate only a subset of parameters per token — reducing compute proportionally — but **all expert weights must reside in VRAM simultaneously**. KV cache behavior is similar to dense models of the active-parameter count, but the weight floor is determined by *total* parameters.

| Model | Total Params | Active Params/token | Q4_K_M VRAM (weights) | +32K ctx headroom | Notes |
|---|---|---|---|---|---|
| **Qwen3-30B-A3B** (MoE) | 30.5B | ~3.3B | ~18–19 GB | +4–6 GB (active layers only) | Efficient: KV cache sized to active params; fits single 24 GB GPU at Q4 with moderate context |
| **Qwen3-Coder 30B-A3B** | 30.5B | ~3.3B | ~18–19 GB | +4–6 GB | Strong coder + agent; available on Ollama; excellent PoC choice |
| **DeepSeek-V3 / V3.1** | 671B | 37B | ~404 GB (FP8) | — | Not runnable on a single workstation; requires 8× H100 or equivalent |
| **Qwen3-235B-A22B** | 235B | 22B | ~130–145 GB (Q4) | — | Needs 2× H100 80GB minimum; multi-node for comfortable headroom |

**Key insight:** For a single-box PoC, the **Qwen3-30B-A3B / Qwen3-Coder-30B-A3B MoE** is the most practical high-quality option — it delivers 30B-class reasoning at ~18 GB VRAM, well within a 24 GB consumer GPU.

### Tool/Function Calling: Model Family Summary

| Model Family | Native Tool Calling | Recommended Parser (vLLM) | Agent-Readiness |
|---|---|---|---|
| **Qwen3 / Qwen3-Coder** | ✓ Strong | `hermes` | Excellent; Qwen-Agent framework purpose-built for agents |
| **Qwen2.5-Coder 32B** | ✓ Strong | `hermes` | Excellent for code/infra; EvalPlus-topping open model |
| **Llama 3.1 / 3.2 / 3.3** | ✓ Good | `llama3_json` | Good; no parallel calls in Llama 3.x |
| **Llama 4** | ✓ Good | `llama4_pythonic` | Good; parallel calls supported |
| **Mistral / Mixtral** | ✓ Partial | `mistral` | Struggles with parallel calls; template required |
| **DeepSeek-V3 / Coder** | ⚠ Limited | `deepseek_v3` | Multi-turn function calling weak; better for single-turn |
| **Granite 3.1+ (IBM)** | ✓ Good | `granite` | Supports parallel calls; underrated for enterprise |

**Critical note:** vLLM's `tool_choice="auto"` does not enforce strict JSON schema — arguments can be malformed. For production agents, use `tool_choice="required"` or named function calling to guarantee valid JSON output. Qwen3 with the Hermes parser is currently the most reliable for production agent use.

---

## 2. GPU Comparison Table

> **Price caveats:** Consumer GPUs (RTX series) are subject to market fluctuation; prices below reflect approximate mid-2026 street prices. Professional/datacenter cards are sold through OEM channels; street prices vary. All prices USD. Items marked **[UNVERIFIED]** could not be confirmed from primary or multiple reputable sources.

| GPU | VRAM | Bandwidth | TDP | ECC | NVLink | Est. Street Price (mid-2026) | Best For | Limitations |
|---|---|---|---|---|---|---|---|---|
| **RTX 4090** | 24 GB GDDR6X | ~1,008 GB/s | 450W | ✗ | ✗ | $1,700–2,000 | PoC; 7–14B models at Q8; 30B MoE at Q4 | No ECC; no NVLink; consumer warranty |
| **RTX 5090** | 32 GB GDDR7 | ~1,792 GB/s | 575W | ✗ | ✗ | $2,000–3,200 (MSRP $1,999; market premium) | PoC; 7–14B FP16; 30B MoE Q5; ~35% faster than 4090 | No ECC; no NVLink; supply constrained |
| **RTX 6000 Ada** | 48 GB GDDR6 ECC | ~960 GB/s | 300W | ✓ | ✓ (1× bridge) | $6,800–7,400 | 32B dense Q8; 70B Q4 with tight headroom; professional workstation | Ada-gen bandwidth; lower than H100 |
| **RTX PRO 6000 Blackwell** | 96 GB GDDR7 ECC | ~1,792 GB/s | 600W | ✓ | ✗ (PCIe 5.0 only) | $8,500–9,200 | 70B Q8 comfortably; 32B FP16; largest workstation VRAM available | No NVLink — cannot pair for tensor parallel; high TDP |
| **L40S** | 48 GB GDDR6 ECC | 864 GB/s | 350W | ✓ | ✗ | $7,500–10,000 | Production inference 7–70B; rack-mount; passive cooling | No NVLink; no MIG; lower bandwidth than H100 |
| **A100 40GB PCIe** | 40 GB HBM2 | ~1,555 GB/s | 250W | ✓ | ✓ | $5,000–9,000 (used) | Up to 32B dense Q8; solid bandwidth for batched inference | 40 GB limit prevents 70B without multi-GPU |
| **A100 80GB PCIe/SXM** | 80 GB HBM2e | ~2,000 GB/s | 300–400W | ✓ | ✓ | $7,000–15,000 (new); $4,000–9,000 (used) | 70B Q4 comfortably on single GPU; multi-GPU NVLink for 70B Q8 | Ampere-gen; H100 is 40–60% faster |
| **H100 80GB PCIe** | 80 GB HBM3 | ~2,000 GB/s (PCIe) | 350W | ✓ | ✓ | $25,000–33,000 | Production 70B; training; highest reliability; MIG support | Expensive; PCIe version lower BW than SXM |
| **H100 80GB SXM** | 80 GB HBM3 | ~3,350 GB/s | 700W | ✓ | ✓ | $30,000–38,000 | Fastest single-GPU inference available; training | Requires HGX baseboard; not field-installable |
| **Apple M4 Max** (Mac Studio/MBP) | 128 GB unified | ~400–500 GB/s | ~100–150W system | n/a | n/a | $3,999–5,199 (system) | Up to 70B Q4; silent; power-efficient; macOS only | Not x86/Linux; no CUDA; MLX only for best perf |
| **Apple M3 Ultra** (Mac Studio) | 192 GB unified | ~800 GB/s | ~150–200W system | n/a | n/a | $3,999+ (system, M3 Ultra) | 70B–120B models; unique capacity/watt ratio; macOS only | **M4 Ultra does not exist** (Apple skipped); M3 Ultra is max-capacity Apple Silicon |

### Important Hardware Notes

- **RTX 5090:** No ECC memory (no error correction for bit flips) and no NVLink. For a PCI/security-sensitive environment, the lack of ECC is a meaningful risk for 24/7 production use but acceptable for PoC.
- **RTX PRO 6000 Blackwell:** Has ECC and 96 GB — the largest single workstation GPU available as of mid-2026 — but **no NVLink**. Two cards cannot be combined for tensor parallel; they operate independently. PCIe 5.0 only.
- **L40S:** PCIe passive-cooled, NEBS Level 3 ready, rack-mountable. Lacks NVLink and MIG. Good for standard rack inference servers.
- **A100 (used market):** Secondary market flooded as enterprises upgrade to H100/H200 (mid-2026). A used A100 80GB can be found for $4,000–9,000 — outstanding value for production inference.
- **M4 Ultra:** Does **not exist**. Apple skipped the Ultra tier for M4. The maximum-capacity Apple Silicon option is M3 Ultra at 192 GB unified memory, or M4 Max at 128 GB.
- **Apple Silicon for PCI-scope:** Mac hardware runs macOS. Placing a Mac in a hardened PCI network zone requires macOS hardening, MDM enrollment considerations, and Apple's update delivery architecture — which may conflict with egress-blocked zones. Consult your QSA.

---

## 3. Throughput & Concurrency Realities

### Single-User (Interactive) Performance

Tokens per second values for batch-size-1 (interactive agent, one request at a time):

| GPU | 7–8B Q4 | 14B Q4 | 32B Q4 | 70B Q4 | Engine |
|---|---|---|---|---|---|
| RTX 4090 (24 GB) | ~120–167 tok/s | ~65–80 tok/s | ~35–45 tok/s | cannot fit single GPU | Ollama/llama.cpp |
| RTX 5090 (32 GB) | ~165–253 tok/s | ~90–110 tok/s | ~55–70 tok/s | cannot fit single GPU | Ollama/llama.cpp |
| RTX 6000 Ada (48 GB) | ~100–140 tok/s | ~70–90 tok/s | ~45–60 tok/s | ~20–30 tok/s | vLLM |
| RTX PRO 6000 Blackwell (96 GB) | ~200+ tok/s | ~140+ tok/s | ~80–100 tok/s | ~40–55 tok/s [UNVERIFIED — no published benchmarks found] | vLLM |
| L40S (48 GB) | ~43 tok/s (batch-1) → 325 tok/s (batch-8) | ~30–45 tok/s | ~20–30 tok/s | ~10–15 tok/s | vLLM |
| A100 80GB | ~90–120 tok/s | ~60–80 tok/s | ~35–50 tok/s | ~25–35 tok/s | vLLM |
| H100 80GB PCIe | ~130–160 tok/s | ~80–100 tok/s | ~55–70 tok/s | ~40–55 tok/s | vLLM |
| M4 Max 128GB | ~55–65 tok/s (14B) | ~55–65 tok/s | ~30–40 tok/s | ~15–18 tok/s | MLX |
| M3 Ultra 192GB | — | — | — | ~25–30 tok/s | MLX |

> **Reasoning models (e.g., QwQ-32B, DeepSeek-R1):** Chain-of-thought models generate 3–10× more tokens per response before outputting an answer. Expect effective response times to be significantly longer. Do not use reasoning models for latency-sensitive interactive pipelines without streaming.

### Concurrency and Multi-Session Performance

| Scenario | Ollama | vLLM | Notes |
|---|---|---|---|
| 1 concurrent session | 65–167 tok/s (7–8B) | 140+ tok/s | Ollama competitive for single-user |
| 10 concurrent sessions | ~150 tok/s total (sequential queuing) | ~600–800 tok/s total | vLLM's continuous batching dominates |
| Peak throughput (256 concurrent) | ~41 tok/s (degrades heavily) | ~793 tok/s | Red Hat benchmark, A100 40GB, Llama 3.1 8B |
| P99 TTFT at peak concurrency | 673 ms | <50 ms stable | Ollama tail latency explodes under load |

**Bottom line:** For a **single agent instance** (one pipeline, one session at a time), Ollama is perfectly adequate. For **multiple concurrent agent pipelines** — e.g., several CI jobs running simultaneously, or a team using the agent — vLLM is essential.

### When to Use Batching

- **Ollama:** Simple, single-user serving. No production batching. Good for developer desktops, PoC.
- **vLLM:** Continuous batching via PagedAttention. Required for >2 concurrent sessions, production SLA, or log triage pipelines that generate many parallel requests.

---

## 4. Serving Stack Evaluation

### Comparison: Ollama vs vLLM vs TGI vs LM Studio

| Capability | Ollama | vLLM | TGI | LM Studio |
|---|---|---|---|---|
| **Tool/function calling** | ✓ (limited model list) | ✓ (broad; `--enable-auto-tool-choice`) | ✓ (limited) | ✓ (basic) |
| **OpenAI-compatible API** | ✓ (`/v1/chat/completions`) | ✓ (fully compatible) | ✓ | ✓ |
| **Concurrent request batching** | ✗ (sequential) | ✓ (continuous batching, PagedAttention) | ✓ (limited) | ✗ |
| **Multi-GPU tensor parallel** | ✗ | ✓ | ✓ | ✗ |
| **Air-gap / offline install** | ✓ (binary + GGUF transfer) | ✓ (pip offline wheels + model dir) | ✓ (Docker export) | ✓ |
| **Production hardening** | ✗ (no auth, no rate limiting natively) | ✓ (add nginx/gateway) | ✓ | ✗ |
| **Model format** | GGUF (llama.cpp backend) | Safetensors/HF (CUDA) | Safetensors/HF | GGUF/MLX |
| **Ease of setup** | ★★★★★ | ★★★☆☆ | ★★★☆☆ | ★★★★★ |
| **Status** | Active | Active (production standard) | **Maintenance mode (Dec 2025)** — HF recommends vLLM or SGLang instead | Active (desktop only) |

### Recommendation for This Use Case

**vLLM is the correct choice for production.** Reasons:
- Native tool-call parsing for Qwen3/Llama/Mistral with `--enable-auto-tool-choice`
- Continuous batching handles concurrent agent pipelines (CI, multiple users)
- OpenAI Python client works unchanged with `base_url="http://localhost:8000/v1"`
- Air-gapped install: `pip download vllm --dest ./offline_pkgs` on internet machine → transfer → `pip install --no-index --find-links=./offline_pkgs vllm`; set `HF_HUB_OFFLINE=1`
- vLLM is the fastest-evolving open inference engine; TGI is now maintenance-only

**Ollama is acceptable for PoC/dev.** It is simpler to install (single binary + GGUF) and handles single-user agentic use fine. If the PoC will have only one engineer running one agent at a time, Ollama suffices and reduces deployment complexity. Migrate to vLLM before production.

**Do not deploy TGI for new workloads.** Hugging Face moved TGI to maintenance mode on 2025-12-11.

**LM Studio** is a GUI desktop tool — not suitable for server/headless deployment.

### Key vLLM Configuration for Production Agent Use

```bash
# Start vLLM with tool calling enabled for Qwen3
vllm serve Qwen/Qwen3-30B-A3B-Instruct \
  --enable-auto-tool-choice \
  --tool-call-parser hermes \
  --max-model-len 32768 \
  --gpu-memory-utilization 0.90 \
  --port 8000

# Air-gap: set before starting
export HF_HUB_OFFLINE=1
export TRANSFORMERS_OFFLINE=1
```

For strict agent use, prefer `tool_choice="required"` over `"auto"` to guarantee the model invokes tools when expected, and validate output JSON against your tool schemas in your agent framework.

---

## 5. Recommended Builds

### PoC / Pilot Tier ($3–8k)

**Goal:** One engineer, one agent pipeline at a time, sensitive-but-not-yet-certified environment. Validate feasibility before production procurement.

#### Recommended Model: Qwen3-Coder-30B-A3B (MoE)

- 30B total params, only 3.3B active per token — strong coding/infra reasoning at low compute cost
- Native tool calling (Hermes-style; works in both Ollama and vLLM)
- 128K native context window (usable for long log files, large configs)
- Fits in 24 GB VRAM at Q4_K_M (~18–19 GB weights + ~5 GB KV at 32K context)
- Available via `ollama pull qwen3-coder:30b` and as GGUF/safetensors for offline transfer

#### PoC Hardware Build (near-BOM)

| Component | Spec | Est. Price |
|---|---|---|
| **GPU** | NVIDIA GeForce RTX 5090 (32 GB GDDR7) — Founders Edition or AIB | ~$2,000–3,200 |
| **CPU** | AMD Ryzen 9 7950X (16-core) or Intel Core i9-14900K | ~$500–700 |
| **Motherboard** | PCIe 5.0 x16 ATX (e.g., ASUS ProArt X670E Creator) | ~$350–500 |
| **RAM** | 64 GB DDR5-5600 (2× 32 GB) | ~$150–200 |
| **NVMe Storage** | 2 TB PCIe Gen 4 NVMe (Samsung 990 Pro or WD SN850X) | ~$120–180 |
| **PSU** | 1000W 80+ Gold fully-modular (RTX 5090 TDP is 575W) | ~$120–180 |
| **Case** | Mid-tower ATX with good airflow (Fractal Design Torrent or similar) | ~$100–150 |
| **OS** | Ubuntu Server 22.04 LTS (or Rocky Linux 9) | Free |
| **Total est.** | | **~$3,350–5,100** |

> Add ~$200–400 for a UPS (APC Smart-UPS 1500VA) if this box will sit in a server room.

**Why RTX 5090 over RTX 4090?**
- 32 GB vs 24 GB: gives headroom for 30B MoE at Q5_K_M (better quality) or 70B Q4 with CPU offload experimentation
- 78% higher memory bandwidth (1.79 TB/s vs ~1 TB/s) → ~35% faster token generation
- Only ~$200–600 more than current RTX 4090 street prices
- Caveat: No ECC, no NVLink — acceptable for PoC, not for 24/7 production

**Serving Stack for PoC:** Start with **Ollama** for simplicity. When concurrency or production API hardening is needed, switch to **vLLM** on the same box.

**Expected Performance (RTX 5090 + Qwen3-Coder-30B-A3B Q4_K_M):**
- ~70–90 tok/s single-session (estimated; no published RTX 5090 + Qwen3-30B benchmark found — [UNVERIFIED exact figure])
- Adequate for interactive agent use and non-realtime log triage

---

### Production Tier ($15–50k+)

**Goal:** Multiple concurrent agent pipelines, team-wide use, hardened network zone, 24/7 reliability, PCI-adjacent compliance posture.

#### Recommended Model: Qwen2.5-Coder-32B-Instruct (dense) or Qwen3-Coder-30B-A3B (MoE)

- **Qwen2.5-Coder-32B-Instruct** is the benchmark-leading open code model for production: tops EvalPlus, LiveCodeBench, BigCodeBench; comparable to GPT-4o on Aider; strong tool calling
- At Q4_K_M (~19 GB weights) on a 48 GB GPU, leaves ~29 GB for KV cache → supports 64K+ context with batch-4
- Alternatively, **Qwen3-Coder-30B-A3B** (MoE) for better inference efficiency and long-horizon agentic RL training

#### Production Build Option A: Single-Node, Dual L40S (Recommended)

| Component | Spec | Est. Price |
|---|---|---|
| **Server chassis** | 4U rack server (e.g., Supermicro SYS-420GP-TNR or Dell PowerEdge R750xa) | ~$3,000–5,000 (chassis + mobo) |
| **CPU** | Dual AMD EPYC 9354 (16-core each) or Intel Xeon Gold 6448Y | ~$4,000–6,000 (pair) |
| **RAM** | 256 GB DDR5 ECC RDIMM (16× 16 GB or 8× 32 GB) | ~$1,500–2,500 |
| **GPU** | 2× NVIDIA L40S 48 GB PCIe (96 GB total) | ~$15,000–20,000 |
| **NVMe Storage** | 4 TB U.2/PCIe NVMe RAID-1 pair | ~$600–1,000 |
| **PSU** | Redundant 3000W (required for 2× 350W GPUs + server components) | Included in server chassis |
| **IPMI/BMC** | iDRAC / iLO / IPMI (built-in for remote management) | Included |
| **OS** | RHEL 9 or Rocky Linux 9 (FIPS-140-2 module available) | ~$0–1,400/yr |
| **Total est.** | | **~$24,000–35,000** |

**Why dual L40S?**
- 96 GB total VRAM across two independent GPUs (no NVLink needed for independent model serving)
- vLLM can run two model replicas (one per GPU) for horizontal scaling — doubles concurrent request capacity
- Or run one 70B Q4_K_M model split across both GPUs via vLLM tensor parallel
- ECC memory for 24/7 reliability
- PCIe passive cooling; NEBS Level 3 ready; fits standard data center racks
- L40S is purpose-built for inference (Ada Lovelace architecture, FP8 Transformer Engine)
- Purchase price ~$7,500–10,000/each — significantly cheaper than A100 or H100

**Expected Performance (Dual L40S, vLLM, Qwen2.5-Coder-32B Q4_K_M):**
- Single GPU: ~50–70 tok/s per session
- With continuous batching: 4–8 concurrent agent sessions with acceptable latency
- 2 GPU replicas: effectively 8–16 concurrent sessions
- P99 TTFT well under 200 ms at moderate concurrency

#### Production Build Option B: Single A100 80GB (Budget Production)

If the L40S dual-GPU build exceeds budget, a **used A100 80GB** is an outstanding value play in mid-2026:

| Component | Spec | Est. Price |
|---|---|---|
| **GPU** | NVIDIA A100 80GB PCIe (used/refurbished) | ~$4,000–9,000 |
| **Server** | 2U rack server (Supermicro or Dell) with ECC RAM, IPMI | ~$4,000–6,000 |
| **CPU + RAM** | Xeon Gold + 128 GB ECC DDR4 | ~$2,000–3,000 |
| **Storage** | 2 TB NVMe | ~$200 |
| **Total est.** | | **~$10,000–18,000** |

Runs Qwen2.5-Coder-32B at Q8_0 (30 GB), leaving 50 GB for KV cache — handles long contexts and moderate concurrency well.

#### HA Considerations for Production

- **Redundancy:** Two-node setup (each with one GPU) with a load balancer (nginx, Traefik, or Envoy) in front distributes requests and provides failover
- **Model storage:** Shared NAS or replicated NVMe — models are large (18–40 GB), store once and serve from both nodes
- **Monitoring:** Prometheus + Grafana; vLLM exposes `/metrics` endpoint natively
- **Remote management:** IPMI/iDRAC/iLO for out-of-band access without internet (KVM-over-IP to management VLAN)
- **Upgrade path:** Dual L40S → add second identical node → horizontal scale; or upgrade to H100 when budget allows

---

## 6. Security & Placement Notes

### PCI DSS 4.0 Scope Implications

PCI DSS 4.0 became mandatory on 2025-03-31 (v3.2.1 retired). An LLM inference server that processes, stores, or transmits cardholder data — or that **could affect the security of the CDE** — is in scope as a system component. Key implications:

- **Requirement 1 (Network segmentation):** The LLM server must be in a segmented network zone. Firewall rules must prevent traffic from the CDE reaching the LLM server unless explicitly required and controlled. If the agent receives logs/configs containing PANs, the inference server is in CDE scope.
- **Requirement 3 (Data at rest):** Prompts, logs, and outputs stored on disk must be encrypted if they contain cardholder data. Use LUKS full-disk encryption or filesystem-level encryption.
- **Requirement 4 (Data in transit):** All API calls to the LLM server (from agents, CI pipelines) must use TLS 1.2+. vLLM/Ollama do not enable TLS natively — place an nginx or Envoy reverse proxy with mutual TLS in front.
- **Requirement 6 (Vulnerability management):** Authenticated vulnerability scanning required. Offline patching via air-gap transfer: `apt download` / `dnf download` packages on a connected staging machine → sign and transfer via approved process → apply in maintenance window.
- **Requirement 10 (Logging):** All API requests and responses must be logged. vLLM's access logs capture request metadata; ensure logs do not include raw prompt content with PANs. Route logs to your SIEM via syslog (no internet required).
- **Requirement 12 (Incident response):** Document a procedure to disable the LLM server if it exhibits anomalous behavior (prompt injection, data exfiltration attempts). Maintain a documented process to isolate and shut down.

### Practical Air-Gap Operations

| Operation | Method in Egress-Blocked Zone |
|---|---|
| **Initial OS install** | USB/PXE from internal mirror |
| **CUDA / GPU driver install** | Download NVIDIA runfile installer offline; transfer via approved media |
| **vLLM install** | `pip download vllm --dest ./offline` on internet machine → encrypt + transfer → `pip install --no-index` |
| **Ollama install** | Download binary + install.sh on internet machine → transfer GGUF model file → run locally |
| **Model weights** | Download safetensors/GGUF on internet-connected staging → checksum verify (SHA-256) → transfer via approved channel |
| **OS security patches** | Internal DNF/APT mirror (e.g., Red Hat Satellite, Ubuntu Landscape) — critical for PCI Req 6 |
| **Monitoring/alerting** | Internal Prometheus + Grafana; SIEM via internal syslog; no outbound connections needed |

### OS Hardening Checklist

- Use RHEL 9 / Rocky Linux 9 with FIPS-140-2 module enabled (cryptographic compliance)
- Disable all unnecessary services, ports, and user accounts (minimize attack surface per PCI Req 2)
- Enable SELinux (enforcing mode) or AppArmor
- Use `firewalld` to allowlist only required ports (typically 8000 for vLLM API, 22 for SSH from jump host)
- SSH: key-based only, no password auth, disable root login, restrict to management VLAN
- Audit all model load events and API calls via auditd + vLLM access logs
- No outbound internet access — enforce at network layer AND host-level firewall
- Pin vLLM/Ollama versions; never use `:latest` Docker tags in production; test updates in staging before production deployment

### Prompt Injection Defense

In a PCI-adjacent environment, treat all prompt inputs as untrusted:
- Validate and sanitize log content before including in prompts — strip or redact PANs at the agent layer before sending to the LLM
- Use vLLM's `--disable-custom-chat-templates` flag to prevent template injection
- Do not include raw card numbers, CVVs, or full PANs in any prompt; use tokenized or masked values
- Implement output filtering: scan LLM responses for PAN patterns (regex) before forwarding downstream

---

## 7. Sources

### Primary / Vendor Sources

- [NVIDIA RTX 6000 Ada Generation](https://www.nvidia.com/en-us/products/workstations/rtx-6000/) — nvidia.com
- [NVIDIA RTX PRO 6000 Blackwell Workstation Edition](https://www.nvidia.com/en-us/products/workstations/professional-desktop-gpus/rtx-pro-6000/) — nvidia.com
- [NVIDIA L40S GPU](https://www.nvidia.com/en-us/data-center/l40s/) — nvidia.com
- [vLLM Tool Calling Documentation](https://docs.vllm.ai/en/latest/features/tool_calling/) — docs.vllm.ai
- [Ollama Tool Support Blog](https://ollama.com/blog/tool-support) — ollama.com
- [PCI SSC: AI Principles for Payment Environments](https://blog.pcisecuritystandards.org/ai-principles-securing-the-use-of-ai-in-payment-environments) — pcisecuritystandards.org
- [Qwen3-Coder GitHub](https://github.com/QwenLM/Qwen3-Coder) — github.com/QwenLM
- [Qwen3-30B-A3B-Instruct on Hugging Face](https://huggingface.co/Qwen/Qwen3-30B-A3B-Instruct-2507) — huggingface.co
- [TGI Maintenance Mode — Hugging Face LinkedIn](https://www.linkedin.com/posts/lysandredebut_text-generation-inference-is-now-in-maintenance-activity-7404903648062885888-WK42) — linkedin.com (HF team)

### GPU Pricing & Specs

- [RTX PRO 6000 Blackwell Pricing — Thunder Compute](https://www.thundercompute.com/blog/nvidia-rtx-pro-6000-pricing) — June 2026
- [RTX 5090 Specs & AI Benchmarks — RunPod](https://www.runpod.io/articles/guides/nvidia-rtx-5090)
- [RTX 5090 vs RTX 4090 Benchmarks for AI — BIZON](https://bizon-tech.com/blog/nvidia-rtx-5090-comparison-gpu-benchmarks-for-ai)
- [RTX 6000 Ada Price History — Pangoly](https://pangoly.com/en/price-history/pny-nvidia-quadro-rtx-6000-ada)
- [L40S Specs & Production Suitability — Fluence](https://www.fluence.network/blog/nvidia-l40s/)
- [L40S for AI Inference — Spheron](https://www.spheron.network/blog/nvidia-l40s-for-ai-inference/)
- [A100 80GB Price 2026 — DirectMacro](https://directmacro.com/blog/post/nvidia-a100-in-2025)
- [H100 GPU Cost 2026 — CloudZero](https://www.cloudzero.com/blog/h100-gpu-cost/)
- [Best NVIDIA GPUs for LLMs 2026 — Spheron](https://www.spheron.network/blog/best-nvidia-gpus-for-llms/)

### VRAM & Model Sizing

- [VRAM Cheat Sheet for Local LLMs — InsiderLLM](https://insiderllm.com/guides/vram-requirements-local-llms/)
- [Qwen3 Hardware Requirements — Hardware Corner](https://www.hardware-corner.net/guides/qwen3-hardware-requirements/)
- [Local LLM Hardware Guide 2026 — PromptQuorum](https://www.promptquorum.com/local-llms/local-llm-hardware-guide-2026)
- [Qwen3-30B-A3B VRAM — apxml.com](https://apxml.com/models/qwen3-30b-a3b)
- [Qwen3-235B-A22B VRAM — apxml.com](https://apxml.com/models/qwen3-235b-a22b)
- [DeepSeek V3 Local Deployment — SitePoint](https://www.sitepoint.com/deepseek-v3-complete-guide-deploy-and-optimize-local-ai-in-2026/)

### Throughput & Serving Stack

- [Ollama vs vLLM Deep Dive Benchmarking — Red Hat Developer](https://developers.redhat.com/articles/2025/08/08/ollama-vs-vllm-deep-dive-performance-benchmarking) — August 2025; A100 40GB; Llama 3.1 8B
- [vLLM vs Ollama vs LM Studio 2026 Production Benchmark — Codersera](https://codersera.com/blog/vllm-vs-ollama-vs-lm-studio-production-2026/)
- [Ollama vs vLLM Throughput — Markaicode](https://markaicode.com/ollama-vs-vllm-performance/)
- [Air-Gapped AI Stack: Ollama vs vLLM vs LocalAI — Markaicode](https://markaicode.com/best/air-gapped-ai-stack/)
- [vLLM Air-Gapped Installation Guide — Medium/Dinesh R](https://dineshr1493.medium.com/getting-started-with-vllm-installation-setup-inference-online-air-gapped-5522fed5fbd9)

### Apple Silicon

- [M4 Max and M3 Ultra for Local LLMs — InsiderLLM](https://insiderllm.com/guides/m4-max-ultra-local-llms-apple-silicon/)
- [Best Mac for Local AI 2026 — Local AI Master](https://localaimaster.com/blog/apple-silicon-ai-buying-guide)

### PCI / Security

- [AI and PCI Compliance 2026 — Very Good Security](https://www.verygoodsecurity.com/blog/posts/ai-and-pci-compliance-what-every-company-needs-to-know-in-2026)
- [PCI DSS Network Segmentation 2025 — Scrut](https://www.scrut.io/hub/pci-dss/pci-dss-network-segmentation)
- [PCI DSS and the AI Agent Era — jPOS](https://jpos.org/blog/pci-ai-agent-era/)

---

*Report generated 2026-06-03. GPU prices and model availability change rapidly; verify before procurement. Items marked [UNVERIFIED] could not be confirmed from primary or multiple reputable independent sources.*
