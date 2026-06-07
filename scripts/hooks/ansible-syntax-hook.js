#!/usr/bin/env node
/**
 * Infra-Ops Ansible Syntax Hook
 *
 * PostToolUse hook that automatically runs ansible-playbook --syntax-check
 * on Ansible playbooks after Edit/Write operations. Provides immediate
 * feedback on playbook syntax issues.
 *
 * Enable: Set INFRAOPS_ANSIBLE_SYNTAX=1  (INFRA_OPS_ANSIBLE_SYNTAX still accepted for back-compat)
 * Requires: ansible-playbook (needs Ansible installation)
 */

'use strict';

const { spawnSync } = require('child_process');
const path = require('path');

/**
 * Find ansible-playbook executable.
 */
function findAnsiblePlaybook() {
  const candidates = [
    process.env.ANSIBLE_PLAYBOOK || '',
    'ansible-playbook',
    '/usr/bin/ansible-playbook',
    '/usr/local/bin/ansible-playbook',
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
 * Check if a file is an Ansible playbook.
 */
function isAnsiblePlaybook(filePath) {
  if (!filePath || typeof filePath !== 'string') {
    return false;
  }

  const ext = path.extname(filePath).toLowerCase();
  if (ext !== '.yml' && ext !== '.yaml') {
    return false;
  }

  // Check file path patterns that indicate a playbook
  const normalized = filePath.toLowerCase();
  const playbookPatterns = [
    'playbook',
    'site',
    'deploy',
    'provision',
    'main.yml',
    'main.yaml'
  ];

  return playbookPatterns.some(pattern => normalized.includes(pattern));
}

/**
 * Check if a file is in a roles/ directory (task files, handlers, etc).
 */
function isRoleFile(filePath) {
  if (!filePath || typeof filePath !== 'string') {
    return false;
  }

  const normalized = filePath.toLowerCase();
  return normalized.includes('/roles/') || normalized.includes('\\roles\\');
}

/**
 * Run ansible-playbook --syntax-check on a file.
 */
function runSyntaxCheck(filePath) {
  const ansiblePlaybook = findAnsiblePlaybook();
  if (!ansiblePlaybook) {
    return {
      success: false,
      message: '[ansible-syntax] ansible-playbook not found. Install Ansible first.'
    };
  }

  const result = spawnSync(ansiblePlaybook, [
    '--syntax-check',
    filePath
  ], {
    encoding: 'utf8',
    windowsHide: true,
    timeout: 10000,
    env: {
      ...process.env,
      ANSIBLE_FORCE_COLOR: '0'
    }
  });

  const hasErrors = result.status !== 0;
  const output = (result.stdout || '') + (result.stderr || '');

  return {
    success: !hasErrors,
    message: hasErrors
      ? `[ansible-syntax] Syntax errors detected:\n${output || 'Unknown error'}`
      : '[ansible-syntax] Playbook syntax OK'
  };
}

/**
 * Core hook logic.
 */
function run(rawInput) {
  // Gate on feature flag
  if (String(process.env.INFRAOPS_ANSIBLE_SYNTAX || process.env.INFRA_OPS_ANSIBLE_SYNTAX || '').toLowerCase() !== '1') {
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

  // Run on Edit/Write for Ansible playbooks and role files
  if ((toolName === 'Edit' || toolName === 'Write')) {
    const filePath = toolInput.file_path || '';

    if (isAnsiblePlaybook(filePath) || isRoleFile(filePath)) {
      const result = runSyntaxCheck(filePath);

      if (!result.success) {
        return {
          ...rawInput,
          stderr: (rawInput.stderr || '') + '\n' + result.message
        };
      }

      // Success message goes to stderr
      process.stderr.write(result.message + '\n');
    }
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
  findAnsiblePlaybook,
  isAnsiblePlaybook,
  isRoleFile,
  run,
  runSyntaxCheck
};
