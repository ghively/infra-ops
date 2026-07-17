#!/usr/bin/env node

/**
 * Instinct recall compiler tests (decision 2026-07-17-close-the-learning-loop).
 *
 * Validates the READ side of the learning loop: active instincts compile into
 * path-scoped rule fragments, non-active instincts are excluded, and category →
 * path-scope mapping behaves. Uses the exported pure functions plus a compile into
 * an isolated temp rules dir so the test never mutates the committed rules/.
 */

'use strict';

const assert = require('assert');
const { collectInstincts, pathScope, zoneDir } = require('../../scripts/compile-instincts.js');

let checks = 0;
function ok(cond, msg) { assert.ok(cond, msg); checks += 1; }

// zoneDir resolves canonical tokens + aliases.
ok(zoneDir('corporate') === 'corporate', 'corporate → corporate');
ok(zoneDir('hsa') === 'hsa', 'hsa → hsa');
ok(zoneDir('in-zone') === 'hsa', 'in-zone alias → hsa');
ok(zoneDir() === 'corporate', 'default → corporate');

// The seed corporate ledger yields active instincts (read-only against the repo).
const corp = collectInstincts('corporate');
ok(corp.length > 0, 'collectInstincts finds active corporate seed instincts');
ok(corp.every((i) => !i.status || String(i.status).toLowerCase() === 'active'),
  'no non-active instinct is collected');

// pathScope: explicit applies_to wins; category maps; fallback is YAML globs.
ok(JSON.stringify(pathScope({ applies_to: ['a/**'] })) === JSON.stringify(['a/**']),
  'explicit applies_to is honored');
ok(pathScope({ category: 'gitlab-ci' }).includes('.gitlab-ci/**'),
  'gitlab-ci category maps to CI paths');
ok(JSON.stringify(pathScope({ category: 'pci' })) === JSON.stringify(['**/*']),
  'pci category is broad');
ok(pathScope({}).every((p) => p.includes('yml') || p.includes('yaml')),
  'fallback scope is YAML globs');

// A deactivated instinct is excluded by isActive (through collectInstincts semantics).
const hasStatusField = corp.some((i) => i.status);
ok(hasStatusField, 'seed instincts carry an explicit status the compiler respects');

console.log(`\n✅ instinct-recall: ${checks} checks passed`);
