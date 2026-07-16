#!/usr/bin/env node

/**
 * Validate relative markdown links
 *
 * Walks every tracked .md file in the repo and checks that each relative
 * link target ([text](path) and [text]: path reference definitions) resolves
 * to an existing file or directory. External links (http/https/mailto),
 * pure anchors (#section), and absolute paths are ignored.
 *
 * Added after the 2026-07-16 plan audit found four documents linking to a
 * spec file that never existed (deep-init-reference.md).
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const REPO_ROOT = path.resolve(__dirname, '../../');

// Directories that are generated, vendored, or reference targets that live
// outside this repo by design.
const SKIP_DIRS = ['node_modules', '.git'];

function listMarkdownFiles() {
  try {
    const out = execSync('git ls-files "*.md"', { cwd: REPO_ROOT, encoding: 'utf8' });
    return out.split('\n').filter(Boolean);
  } catch {
    // Fallback: walk the tree (e.g. when not in a git checkout).
    const files = [];
    const walk = (dir) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (SKIP_DIRS.includes(entry.name)) continue;
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (entry.name.endsWith('.md')) files.push(path.relative(REPO_ROOT, full));
      }
    };
    walk(REPO_ROOT);
    return files;
  }
}

function isCheckableTarget(target) {
  if (!target) return false;
  if (/^[a-z][a-z0-9+.-]*:/i.test(target)) return false; // http:, https:, mailto:, vscode:, …
  if (target.startsWith('#')) return false;              // in-page anchor
  if (target.startsWith('/')) return false;              // absolute path — environment-specific
  if (target.startsWith('<')) return false;              // autolink remnants
  return true;
}

function extractLinks(content) {
  const links = [];
  // Strip fenced code blocks so example links aren't validated.
  const stripped = content.replace(/```[\s\S]*?```/g, '');
  // Inline links: [text](target) — target ends at first whitespace or ')'.
  const inline = /\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;
  let m;
  while ((m = inline.exec(stripped)) !== null) links.push(m[1]);
  // Reference definitions: [label]: target
  const refDef = /^\s{0,3}\[[^\]]+\]:\s+(\S+)/gm;
  while ((m = refDef.exec(stripped)) !== null) links.push(m[1]);
  return links;
}

function validateFile(relFile) {
  const abs = path.join(REPO_ROOT, relFile);
  const content = fs.readFileSync(abs, 'utf8');
  const errors = [];

  for (const rawTarget of extractLinks(content)) {
    if (!isCheckableTarget(rawTarget)) continue;
    const target = decodeURIComponent(rawTarget.split('#')[0]);
    if (!target) continue; // was an anchor like "file.md#x" reduced to "" — handled above
    const resolved = path.resolve(path.dirname(abs), target);
    if (!resolved.startsWith(REPO_ROOT)) continue; // points outside the repo — skip
    if (!fs.existsSync(resolved)) {
      errors.push(`broken link → ${rawTarget}`);
    }
  }

  return errors;
}

function main() {
  const files = listMarkdownFiles();

  if (files.length === 0) {
    console.log('No markdown files found to validate');
    process.exit(0);
  }

  let hasErrors = false;
  let checked = 0;

  for (const file of files) {
    const errors = validateFile(file);
    checked += 1;
    if (errors.length > 0) {
      hasErrors = true;
      console.error(`\n❌ ${file}:`);
      errors.forEach(e => console.error(`   - ${e}`));
    }
  }

  if (hasErrors) {
    process.exit(1);
  }

  console.log(`✅ doc-links: all relative links resolve (${checked} markdown files checked)`);
}

main();
