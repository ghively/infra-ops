#!/usr/bin/env node

/**
 * Perso-overlay drift validator (decision 2026-07-17-zone-as-overlay).
 *
 * Asserts every perso-* agent carries the current shared HSA overlay
 * (overlays/hsa-zone-overlay.md) — i.e. the committed files match what the generator
 * would produce. Catches the twin-drift class (inconsistent model frontmatter, differing
 * local-only notes) the overlay mechanism exists to prevent. Delegates to the generator's
 * --check mode so there is one source of truth for the comparison.
 */

'use strict';

const path = require('path');
const { spawnSync } = require('child_process');

const GEN = path.resolve(__dirname, '../../scripts/generate-perso-agents.js');
const res = spawnSync('node', [GEN, '--check'], { encoding: 'utf8' });
process.stdout.write(res.stdout || '');
process.stderr.write(res.stderr || '');
process.exit(res.status === 0 ? 0 : 1);
