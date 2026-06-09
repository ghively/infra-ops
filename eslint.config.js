'use strict';

/**
 * Flat ESLint config (ESLint v9+).
 *
 * The codebase is Node.js CommonJS: hooks and libraries under `scripts/`,
 * validators and unit tests under `tests/`. All run on Node >= 18.
 */

const js = require('@eslint/js');
const globals = require('globals');

module.exports = [
  {
    ignores: ['node_modules/**', 'coverage/**', 'docs/infra-agent/research/**'],
  },
  js.configs.recommended,
  {
    files: ['**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'commonjs',
      globals: {
        ...globals.node,
      },
    },
    rules: {
      // Unused args/vars/caught-errors are allowed when prefixed with `_`
      // (intentional throwaways, e.g. `catch (_)` best-effort fallbacks).
      'no-unused-vars': ['error', {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        caughtErrorsIgnorePattern: '^_',
      }],
      // Empty catch blocks are used deliberately for best-effort/no-op fallbacks.
      'no-empty': ['error', { allowEmptyCatch: true }],
    },
  },
];
