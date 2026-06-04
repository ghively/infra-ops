# ECC Context Engineering & Local Ollama Routing
## Research for Infra Agent

---

## Part 1 — Context-Engineering Playbook

ECC encodes five concrete mechanisms for keeping context lean and pressure-managed.
Each is cited against the real source file.

---

### Technique 1 — Trigger-Table Lazy Loading

**Source:** `skills/strategic-compact/SKILL.md:101-110`

Instead of loading every skill at session start, a trigger table maps keyword
signals to skill paths. Skills are loaded **only when triggered**:

```
| Trigger                       | Skill              | Load When                    |
|-------------------------------|--------------------|------------------------------|
| "test", "tdd", "coverage"     | tdd-workflow       | User mentions testing        |
| "security", "auth", "xss"     | security-review    | Security-related work        |
| "deploy", "ci/cd"             | deployment-patterns| Deployment context           |
```

The skill itself describes the gain: *"reducing baseline context by 50%+"*
(`skills/strategic-compact/SKILL.md:102`). Each loaded skill adds 1–5 K tokens
(`skills/context-budget/SKILL.md:33-35`), so loading 20 vs 5 skills costs a
~75 K token spread before a single user message is exchanged.

**For the infra agent:** maintain a `TRIGGER_MAP` object in the agent's system
prompt. Before expanding any skill, check whether the current task keyword
matches a trigger. Load only the matched skill file.

---

### Technique 2 — `paths:` Frontmatter Rule Scoping

**Source:** `rules/golang/coding-style.md:1-6`, `rules/typescript/coding-style.md:1-7`

Every language-specific rule file opens with a YAML `paths:` block:

```yaml
# rules/golang/coding-style.md:1-6
---
paths:
  - "**/*.go"
  - "**/go.mod"
  - "**/go.sum"
---
```

```yaml
# rules/typescript/coding-style.md:1-7
---
paths:
  - "**/*.ts"
  - "**/*.tsx"
  - "**/*.js"
  - "**/*.jsx"
---
```

The harness evaluates these globs against the current working tree and injects
the rule **only when a matching file is in scope**. The deep-dive confirms:
*"Every file carries a YAML frontmatter `paths:` block that scopes it to file
globs"* (`docs/deep-dive/04-rules.md:46`). Rules outside the glob are never
loaded into the context window at all.

**For the infra agent:** scope infra-specific rules (Terraform, Ansible, YAML
lint) to `**/*.tf`, `**/*.hcl`, `**/ansible/**` globs. This prevents 10+ rule
files from loading on a pure Python session.

---

### Technique 3 — Hook-Based Context Pressure Detection (`ecc-context-monitor.js`)

**Source:** `scripts/hooks/ecc-context-monitor.js`

This PostToolUse hook reads a bridge file written by `ecc-metrics-bridge.js`
and emits structured `additionalContext` warnings when thresholds are crossed.

Thresholds (`ecc-context-monitor.js:19-26`):
```js
const CONTEXT_WARNING_PCT = 35;    // warn at 35% remaining
const CONTEXT_CRITICAL_PCT = 25;   // critical at 25% remaining
const COST_NOTICE_USD = 5;
const COST_WARNING_USD = 10;
const COST_CRITICAL_USD = 50;
const FILES_WARNING_COUNT = 20;    // scope creep: 20+ files modified
const LOOP_THRESHOLD = 3;          // tool loop: same tool+hash ≥3 times
```

Warning injection (`ecc-context-monitor.js:247-254`):
```js
const output = {
  hookSpecificOutput: {
    hookEventName: 'PostToolUse',
    additionalContext: message
  }
};
return JSON.stringify(output);
```

Messages are debounced (at most one warning per `DEBOUNCE_CALLS=5` tool calls)
to avoid spam, but severity escalation (to `critical`) bypasses the debounce
(`ecc-context-monitor.js:228-234`).

Loop detection (`ecc-context-monitor.js:96-111`) hashes `tool + arguments` and
counts repeats in the recent-tools ring buffer — catches stuck Read/Grep loops
that silently exhaust context without progress.

**For the infra agent:** wire this hook via PostToolUse. The agent will receive
`CONTEXT WARNING: 30% remaining` before it hits a hard limit, giving it time to
compact or hand off.

---

### Technique 4 — Strategic Compact Suggestions (`suggest-compact.js`)

**Source:** `scripts/hooks/suggest-compact.js`

This PreToolUse hook counts tool invocations per session (file-backed counter
keyed on `session_id`) and emits a suggestion at configurable thresholds:

