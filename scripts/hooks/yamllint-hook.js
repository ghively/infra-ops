#!/usr/bin/env node
/**
 * Infra-Ops YAML Lint Hook
 *
 * PostToolUse hook that automatically runs yamllint on YAML files
 * after Edit/Write operations. Provides immediate feedback on YAML
 * syntax issues.
 *
 * Enable: Set INFRAOPS_YAMLLINT=1  (INFRA_OPS_YAMLLINT still accepted for back-compat)
 * Requires: yamllint (npm install -g yamllint or apt install yamllint)
 */

'use strict';

const { spawnSync } = require('child_process');
const path = require('path');

/**
 * Find yamllint executable.
 */
function findYamllint() {
  const candidates = [
    process.env.YAMLLINT || '',
    'yamllint',
    '/usr/bin/yamllint',
    '/usr/local/bin/yamllint',
  ].filter(Boolean);

  for (const candidate of candidates) {
    const result = spawnSync(candidate, ['--version'], {
      stdio: 'ignore',
      windowsHide: true
    });
    if (!result.error) {
      return candidate;
    }
  }

  return null;
}

/**
 * Check if a file is a YAML file.
 */
function isYamlFile(filePath) {
  if (!filePath || typeof filePath !== 'string') {
    return false;
  }

  const ext = path.extname(filePath).toLowerCase();
  return ['.yml', '.yaml'].includes(ext);
}

/**
 * Run yamllint on a file.
 */
function runYamllint(filePath) {
  const yamllint = findYamllint();
  if (!yamllint) {
    return {
      success: false,
      message: '[yamllint] Not installed. Run: npm install -g yamllint or apt install yamllint'
    };
  }

  const result = spawnSync(yamllint, [
    '-f', 'parsable',
    '-d', '{extends: default, rules: {line-length: {max: 120}, comments-indentation: {level: warning}}}',
    filePath
  ], {
    encoding: 'utf8',
    windowsHide: true,
    timeout: 5000
  });

  const hasErrors = result.status !== 0;
  const output = (result.stdout || '') + (result.stderr || '');

  return {
    success: !hasErrors,
    message: hasErrors
      ? `[yamllint] Issues detected:\n${output || 'Unknown error'}`
      : '[yamllint] YAML syntax OK'
  };
}

/**
 * Core hook logic.
 */
function run(rawInput) {
  // Gate on feature flag
  if (String(process.env.INFRAOPS_YAMLLINT || process.env.INFRA_OPS_YAMLLINT || '').toLowerCase() !== '1') {
    return rawInput;
  }

  let input;
  try {
    input = typeof rawInput === 'string' ? JSON.parse(rawInput) : rawInput;
  } catch {
    return rawInput;
  }

  const toolName = input.tool_name || '';
  const toolInput = input.tool_input || {};

  // Only run on Edit/Write for YAML files
  if ((toolName === 'Edit' || toolName === 'Write') && isYamlFile(toolInput.file_path)) {
    const result = runYamllint(toolInput.file_path);

    if (!result.success) {
      return {
        ...rawInput,
        stderr: (rawInput.stderr || '') + '\n' + result.message
      };
    }

    // Success message goes to stderr so it doesn't interfere with tool output
    process.stderr.write(result.message + '\n');
  }

  return rawInput;
}

/**
 * Stdin entry point.
 */
if (require.main === module) {
  let raw = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', chunk => { raw += chunk; });
  process.stdin.on('end', () => {
    const result = run(raw);
    process.stdout.write(typeof result === 'string' ? result : JSON.stringify(result));
  });
}

module.exports = {
  findYamllint,
  isYamlFile,
  run,
  runYamllint
};
