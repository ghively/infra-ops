#!/usr/bin/env node
/**
 * Infra-Ops Instinct Ledger
 *
 * Single source of truth for reading and writing governed instincts, and the ONLY
 * place that performs instinct persistence. Governance events are recorded through
 * the shared State Store library (scripts/lib/state-store.js) so that promotion,
 * rollback, observation, and audit all land in one store rather than four.
 *
 * Ledger layout (versioned YAML per instinct, zone-segmented):
 *   knowledge/instincts/corporate/<id>.yml   corporate / DSS zone
 *   knowledge/instincts/hsa/<id>.yml         HSA zone (air-gapped)
 *   (legacy aliases 'corpor'/'in-zone' are still accepted as zone tokens)
 *
 * Design basis: DESIGN.md §14 (governed learning loop) + SPEC.md §5.
 */

'use strict';

const fs = require('fs');
const path = require('path');

let StateStore;
try {
  StateStore = require('./state-store.js');
} catch {
  StateStore = null;
}

const PLUGIN_ROOT = process.env.CLAUDE_PLUGIN_ROOT || path.resolve(__dirname, '../../');
const INSTINCTS_ROOT = path.join(PLUGIN_ROOT, 'knowledge', 'instincts');

// Map any accepted zone token to its canonical on-disk directory name.
// Canonical: 'corporate' (PCI DSS) and 'hsa' (PCI CP + PIN). Legacy aliases
// 'corpor'/'in-zone' are accepted for back-compat.
function zoneDir(zone) {
  const z = String(zone || '').toLowerCase();
  if (z === 'hsa' || z === 'in-zone') return 'hsa';
  return 'corporate';
}

function ledgerDir(zone) {
  return path.join(INSTINCTS_ROOT, zoneDir(zone));
}

function instinctPath(zone, id) {
  return path.join(ledgerDir(zone), `${id}.yml`);
}

function exists(zone, id) {
  return fs.existsSync(instinctPath(zone, id));
}

/**
 * Record a governance event through the shared State Store. Falls back silently if
 * the store is unavailable — logging must never break a promotion/rollback.
 */
async function logGovernance(event) {
  if (!StateStore) return;
  try {
    await StateStore.governanceEvents.add({
      timestamp: new Date().toISOString(),
      ...event,
    });
  } catch (err) {
    process.stderr.write(`[instinct-ledger] governance log failed: ${err.message}\n`);
  }
}

// Minimal, dependency-free YAML serialization for the instinct record shape.
function toYaml(instinct) {
  const lines = [
    `id: ${instinct.id}`,
    `version: ${instinct.version}`,
    `confidence: ${instinct.confidence}`,
    `zone: ${instinct.zone}`,
    'evidence:',
    ...(instinct.evidence || []).flatMap((e) => [
      `  - observation_id: ${e.observation_id || 'unknown'}`,
      `    citation: "${(e.citation || '').replace(/"/g, '\\"')}"`,
    ]),
    `promoted_at: "${instinct.promoted_at}"`,
    `promoted_by: "${instinct.promoted_by}"`,
    `status: ${instinct.status}`,
  ];
  if (instinct.rollback) {
    lines.push('rollback:');
    lines.push(`  from_version: ${instinct.rollback.from_version}`);
    lines.push(`  at: "${instinct.rollback.at}"`);
    lines.push(`  by: [${(instinct.rollback.by || []).map((b) => `"${b}"`).join(', ')}]`);
    lines.push(`  reason: "${(instinct.rollback.reason || '').replace(/"/g, '\\"')}"`);
  }
  if (instinct.deactivated) {
    lines.push('deactivated:');
    lines.push(`  at: "${instinct.deactivated.at}"`);
    lines.push(`  by: [${(instinct.deactivated.by || []).map((b) => `"${b}"`).join(', ')}]`);
    lines.push(`  reason: "${(instinct.deactivated.reason || '').replace(/"/g, '\\"')}"`);
  }
  lines.push('content: |');
  lines.push(...String(instinct.content || '').split('\n').map((l) => `  ${l}`));
  return lines.join('\n') + '\n';
}

/**
 * Write a freshly promoted instinct to the ledger. Returns the file path.
 * Validation is the caller's responsibility (learning-promotion-gate).
 */
async function promote(req) {
  const dir = ledgerDir(req.zone);
  fs.mkdirSync(dir, { recursive: true });

  const instinct = {
    id: req.instinctId,
    version: req.version || 1,
    confidence: req.confidence,
    zone: zoneDir(req.zone),
    evidence: req.evidence || [],
    promoted_at: req.timestamp || new Date().toISOString(),
    promoted_by: req.approver,
    status: 'active',
    content: req.content || '',
  };

  const filePath = instinctPath(req.zone, req.instinctId);
  fs.writeFileSync(filePath, toYaml(instinct));

  await logGovernance({
    rule: 'instinct-promotion',
    severity: 'info',
    message: `Instinct promoted: ${req.instinctId}`,
    context: { instinct_id: req.instinctId, zone: zoneDir(req.zone), approver: req.approver, confidence: req.confidence },
  });

  return filePath;
}