```js
// suggest-compact.js:89-93
if (count === threshold) {
  const msg = `[StrategicCompact] ${threshold} tool calls reached - consider /compact if transitioning phases`;
  output({ hookSpecificOutput: { hookEventName: 'PreToolUse', additionalContext: msg } });
}
// suggest-compact.js:96-99
if (count > threshold && (count - threshold) % 25 === 0) {
  const msg = `[StrategicCompact] ${count} tool calls - good checkpoint for /compact if context is stale`;
  output(…);
}
```

Default threshold: 50 tool calls (env `COMPACT_THRESHOLD`). The suggestion is
advisory, not blocking — the hook always exits 0.

The companion `pre-compact.js` writes a compaction-log entry and annotates any
active session `.tmp` file before the summarization occurs, preserving a
timestamp trail (`scripts/hooks/pre-compact.js:30-39`).

The `skills/strategic-compact/SKILL.md:69-76` provides a phase-transition
decision table to guide *when* compaction is cost-effective:

```
| Phase Transition         | Compact? | Why                                      |
|--------------------------|----------|------------------------------------------|
| Research → Planning      | Yes      | Research context is bulky                |
| Planning → Implementation| Yes      | Plan is in TodoWrite; free context        |
| Mid-implementation       | No       | Losing variable names and partial state  |
| After a failed approach  | Yes      | Clear dead-end reasoning                 |
```

**For the infra agent:** trigger compact after `ansible-plan → terraform-apply`
phase boundaries. Do not compact mid-apply when partial state is critical.

---

### Technique 5 — Subagent Isolation for Context Segregation

**Source:** `agents/planner.md:1-5`, `agents/code-reviewer.md:1-5`,
`agents/security-reviewer.md:1-5`

Every ECC specialist agent declares a minimal `tools:` whitelist in frontmatter,
confining the agent's context to only the tools it needs:

```yaml
# agents/planner.md:1-5
---
name: planner
tools: ["Read", "Grep", "Glob"]
model: opus
---
```

```yaml
# agents/code-reviewer.md:1-5
---
name: code-reviewer
tools: ["Read", "Grep", "Glob", "Bash"]
model: sonnet
---
```

```yaml
# agents/security-reviewer.md:1-5
---
name: security-reviewer
tools: ["Read", "Write", "Edit", "Bash", "Grep", "Glob"]
model: sonnet
---
```

When spawned via `Task(subagent_type=…)`, each agent runs in its own context
bubble. The parent session is not polluted by the subagent's tool results, file
reads, or intermediate reasoning. This is the primary technique for isolating
large read-heavy scans (e.g., security audits, dependency analysis) from the
main orchestration context.

**For the infra agent:** spawn an `ansible-plan-reviewer` subagent with
`tools: ["Read", "Grep"]` scoped only to `**/ansible/**` files. Its entire
read context stays in the subagent bubble; the orchestrator only receives the
final structured report.

---

### Bonus — Context Budget Auditing

**Source:** `skills/context-budget/SKILL.md`

The `/context-budget` command backs this skill. It audits token overhead across
agents, skills, rules, MCP servers, and CLAUDE.md, then produces a ranked
savings table. Key heuristics (`skills/context-budget/SKILL.md:131`):

- Prose token estimate: `words × 1.3`
- Code-heavy files: `chars / 4`
- Each MCP tool schema: ~500 tokens
- Agent description (loaded on every Task spawn): always-on overhead

Practical leverage order: MCP > agent descriptions > skills > rules.

---

## Part 2 — Local Ollama Provider Route

### Architecture Summary

The Python LLM layer at `src/llm/` is a ports-and-adapters hexagonal design.
The port is `src/llm/core/interface.py`; the adapters are in
`src/llm/providers/`; the factory is `src/llm/providers/resolver.py`.

---

### 2.1 Abstract Interface

**Source:** `src/llm/core/interface.py:11-30`

```python
class LLMProvider(ABC):
    provider_type: ProviderType

    @abstractmethod
    def generate(self, input: LLMInput) -> LLMOutput: ...

    @abstractmethod
    def list_models(self) -> list[ModelInfo]: ...

    @abstractmethod
    def validate_config(self) -> bool: ...

    def supports_tools(self) -> bool:
        return True          # base default; Ollama overrides this via ModelInfo

    def supports_vision(self) -> bool:
        return False
```

Every provider is referenced only through this interface. Callers that check
`provider.supports_tools()` get `True` by default, but the capability is also
encoded at the model level via `ModelInfo.supports_tools`.

