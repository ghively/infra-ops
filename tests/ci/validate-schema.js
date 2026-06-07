#!/usr/bin/env node
/**
 * Validates that schemas/state-store.schema.json defines all 9 collections
 * that state-store.js implements, and that the schema is valid JSON.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '../../');
const SCHEMA_FILE = path.join(REPO_ROOT, 'schemas/state-store.schema.json');
const STATE_STORE = path.join(REPO_ROOT, 'scripts/lib/state-store.js');

const REQUIRED_COLLECTIONS = [
  'sessions',
  'skillRuns',
  'skillVersions',
  'decisions',
  'installState',
  'governanceEvents',
  'workItems',
  'knowledgeBase',
  'observations',
];

function main() {
  const errors = [];

  if (!fs.existsSync(SCHEMA_FILE)) {
    console.error('❌ schemas/state-store.schema.json not found');
    process.exit(1);
  }

  let schema;
  try {
    schema = JSON.parse(fs.readFileSync(SCHEMA_FILE, 'utf8'));
  } catch (e) {
    console.error(`❌ Invalid JSON in state-store.schema.json: ${e.message}`);
    process.exit(1);
  }

  // 1. All 9 collections defined in schema.properties
  const props = schema.properties || {};
  for (const col of REQUIRED_COLLECTIONS) {
    if (!props[col]) {
      errors.push(`Missing collection in schema.properties: "${col}"`);
    }
  }

  // 2. Each collection's $ref resolves to a $def
  const defs = schema.$defs || {};
  for (const col of REQUIRED_COLLECTIONS) {
    if (!props[col]) continue; // already flagged above
    const ref = (props[col].items || {}).$ref || '';
    const defName = ref.replace('#/$defs/', '');
    if (defName && !defs[defName]) {
      errors.push(`schema.properties.${col} references $defs/${defName} which does not exist`);
    }
  }

  // 3. All 9 collections present in state-store.js COLLECTION_FILES
  const storeSource = fs.readFileSync(STATE_STORE, 'utf8');
  for (const col of REQUIRED_COLLECTIONS) {
    if (!storeSource.includes(`'${col}'`) && !storeSource.includes(`"${col}"`)) {
      errors.push(`Collection "${col}" not found in state-store.js`);
    }
  }

  if (errors.length > 0) {
    console.error('\n❌ Schema validation failed:');
    errors.forEach(e => console.error(`   - ${e}`));
    process.exit(1);
  }

  console.log('✅ State Store schema validated (9/9 collections defined)');
}

main();
