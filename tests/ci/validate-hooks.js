#!/usr/bin/env node

/**
 * Validate hooks configuration.
 *
 * Understands the real Claude Code hooks.json schema:
 *
 *   {
 *     "$schema": "...",                // optional
 *     "hooks": {                       // event map
 *       "<EventName>": [
 *         {
 *           "matcher": "Bash|Edit",
 *           "hooks": [
 *             { "type": "command", "command": "node \"...script.js\"" }
 *           ]
 *         }
 *       ]
 *     }
 *   }
 *
 * Checks:
 *   - top-level "hooks" is an object (event map)
 *   - each event maps to an array of matcher groups
 *   - each matcher group has a "hooks" array of command entries
 *   - each command entry references a script file that exists on disk
 */

const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '../../');
const HOOKS_FILE = path.join(REPO_ROOT, 'hooks/hooks.json');

// Pull every plausible script path out of a `command` string. Commands look like:
//   node "${CLAUDE_PLUGIN_ROOT}/scripts/hooks/foo.js"
// We resolve ${CLAUDE_PLUGIN_ROOT} to the repo root and check the file exists.
function extractScriptPaths(command) {
  const paths = [];
  const re = /([^\s"']*scripts\/[^\s"']+\.js)/g;
  let m;
  while ((m = re.exec(command)) !== null) {
    paths.push(m[1]);
  }
  return paths;
}

function resolveScriptPath(scriptRef) {
  const cleaned = scriptRef.replace(/\$\{CLAUDE_PLUGIN_ROOT\}\/?/g, '');
  return path.join(REPO_ROOT, cleaned);
}

function validateHooksConfig() {
  if (!fs.existsSync(HOOKS_FILE)) {
    console.log('No hooks.json found');
    return [];
  }

  const errors = [];
  let config;
  try {
    config = JSON.parse(fs.readFileSync(HOOKS_FILE, 'utf8'));
  } catch (e) {
    return [`Invalid JSON in hooks.json: ${e.message}`];
  }

  const eventMap = config.hooks || config;
  if (typeof eventMap !== 'object' || Array.isArray(eventMap)) {
    return ['hooks.json must contain a "hooks" object mapping event names to arrays'];
  }

  for (const [event, groups] of Object.entries(eventMap)) {
    if (event === '$schema') continue;
    if (!Array.isArray(groups)) {
      errors.push(`Event ${event} must map to an array of matcher groups`);
      continue;
    }

    groups.forEach((group, gi) => {
      if (!Array.isArray(group.hooks)) {
        errors.push(`${event}[${gi}] must contain a "hooks" array`);
        return;
      }

      group.hooks.forEach((hook, hi) => {
        if (!hook.command) {
          errors.push(`${event}[${gi}].hooks[${hi}] missing "command"`);
          return;
        }

        const scripts = extractScriptPaths(hook.command);
        for (const scriptRef of scripts) {
          const resolved = resolveScriptPath(scriptRef);
          if (!fs.existsSync(resolved)) {
            errors.push(`${event}[${gi}].hooks[${hi}] references missing script: ${scriptRef}`);
          }
        }
      });
    });
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
