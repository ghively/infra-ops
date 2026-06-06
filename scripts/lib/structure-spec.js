'use strict';

/**
 * Canonical IaC structure specification — the single source of truth for the
 * uniform layout the `iac-author` agent MUST produce for every unit. This is what
 * makes "structure + deployment is uniform" an enforced fact rather than advice:
 * `scripts/validate-structure.js` checks a target against this spec and fails
 * (non-zero) on any deviation, the bundled `templates/` are stamped from it, and the
 * `structure-conformance` CI component runs the validator in the target repo.
 *
 * Each artifact type declares:
 *   - requiredFiles:  paths (relative to the unit root) that MUST exist
 *   - requiredDirs:   directories that MUST exist (skeleton is fixed, even if empty)
 *   - contentChecks:  { file, pattern (RegExp source), why } assertions on file content
 *
 * Keep this in lockstep with `templates/`. The unit test
 * `tests/unit/structure.test.js` asserts every bundled template validates against
 * its own type, so the spec and the scaffolds can never silently drift apart.
 */

const SPECS = {
  'ansible-role': {
    description: 'Canonical Ansible role layout (uniform across every role)',
    requiredFiles: [
      'tasks/main.yml',
      'defaults/main.yml',
      'meta/main.yml',
      'README.md',
      'molecule/default/molecule.yml',
      'molecule/default/converge.yml',
    ],
    requiredDirs: ['handlers', 'templates', 'files', 'vars'],
    contentChecks: [
      { file: 'meta/main.yml', pattern: 'galaxy_info', why: 'role metadata must declare galaxy_info' },
      { file: 'molecule/default/molecule.yml', pattern: 'idempotence|verifier|converge', why: 'molecule scenario must define the idempotence/verify flow' },
    ],
  },

  'ansible-repo': {
    description: 'Canonical Ansible project layout (inventory-as-directory per env)',
    requiredFiles: [
      'ansible.cfg',
      'requirements.yml',
      '.gitlab-ci.yml',
      'inventories/dev/hosts.yml',
      'inventories/staging/hosts.yml',
      'inventories/prod/hosts.yml',
    ],
    requiredDirs: [
      'roles',
      'playbooks',
      'inventories/dev/group_vars',
      'inventories/staging/group_vars',
      'inventories/prod/group_vars',
    ],
    contentChecks: [
      { file: 'requirements.yml', pattern: 'version', why: 'collections/roles must be version-pinned' },
    ],
  },

  'terraform-module': {
    description: 'Canonical Terraform/OpenTofu reusable module layout',
    requiredFiles: ['main.tf', 'variables.tf', 'outputs.tf', 'versions.tf', 'README.md'],
    requiredDirs: [],
    contentChecks: [
      { file: 'versions.tf', pattern: 'required_version', why: 'pin the core version (required_version)' },
      { file: 'versions.tf', pattern: 'required_providers', why: 'pin providers (required_providers)' },
    ],
  },

  'terraform-env': {
    description: 'Canonical Terraform/OpenTofu per-environment root layout',
    requiredFiles: ['main.tf', 'backend.tf', 'versions.tf', 'terraform.tfvars'],
    requiredDirs: [],
    contentChecks: [
      { file: 'backend.tf', pattern: 'backend\\s|cloud\\s', why: 'state must use a remote, locked backend (no local state)' },
      { file: 'versions.tf', pattern: 'required_version', why: 'pin the core version (required_version)' },
    ],
  },
};

const TYPES = Object.keys(SPECS);

module.exports = { SPECS, TYPES };