---

### 2.2 Unified Type System

**Source:** `src/llm/core/types.py`

`ProviderType` is a string enum (`src/llm/core/types.py:17-23`):

```python
class ProviderType(str, Enum):
    CLAUDE = "claude"
    OPENAI = "openai"
    OLLAMA = "ollama"
    ASTRAFLOW = "astraflow"
    ASTRAFLOW_CN = "astraflow_cn"
```

`ModelInfo` carries capability flags (`src/llm/core/types.py:149-156`):

```python
@dataclass(frozen=True)
class ModelInfo:
    name: str
    provider: ProviderType
    supports_tools: bool = True
    supports_vision: bool = False
    max_tokens: int | None = None
    context_window: int | None = None
```

`ToolDefinition` is the single source of truth for cross-provider tool
normalization, with three serializers (`src/llm/core/types.py:47-78`):

- `to_dict()` — neutral form
- `to_openai_tool()` — `{"type":"function","function":{…}}`
- `to_anthropic_tool()` — `{name, description, input_schema}` (drops `strict`,
  renames `parameters` → `input_schema`)

---

### 2.3 Ollama Adapter

**Source:** `src/llm/providers/ollama.py`

The Ollama adapter hits the local API over raw `urllib` — no SDK dependency:

```python
# ollama.py:25-26
self.base_url = base_url or os.environ.get("OLLAMA_BASE_URL", "http://localhost:11434")
self.default_model = default_model or os.environ.get("OLLAMA_MODEL", "llama3.2")
```

All three registered models are flagged `supports_tools=False`
(`ollama.py:31-52`):

```python
ModelInfo(name="llama3.2",  provider=ProviderType.OLLAMA, supports_tools=False, context_window=128000),
ModelInfo(name="mistral",   provider=ProviderType.OLLAMA, supports_tools=False, context_window=8192),
ModelInfo(name="codellama", provider=ProviderType.OLLAMA, supports_tools=False, context_window=16384),
```

The `generate` method posts to `/api/chat` with `stream:false`
(`ollama.py:59-75`):

```python
payload = {
    "model": model,
    "messages": [msg.to_dict() for msg in input.messages],
    "stream": False,
}
```

Error classification maps raw HTTP/message strings to the shared error
taxonomy (`ollama.py:97-103`):

```python
if "401" in msg or "connection" in msg.lower():
    raise AuthenticationError(…)
if "429" in msg or "rate_limit" in msg.lower():
    raise RateLimitError(…)
if "context" in msg.lower() and "length" in msg.lower():
    raise ContextLengthError(…)
```

---

### 2.4 Provider Resolution Precedence

**Source:** `src/llm/providers/resolver.py:49-58`

```python
def _resolve_provider_type(provider_type: ProviderType | str | None) -> ProviderType | str:
    if provider_type is not None:
        return provider_type                            # 1. explicit arg wins

    env_provider = os.environ.get("LLM_PROVIDER")
    if env_provider:
        return _strip_env_value(env_provider).lower()  # 2. LLM_PROVIDER env var

    saved_config = _read_saved_llm_config()
    return saved_config.get("LLM_PROVIDER", "claude").lower()  # 3. .llm.env file, default "claude"
```

The `.llm.env` file is a hand-rolled dotenv parser
(`resolver.py:34-46`): `LLM_PROVIDER=ollama` in the project root or a CWD
`.llm.env` file routes all calls to Ollama without code changes.

`register_provider` (`resolver.py:77-78`) allows runtime extension of
`_PROVIDER_MAP` for custom models.

---

### 2.5 Tool Degradation Path (No-Tool Fallback)

When routing to Ollama, callers must detect the capability gap. The intended
path:

1. Retrieve provider: `provider = get_provider("ollama")`
2. Check model capability: `model_info.supports_tools == False`
   (`src/llm/core/types.py:153`)
3. When `supports_tools=False`, use the `PromptBuilder` in
   `src/llm/prompt/builder.py` with the Ollama profile, which sets
   `include_tools_in_system=True` and `tool_format="text"`:

```python
# builder.py:106-109
"ollama": {
    "include_tools_in_system": True,
    "tool_format": "text",
},
```

This causes `PromptBuilder.build()` to serialize tool definitions as plain
Markdown in the system prompt (`builder.py:59-61`):

```python
if tools and self.config.include_tools_in_system:
    tools_desc = self._format_tools(tools)
    system_parts.append(f"\n\n## Available Tools\n{tools_desc}")
```

