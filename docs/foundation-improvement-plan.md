# Infra-Ops Foundation Improvement Plan

Analysis of ECC foundational practices and recommendations for strengthening infra-ops core foundation.

**Status:** v0.1.0 → v0.2.0 target
**Date:** 2026-06-03

---

## Executive Summary

ECC has a sophisticated foundation with **12+ hooks**, **7 state collections**, **3 context modes**, and **advanced guardrails**. infra-ops has basic foundation but lacks critical governance and safety features.

**Priority 1 (Critical):** GateGuard, Governance Capture, State Store
**Priority 2 (High):** Context modes, Observation hooks
**Priority 3 (Medium):** Additional quality hooks, Memory persistence

---

## Gap Analysis

| Category | ECC | infra-ops | Priority |
|----------|-----|-----------|----------|
| **Hooks** | 12+ advanced hooks | 3 basic hooks | P1 |
| **State Store** | 7 collections, schema-validated | None | P1 |
| **GateGuard** | Fact-forcing investigation gate | None | P1 |
| **Governance** | Secret/policy capture | Basic audit only | P1 |
| **Context Modes** | dev/research/review modes | None | P2 |
| **Observation** | Continuous learning hooks | None | P2 |
| **Quality Gates** | 6 post-tool hooks | None | P3 |
| **Memory Persistence** | SessionState/Activity | None | P3 |

---

## Priority 1: Critical Foundation

### 1.1 GateGuard Fact-Forcing Hook

**What it does:** Demands investigation facts before allowing Edit/Write/MultiEdit
- Edit/Write: List importers, affected API, verify data schemas
- Destructive Bash: List targets, rollback plan
- Forces investigation → creates awareness

**Implementation:** Port from ECC `scripts/hooks/gateguard-fact-force.js`

```json
// hooks/hooks.json - add to PreToolUse
{
  "matcher": "Edit|Write|MultiEdit",
  "hooks": [{
    "type": "command",
    "command": "node scripts/hooks/gateguard-fact-force.js",
    "timeout": 5
  }],
  "description": "Fact-forcing gate: demand investigation before editing files"
}
```

