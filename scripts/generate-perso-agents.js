#!/usr/bin/env node
/**
 * Perso-agent overlay generator (decision 2026-07-17-zone-as-overlay).
 *
 * The six perso-* (in-HSA) agents were hand-maintained near-copies of corporate agents,
 * so their shared HSA constraints drifted (inconsistent model frontmatter, differing
 * local-only notes). This generator makes the shared constraints a single source of
 * truth: it injects overlays/hsa-zone-overlay.md into each perso agent between managed
 * markers. The role-specific body stays hand-authored; only the shared overlay region
 * is generated.
 *
 * Idempotent: run any number of times. If the markers are absent it inserts the block
 * immediately after the agent's `## Prompt Defense Baseline` section; if present it
 * replaces the region between them.
 *
 * Usage: node scripts/generate-perso-agents.js [--check]
 *   --check : verify committed files already match (exit 1 on drift); writes nothing.
 */

'use strict';

const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '..');
const AGENTS_DIR = path.join(REPO_ROOT, 'agents');
const OVERLAY_FILE = path.join(REPO_ROOT, 'overlays', 'hsa-zone-overlay.md');

const BEGIN = '<!-- BEGIN hsa-zone-overlay (generated — edit overlays/hsa-zone-overlay.md) -->';
const END = '<!-- END hsa-zone-overlay -->';

function persoAgents() {
  return fs.readdirSync(AGENTS_DIR)
    .filter((f) => f.startsWith('perso-') && f.endsWith('.md'))
    .map((f) => path.join(AGENTS_DIR, f));
}

// The overlay body is everything after the leading HTML comment in the overlay file.
function overlayBody() {
  const raw = fs.readFileSync(OVERLAY_FILE, 'utf8');
  return raw.replace(/^<!--[\s\S]*?-->\n/, '').trim();
}

function block() {
  return `${BEGIN}\n\n${overlayBody()}\n\n${END}`;
}

// Return the file content with the overlay block injected/replaced. Null if no anchor.
function applied(content) {
  const b = block();
  let out;
  if (content.includes(BEGIN) && content.includes(END)) {
    out = content.replace(new RegExp(`${escapeRe(BEGIN)}[\\s\\S]*?${escapeRe(END)}`), b);
  } else {
    // Insert after the Prompt Defense Baseline section (before the next top-level "## ").
    const m = content.match(/^## Prompt Defense Baseline\n[\s\S]*?(?=\n## )/m);
    if (!m) return null;
    const insertAt = m.index + m[0].length;
    out = content.slice(0, insertAt) + `\n\n${b}\n` + content.slice(insertAt);
  }
  // Collapse any 3+ consecutive newlines to a single blank line (markdownlint MD012).
  return out.replace(/\n{3,}/g, '\n\n');
}

function escapeRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

function main() {
  const check = process.argv.includes('--check');
  let drift = 0;
  let changed = 0;
  for (const file of persoAgents()) {
    const before = fs.readFileSync(file, 'utf8');
    const after = applied(before);
    if (after == null) {
      console.error(`❌ ${path.basename(file)}: no "## Prompt Defense Baseline" anchor to inject the overlay after`);
      drift += 1;
      continue;
    }
    if (after !== before) {
      if (check) {
        console.error(`❌ ${path.basename(file)}: HSA overlay is out of date — run \`npm run generate:perso\``);
        drift += 1;
      } else {
        fs.writeFileSync(file, after);
        changed += 1;
      }
    }
  }
  if (check) {
    if (drift > 0) { console.error(`\n❌ perso-overlay: ${drift} file(s) drifted`); process.exit(1); }
    console.log('✅ perso-overlay: all perso-* agents carry the current HSA overlay');
    return;
  }
  console.log(`✅ generate:perso — updated ${changed} perso agent(s); overlay is single-sourced from overlays/hsa-zone-overlay.md`);
}

main();
