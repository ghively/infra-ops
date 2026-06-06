#!/usr/bin/env node

/**
 * Test runner — executes every validator under tests/ci/ and reports a summary.
 *
 * Invoked by `npm test`. Exits non-zero if any validator fails, so it can gate CI.
 */

'use strict';

const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const CI_DIR = path.join(__dirname, 'ci');
const UNIT_DIR = path.join(__dirname, 'unit');

function findValidators() {
  const files = [];
  if (fs.existsSync(CI_DIR)) {
    files.push(...fs.readdirSync(CI_DIR)
      .filter(f => f.startsWith('validate-') && f.endsWith('.js'))
      .sort()
      .map(f => path.join(CI_DIR, f)));
  }
  if (fs.existsSync(UNIT_DIR)) {
    files.push(...fs.readdirSync(UNIT_DIR)
      .filter(f => f.endsWith('.test.js'))
      .sort()
      .map(f => path.join(UNIT_DIR, f)));
  }
  return files;
}

function main() {
  const validators = findValidators();

  if (validators.length === 0) {
    console.error('No validators found under tests/ci/');
    process.exit(1);
  }

  const failures = [];

  for (const validator of validators) {
    const name = path.basename(validator);
    console.log(`\n=== ${name} ===`);
    const result = spawnSync(process.execPath, [validator], { stdio: 'inherit' });
    if (result.status !== 0) {
      failures.push(name);
    }
  }

  console.log('\n────────────────────────────────────────');
  if (failures.length > 0) {
    console.error(`❌ ${failures.length} validator(s) failed: ${failures.join(', ')}`);
    process.exit(1);
  }

  console.log(`✅ All ${validators.length} validators passed`);
}

main();