**Why for infra-ops:**
- Prevents accidental Ansible playbook modifications
- Forces understanding of GitLab CI impact before changes
- Critical for PCI environment (can't break prod)

---

### 1.2 Governance Capture Hook

**What it does:** Detects and logs governance-relevant events
- `secret_detected`: Hardcoded secrets (AWS keys, GitHub tokens, JWTs, private keys)
- `policy_violation`: Actions violating policies
- `security_finding`: Security-relevant tool invocations
- `approval_requested`: Operations requiring explicit approval

**Patterns detected:**
```javascript
const SECRET_PATTERNS = [
  { name: 'aws_key', pattern: /(?:AKIA|ASIA)[A-Z0-9]{16}/i },
  { name: 'generic_secret', pattern: /(?:secret|password|token|api[_-]?key)\s*[:=]\s*["'][^"']{8,}/i },
  { name: 'private_key', pattern: /-----BEGIN (?:RSA |EC |DSA )?PRIVATE KEY-----/ },
  { name: 'jwt', pattern: /eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/ },
  { name: 'github_token', pattern: /gh[pousr]_[A-Za-z0-9_]{36,}/ }
];

const APPROVAL_COMMANDS = [
  /git\s+push\s+.*--force/,
  /git\s+reset\s+--hard/,
  /rm\s+-rf?\s/,
  /DROP\s+(?:TABLE|DATABASE)/i
];
```

**Implementation:** Port from ECC `scripts/hooks/governance-capture.js`

**Why for infra-ops:**
- PCI requirement: Track all secret exposures
- Audit trail for policy violations
- DSS requirement: Tamper-evident logging

---

### 1.3 State Store Schema

**What it does:** Structured persistence for sessions, decisions, governance events

**Schema (port from ECC):**
```json
{
  "sessions": [],         // Session tracking
  "skillRuns": [],        // Skill execution history
  "decisions": [],        // Human decisions with rationale
  "governanceEvents": [], // Secret/policy events
  "knowledgeBase": []     // infra-ops: ingested docs tracking
}
```

**Implementation:**
1. Create `schemas/state-store.schema.json`
2. Create `scripts/lib/state-store.js` for read/write
3. Add SessionStart/PreCompact hooks for persistence

**Why for infra-ops:**
- Track knowledge ingestion provenance
- Audit trail for PCI compliance
- Enable "rollback" of promoted instincts

---

## Priority 2: Context & Observation

### 2.1 Context Modes

**What it does:** Shift agent behavior based on task type

**Three modes:**
- `dev.md` - Active development (write first, explain after)
- `research.md` - Exploration (read widely, verify with evidence)
- `review.md` - Thorough review (severity-ordered findings)

**Implementation:** Create `contexts/` directory with three .md files

**Usage:**
```bash
# Before a task
/context dev   # For active coding
/context research  # For investigation
/context review  # For reviewing playbooks/MRs
```

**Why for infra-ops:**
- Research mode: Before proposing infrastructure changes
- Dev mode: When authoring playbooks
- Review mode: For playbook-reviewer agent

---

### 2.2 Observation Hook (Continuous Learning)

**What it does:** Captures tool use observations for pattern extraction

**Data captured:**
- Tool sequences (Bash → Read → Edit pattern)
- File correlations (playbook change → inventory change)
- Successful workflows for future reuse

**Implementation:** Port from ECC `scripts/hooks/observe-runner.js`

**Why for infra-ops:**
- Learn "this user always runs syntax-check after editing playbooks"
- Build instinct ledger for governed self-improvement
- TODO.md Phase 8 relies on this

---

## Priority 3: Quality & Memory

### 3.1 Additional Quality Hooks

**PostToolUse hooks to add:**

| Hook | Matcher | Purpose |
|------|---------|---------|
| `post:edit:yamllint` | Edit (`.yml`) | Auto-lint Ansible files |
| `post:edit:ansible-syntax` | Edit (`*.yml`) | Run `ansible-playbook --syntax-check` |
| `post:bash:test-fail` | Bash (`npm test\|cargo test`) | Warn on test failures |

---

### 3.2 Memory Persistence

**What it does:** Save state across context compaction

**Collections:**
- `SessionState` - Current context, working files
- `Observation` - Tool use patterns
- `ActivityTracking` - Token usage, tool counts

**Implementation:** Port from ECC `hooks/memory-persistence/`

---

## Implementation Order

### Phase 1 (v0.2.0) - Critical Safety
1. ✅ Copy `gateguard-fact-force.js` from ECC
2. ✅ Copy `governance-capture.js` from ECC
3. ✅ Create `schemas/state-store.schema.json`
4. ✅ Update `hooks/hooks.json` with new hooks
5. ✅ Test hooks in development environment

### Phase 2 (v0.3.0) - Context & Learning
1. Create `contexts/dev.md`, `research.md`, `review.md`
2. Copy `observe-runner.js` from ECC
3. Create `scripts/lib/state-store.js`
4. Add SessionStart/PreCompact hooks

### Phase 3 (v0.4.0) - Quality & Polish
1. Add quality hooks (yamllint, ansible-syntax)
2. Port memory persistence hooks
3. Add context switcher command (`/context`)

---

## File Inventory from ECC to Port

### Critical (Phase 1)
```
ECC/scripts/hooks/gateguard-fact-force.js → infra-ops/scripts/hooks/
ECC/scripts/hooks/governance-capture.js → infra-ops/scripts/hooks/
ECC/schemas/state-store.schema.json → infra-ops/schemas/ (adapt for infra-ops)
ECC/scripts/lib/shell-substitution.js → infra-ops/scripts/lib/ (GateGuard dependency)
```

### Context & Learning (Phase 2)
```
ECC/contexts/*.md → infra-ops/contexts/
ECC/scripts/hooks/observe-runner.js → infra-ops/scripts/hooks/
ECC/skills/continuous-learning-v2/hooks/observe.sh → infra-ops/skills/
```

### Quality (Phase 3)
```
ECC/scripts/hooks/yamllint-hook.js → infra-ops/scripts/hooks/ (create)
ECC/hooks/memory-persistence/* → infra-ops/hooks/memory-persistence/
```

---

## Risk Assessment

| Risk | Mitigation |
|------|------------|
| GateGuard blocks legitimate work | Add `ECC_GATEGUARD=off` env var |
| State store bloat | Add TTL and max entries |
| Hook performance overhead | Async hooks, 5-10s timeout |
| Context mode confusion | Add status indicator |

---

## Success Metrics

- **Safety:** 0 accidental prod changes (GateGuard effectiveness)
- **Compliance:** 100% secret detection (Governance capture)
- **Learning:** 10+ patterns extracted (Observation hook)
- **Quality:** Reduced syntax errors in playbooks (Quality hooks)
