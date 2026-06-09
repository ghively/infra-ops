#!/usr/bin/env node
/**
 * Infra-Ops Local Inference Lane — Ollama Router
 *
 * The real "local lane": runs LLM inference against a local Ollama endpoint so that
 * CHD-adjacent / in-zone work never egresses to a cloud model. Uses ONLY Node's
 * built-in http/https — no cloud SDK is imported — so data provably never leaves the
 * machine as long as OLLAMA_BASE_URL points at localhost (or a dedicated local box).
 *
 * Design basis: DESIGN.md §4 (hybrid model architecture; local lane, egress blocked)
 * and the ECC ollama provider precedent (urllib-only localhost adapter).
 *
 * Usage (library):
 *   const router = require('../lib/ollama-router.js');
 *   const out = await router.generate({ prompt, model, system });
 *
 * Usage (CLI — what the sensitive-local-analyst agent shells out to):
 *   echo "PROMPT" | node scripts/lib/ollama-router.js --model qwen2.5-coder:32b
 *   node scripts/lib/ollama-router.js --health
 *
 * Environment:
 *   OLLAMA_BASE_URL                 local endpoint, e.g. http://127.0.0.1:11434
 *   INFRAOPS_OLLAMA_MODEL           default model (fallback: qwen2.5-coder:32b)
 *   INFRAOPS_OLLAMA_REQUIRE_LOCAL   "1" (default) refuse non-local endpoints; "0" to allow
 *   INFRAOPS_OLLAMA_TIMEOUT_MS      request timeout (default 120000)
 */

'use strict';

const http = require('http');
const https = require('https');
const { URL } = require('url');
const { retry } = require('./retry.js');

// Transient network/timeout failures worth retrying (not e.g. a refused non-local guard).
function isTransient(err) {
  const code = err && err.code;
  if (['ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT', 'EAI_AGAIN', 'EPIPE'].includes(code)) return true;
  return /timed out|socket hang up|network/i.test((err && err.message) || '');
}

const DEFAULT_MODEL = process.env.INFRAOPS_OLLAMA_MODEL || 'qwen2.5-coder:32b';
const DEFAULT_TIMEOUT_MS = parseInt(process.env.INFRAOPS_OLLAMA_TIMEOUT_MS || '120000', 10);

function getBaseUrl() {
  return process.env.OLLAMA_BASE_URL || '';
}

function isConfigured() {
  return !!getBaseUrl();
}

/**
 * Is this URL pointed at the local machine or a private (RFC1918) host?
 * The local lane must not egress to the public internet.
 */
function isLocalUrl(urlStr) {
  let host;
  try {
    host = new URL(urlStr).hostname;
  } catch {
    return false;
  }
  if (host === 'localhost' || host === '127.0.0.1' || host === '::1') return true;
  if (/^10\./.test(host)) return true;
  if (/^192\.168\./.test(host)) return true;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(host)) return true;
  return false;
}

function requireLocal() {
  return String(process.env.INFRAOPS_OLLAMA_REQUIRE_LOCAL || '1') !== '0';
}

/**
 * Build the Ollama /api/generate request body.
 */
function buildPayload({ prompt, model, system }) {
  const body = {
    model: model || DEFAULT_MODEL,
    prompt: prompt || '',
    stream: false,
  };
  if (system) body.system = system;
  return body;
}

/**
 * Low-level POST to the local endpoint. Returns parsed JSON.
 */
function postJson(pathName, payload, { timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  const base = getBaseUrl();
  if (!base) {
    return Promise.reject(new Error('Local lane not configured: OLLAMA_BASE_URL is unset'));
  }
  if (requireLocal() && !isLocalUrl(base)) {
    return Promise.reject(new Error(
      `Refusing non-local OLLAMA_BASE_URL (${base}); the local lane must not egress. ` +
      'Set INFRAOPS_OLLAMA_REQUIRE_LOCAL=0 only if this host is a verified in-zone box.'
    ));
  }

  const url = new URL(pathName, base.endsWith('/') ? base : base + '/');
  const transport = url.protocol === 'https:' ? https : http;
  const data = Buffer.from(JSON.stringify(payload), 'utf8');

  const options = {
    method: 'POST',
    hostname: url.hostname,
    port: url.port,
    path: url.pathname + url.search,
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': data.length,
    },
  };

  return new Promise((resolve, reject) => {
    const req = transport.request(options, (res) => {
      let chunks = '';
      res.setEncoding('utf8');
      res.on('data', (c) => { chunks += c; });
      res.on('end', () => {
        if (res.statusCode < 200 || res.statusCode >= 300) {
          reject(new Error(`Ollama responded ${res.statusCode}: ${chunks.slice(0, 500)}`));
          return;
        }
        try {
          resolve(JSON.parse(chunks));
        } catch (e) {
          reject(new Error(`Invalid JSON from Ollama: ${e.message}`));
        }
      });
    });
    req.on('error', reject);
    req.setTimeout(timeoutMs, () => {
      req.destroy(new Error(`Ollama request timed out after ${timeoutMs}ms`));
    });
    req.write(data);
    req.end();
  });
}

