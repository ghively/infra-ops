#!/usr/bin/env node
/**
 * [infra-session-bootstrap] SessionStart context primer (IMPLEMENTED — baseline).
 *
 * Injects a short orientation into the session: where the spec, the environment
 * baseline, and the knowledge base live, plus the hard trust-boundary reminders.
 * Keeps the orchestrator lean — it points to context rather than inlining it.
 * Always exits 0.
 */
'use strict';

const fs = require('fs');

function main() {
  // Drain stdin (SessionStart provides JSON we don't need to mutate).
  try {
    fs.readFileSync(0, 'utf8');
  } catch {
    /* ignore */
  }

  const root = process.env.CLAUDE_PLUGIN_ROOT || '.';
  const msg = [
    '[infra-ops] Session primed. You are the LEAN ORCHESTRATOR.',
    'Classify the request, DELEGATE specialist work to a subagent (Task tool), and',
    'keep your own context clean. Do not author/review/discover inline.',
    '',
    'Read for the full contract:',
    `  • ${root}/CLAUDE.md       — orchestration: delegation map, skills, Context7 policy`,
    `  • ${root}/SPEC.md         — architecture, trust boundary, component status`,
    `  • ${root}/TODO.md         — the build backlog (fill gaps from here)`,
    `  • ${root}/knowledge/      — ingested docs + instinct ledger (cite when answering)`,
    '',
    'DELEGATE: plan→infra-planner · author→iac-author · review→playbook-reviewer +',
    'pci-compliance-reviewer · discovery/drift→infra-auditor · CHD→sensitive-local-analyst',
    '· docs/citations→knowledge-curator · changelog/ADR→change-scribe.',
    'Use Context7 (resolve-library-id → get-library-docs) for current library docs.',
    '',
    'HARD RULES (never violate):',
    '  • You PROPOSE; pipelines/humans DISPOSE. Never run ansible-playbook against prod.',
    '  • Never read/emit cleartext PAN, keys, key components, PINs, or touch HSMs.',
    '  • CHD-adjacent work → local-only lane; the production/HSA zone is air-gapped.',
    '  • Answer scoping questions from ingested docs WITH CITATIONS, never guess.',
  ].join('\n');

  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'SessionStart',
        additionalContext: msg,
      },
    })
  );
  process.exit(0);
}

try {
  main();
} catch {
  process.exit(0);
}
