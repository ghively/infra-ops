#!/usr/bin/env node

/**
 * Validate hooks configuration
 * Checks hooks.json for proper structure and script references
 */

const fs = require('fs');
const path = require('path');

const HOOKS_FILE = path.resolve(__dirname, '../../hooks/hooks.json');
const HOOKS_SCRIPTS_DIR = path.resolve(__dirname, '../../scripts/hooks');

function validateHooksConfig() {
  if (!fs.existsSync(HOOKS_FILE)) {
    console.log('No hooks.json found');
    return [];
  }

  const hooksContent = fs.readFileSync(HOOKS_FILE, 'utf8');
  const errors = [];

  let hooksConfig;
  try {
    hooksConfig = JSON.parse(hooksContent);
  } catch (e) {
    return [`Invalid JSON in hooks.json: ${e.message}`];
  }

  // Check each hook
  for (const [event, hookConfig] of Object.entries(hooksConfig)) {
    if (!Array.isArray(hookConfig)) {
      errors.push(`Hook ${event} must be an array`);
      continue;
    }

    for (const hook of hookConfig) {
      if (!hook.script) {
        errors.push(`Hook ${event} missing script reference`);
        continue;
      }

      // Check if script file exists
      const scriptPath = path.resolve(__dirname, '../../', hook.script);
      if (!fs.existsSync(scriptPath)) {
        errors.push(`Hook script not found: ${hook.script}`);
      }
    }
  }

  return errors;
}

function main() {
  const errors = validateHooksConfig();

  if (errors.length > 0) {
    console.error('\n❌ Hooks validation failed:');
    errors.forEach(e => console.error(`   - ${e}`));
    process.exit(1);
  }

  console.log('✅ Hooks configuration validated');
}

main();