/**
 * Roll back or deactivate an existing instinct. Returns the file path.
 */
async function rollback(req) {
  const filePath = instinctPath(req.zone, req.instinctId);
  if (!fs.existsSync(filePath)) {
    throw new Error(`Instinct not found: ${req.instinctId} (zone ${zoneDir(req.zone)})`);
  }
  const raw = fs.readFileSync(filePath, 'utf8');

  const now = new Date().toISOString();
  let updated;
  if (req.deactivate) {
    updated = raw.replace(/^status: .*$/m, 'status: deactivated');
    const block = `deactivated:\n  at: "${now}"\n  by: [${(req.approvers || []).map((b) => `"${b}"`).join(', ')}]\n  reason: "${(req.reason || '').replace(/"/g, '\\"')}"\n`;
    updated = updated.replace(/^content: \|/m, block + 'content: |');
  } else {
    const fromMatch = raw.match(/^version: (\d+)/m);
    const fromVersion = fromMatch ? parseInt(fromMatch[1], 10) : 1;
    const target = req.version || Math.max(1, fromVersion - 1);
    updated = raw.replace(/^version: .*$/m, `version: ${target}`);
    const block = `rollback:\n  from_version: ${fromVersion}\n  at: "${now}"\n  by: [${(req.approvers || []).map((b) => `"${b}"`).join(', ')}]\n  reason: "${(req.reason || '').replace(/"/g, '\\"')}"\n`;
    updated = updated.replace(/^content: \|/m, block + 'content: |');
  }

  fs.writeFileSync(filePath, updated);

  await logGovernance({
    rule: 'instinct-rollback',
    severity: 'info',
    message: `Instinct ${req.deactivate ? 'deactivated' : 'rolled back'}: ${req.instinctId}`,
    context: { instinct_id: req.instinctId, zone: zoneDir(req.zone), approvers: req.approvers, reason: req.reason },
  });

  return filePath;
}

function list(zone) {
  const dir = ledgerDir(zone);
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((f) => f.endsWith('.yml')).map((f) => f.replace(/\.yml$/, ''));
}

// ---- CLI (rollback / list) — what /instinct-rollback invokes ----
function parseCliArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--rollback') out._mode = 'rollback';
    else if (a === '--list') out._mode = 'list';
    else if (a === '--deactivate') out.deactivate = true;
    else if (a.startsWith('--')) out[a.slice(2)] = argv[++i];
  }
  return out;
}

async function runCli(argv) {
  const args = parseCliArgs(argv);

  if (args._mode === 'list') {
    list(args.zone || 'corporate').forEach((id) => process.stdout.write(id + '\n'));
    return 0;
  }

  if (args._mode === 'rollback') {
    const approvers = args.approvers ? String(args.approvers).split(',').map((s) => s.trim()).filter(Boolean) : [];
    if (!args.id) { process.stderr.write('❌ rollback requires --id\n'); return 1; }
    if (!args.reason) { process.stderr.write('❌ rollback requires --reason\n'); return 1; }
    if (approvers.length < 1) { process.stderr.write('❌ rollback requires at least one --approvers\n'); return 1; }
    const zone = args.zone || 'corporate';
    // Compliance / HSA rollbacks require two distinct approvers.
    const needDual = zone === 'in-zone' || zone === 'hsa' || /^(1|true|yes)$/i.test(String(args.compliance || ''));
    if (needDual && new Set(approvers).size < 2) {
      process.stderr.write('❌ compliance/HSA rollback requires two distinct --approvers\n');
      return 1;
    }
    try {
      const p = await rollback({ instinctId: args.id, zone, version: args.version ? parseInt(args.version, 10) : undefined, deactivate: args.deactivate, reason: args.reason, approvers });
      process.stdout.write(`✅ Instinct ${args.deactivate ? 'deactivated' : 'rolled back'}: ${p}\n`);
      return 0;
    } catch (e) {
      process.stderr.write(`❌ ${e.message}\n`);
      return 1;
    }
  }

  process.stderr.write('usage: instinct-ledger.js (--rollback|--list) [--id ..] [--zone ..] [--reason ..] [--approvers a,b] [--deactivate] [--version n]\n');
  return 2;
}

if (require.main === module) {
  runCli(process.argv.slice(2)).then((code) => process.exit(code));
}

module.exports = {
  zoneDir,
  ledgerDir,
  instinctPath,
  exists,
  logGovernance,
  toYaml,
  promote,
  rollback,
  list,
  parseCliArgs,
  runCli,
};