/**
 * Run a single-turn local completion. Returns the response text.
 */
async function generate({ prompt, model, system, timeoutMs, retries } = {}) {
  const payload = buildPayload({ prompt, model, system });
  const json = await retry(
    () => postJson('api/generate', payload, { timeoutMs }),
    { retries: retries == null ? 2 : retries, baseMs: 300, shouldRetry: isTransient },
  );
  return (json && typeof json.response === 'string') ? json.response : '';
}

/**
 * Health check — list local models. Resolves to the tag list, rejects if unreachable.
 */
function health({ timeoutMs = 5000 } = {}) {
  const base = getBaseUrl();
  if (!base) return Promise.reject(new Error('OLLAMA_BASE_URL is unset'));
  if (requireLocal() && !isLocalUrl(base)) {
    return Promise.reject(new Error(`Refusing non-local OLLAMA_BASE_URL (${base})`));
  }
  const url = new URL('api/tags', base.endsWith('/') ? base : base + '/');
  const transport = url.protocol === 'https:' ? https : http;
  return new Promise((resolve, reject) => {
    const req = transport.request(
      { method: 'GET', hostname: url.hostname, port: url.port, path: url.pathname },
      (res) => {
        let chunks = '';
        res.setEncoding('utf8');
        res.on('data', (c) => { chunks += c; });
        res.on('end', () => {
          try {
            resolve(JSON.parse(chunks));
          } catch (e) {
            reject(new Error(`Invalid JSON from Ollama: ${e.message}`));
          }
        });
      }
    );
    req.on('error', reject);
    req.setTimeout(timeoutMs, () => req.destroy(new Error('health check timed out')));
    req.end();
  });
}

/**
 * Parse CLI args into an options object.
 */
function parseArgs(argv) {
  const opts = { model: undefined, system: undefined, prompt: undefined, health: false };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--health' || a === '--check') opts.health = true;
    else if (a === '--model') opts.model = argv[++i];
    else if (a === '--system') opts.system = argv[++i];
    else if (a === '--prompt') opts.prompt = argv[++i];
  }
  return opts;
}

function readStdin() {
  try {
    return require('fs').readFileSync(0, 'utf8');
  } catch {
    return '';
  }
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));

  if (!isConfigured()) {
    process.stderr.write(
      '[ollama-router] OLLAMA_BASE_URL is not set — the local lane is not available.\n' +
      'Stand up a local Ollama box and export OLLAMA_BASE_URL (e.g. http://127.0.0.1:11434).\n'
    );
    process.exit(2);
  }

  if (opts.health) {
    try {
      const tags = await health();
      const models = (tags.models || []).map((m) => m.name).join(', ') || '(none)';
      process.stdout.write(`[ollama-router] local lane OK at ${getBaseUrl()}; models: ${models}\n`);
      process.exit(0);
    } catch (e) {
      process.stderr.write(`[ollama-router] local lane UNREACHABLE: ${e.message}\n`);
      process.exit(1);
    }
  }

  const prompt = opts.prompt || readStdin();
  if (!prompt.trim()) {
    process.stderr.write('[ollama-router] no prompt provided (use --prompt or stdin)\n');
    process.exit(2);
  }

  try {
    const out = await generate({ prompt, model: opts.model, system: opts.system });
    process.stdout.write(out);
  } catch (e) {
    process.stderr.write(`[ollama-router] local inference failed: ${e.message}\n`);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  getBaseUrl,
  isConfigured,
  isLocalUrl,
  requireLocal,
  buildPayload,
  generate,
  health,
  parseArgs,
  DEFAULT_MODEL,
};