The model sees tools as a structured text list rather than a native function-
calling protocol. The model's text response may include a tool-call JSON block,
which `ollama.py:79-87` attempts to parse from `message.tool_calls` if present.

The `adapt_messages_for_provider` helper (`builder.py:119-125`) is the
one-call API for this adaptation:

```python
def adapt_messages_for_provider(
    messages: list[Message],
    provider: str,
    tools: list[ToolDefinition] | None = None,
) -> list[Message]:
    builder = get_provider_builder(provider)
    return builder.build(messages, tools)
```

---

### 2.6 PCI Data → Local Ollama: The Concrete Route

To route sensitive PCI-scoped work to a local Ollama model and keep data off
cloud APIs:

```python
from llm.providers.resolver import get_provider
from llm.prompt.builder import adapt_messages_for_provider
from llm.core.types import Message, Role, ToolDefinition

# Step 1 — Instantiate local provider (no cloud egress)
provider = get_provider("ollama",
    base_url="http://localhost:11434",  # or env OLLAMA_BASE_URL
    default_model="llama3.2")

# Step 2 — Adapt messages + tool descriptions for text-mode degradation
messages = adapt_messages_for_provider(
    messages=[Message(role=Role.USER, content=pci_prompt)],
    provider="ollama",
    tools=tools_if_any,         # serialized as system-prompt text, not native JSON
)

# Step 3 — Generate locally
from llm.core.types import LLMInput
output = provider.generate(LLMInput(messages=messages))
```

Alternatively, set `LLM_PROVIDER=ollama` in the project `.llm.env` and call
`get_provider()` without arguments; the resolver will select Ollama
automatically (`resolver.py:57`).

**Important degradation note:** all three bundled Ollama models have
`supports_tools=False` (`ollama.py:31-47`). Tool-call functionality must be
prompted via the Markdown system-prompt injection, not native function calling.
If the task requires reliable tool use (e.g., code execution), use a
cloud-capable model and strip PCI fields before calling, or run an
Ollama-compatible model with native function calling (e.g., `llama3.1:8b` with
`ollama pull llama3.1`) and update `_models` accordingly.

---

## Summary: 5 Techniques to Adopt + Ollama Code Path

### 5 Context-Engineering Techniques

| # | Technique | Source | Token Impact |
|---|-----------|--------|-------------|
| 1 | **Trigger-table lazy loading** — map keywords to skill paths; load on match only | `skills/strategic-compact/SKILL.md:101-110` | 50%+ baseline reduction |
| 2 | **`paths:` frontmatter scoping** — rules load only when glob matches files in scope | `rules/golang/coding-style.md:1-6` | Eliminates irrelevant language rules entirely |
| 3 | **Hook-driven pressure detection** — PostToolUse warns at 35%/25% remaining, detects loops | `scripts/hooks/ecc-context-monitor.js:19-26` | Prevents silent exhaustion |
| 4 | **Strategic compact suggestions** — threshold + phase-aware hints via PreToolUse hook | `scripts/hooks/suggest-compact.js:89-99` | Preserves context at logical boundaries |
| 5 | **Subagent isolation** — spawn scoped agents with minimal `tools:` lists; parent context unaffected | `agents/planner.md:3-5`, `agents/code-reviewer.md:3-5` | Fully isolates read-heavy scans |

### Ollama Code Path

```
get_provider("ollama")                       # resolver.py:61-74
  └─ _resolve_provider_type("ollama")        # resolver.py:49-58
  └─ _PROVIDER_MAP[ProviderType.OLLAMA]      # resolver.py:21 → OllamaProvider
       └─ base_url = OLLAMA_BASE_URL or "http://localhost:11434"  # ollama.py:25
       └─ models all have supports_tools=False                    # ollama.py:31-47

adapt_messages_for_provider(msgs, "ollama", tools)
  └─ get_provider_builder("ollama")          # builder.py:113-115
  └─ PromptConfig(include_tools_in_system=True, tool_format="text")  # builder.py:106-109
  └─ PromptBuilder.build() injects tools as Markdown in system prompt  # builder.py:59-61

OllamaProvider.generate(LLMInput)
  └─ POST http://localhost:11434/api/chat    # ollama.py:59
  └─ payload: {model, messages, stream:false}
  └─ returns LLMOutput(content, tool_calls?) # ollama.py:89-93
```

**PCI isolation guarantee:** `OllamaProvider` uses only `urllib.request`; no
Anthropic or OpenAI SDK is imported. Data never leaves the local machine as long
as `OLLAMA_BASE_URL` points to localhost.
