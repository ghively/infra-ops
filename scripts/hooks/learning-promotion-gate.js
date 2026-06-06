#!/usr/bin/env node
/**
 * Infra-Ops Learning Promotion Gate
 *
 * Final safety gate for instinct promotion. Enforces:
 * - Human approval (approver identifier)
 * - Documentation citation (for compliance items)
 * - Minimum confidence score (0.7)
 * - Valid zone (and HSA-zone constraint)
 * - Supporting evidence (warning if absent)
 *
 * Persistence (writing the instinct + logging governance) is delegated to the
 * shared instinct-ledger library, so all governance events land in the single
 * State Store rather than a gate-private file.
 *
 * Two invocation modes:
 *   CLI (primary; what /instinct-promote calls):
 *     node learning-promotion-gate.js --promote --id <id> --zone <zone> \
 *       --content <text> --approver <user> [--confidence <n>] [--citation <ref>] \
 *       [--evidence <id,id>] [--dry-run]
 *     Exits 0 on success, non-zero on denial.
 *
 *   Hook (stdin JSON): denies a promotion tool call that fails validation by
 *     emitting a PreToolUse deny decision.
 *
 * Environment:
 *   INFRA_BYPASS_LEARNING_GATE=1   emergency bypass (AUDIT LOGGED)
 *   INFRA_HSA_ZONE=1               required for in-zone/hsa promotions
 */

'use strict';

const ledger = require('../lib/instinct-ledger.js');

// Canonical: corporate | hsa. Legacy aliases corpor | in-zone accepted for back-compat.
const VALID_ZONES = ['corporate', 'hsa', 'corpor', 'in-zone'];
const COMPLIANCE_KEYWORDS = ['pci', 'dss', 'cpsa', 'pin', 'chd', 'card-production', 'hsm'];

function parsePromotionRequest(input) {
  const p = input.parameters || input;
  return {
    instinctId: p.id || p.instinct_id || null,
    version: p.version || 1,
    content: p.content || p.pattern || '',
    zone: p.zone || 'corporate',
    confidence: typeof p.confidence === 'number' ? p.confidence : parseFloat(p.confidence || '0') || 0,
    evidence: p.evidence || [],
    approver: p.approver || p.promoted_by || null,
    citation: p.citation || null,
    timestamp: p.timestamp || new Date().toISOString(),
  };
}

function validatePromotion(request) {
  const errors = [];
  const warnings = [];

  if (!request.instinctId) errors.push('LEARNING_GATE: Requires an instinct id (--id)');
  if (!request.approver) errors.push('LEARNING_GATE: Requires approver identifier (--approver)');

  const isCompliance = COMPLIANCE_KEYWORDS.some((k) => (request.content || '').toLowerCase().includes(k));
  if (isCompliance && !request.citation) {
    errors.push('LEARNING_GATE: Compliance-related instincts require a documentation citation (e.g., "PCI DSS Req 7.2")');
  }

  if (request.confidence < 0.7) {
    errors.push(`LEARNING_GATE: Confidence below threshold (${request.confidence} < 0.7)`);
  } else if (request.confidence < 0.85) {
    warnings.push(`LEARNING_GATE: Confidence below recommended (${request.confidence} < 0.85)`);
  }

  if (!VALID_ZONES.includes(request.zone)) {
    errors.push(`LEARNING_GATE: Invalid zone "${request.zone}"`);
  }

  if (request.zone === 'in-zone' || request.zone === 'hsa') {
    if (String(process.env.INFRA_HSA_ZONE || '').toLowerCase() !== '1') {
      errors.push('LEARNING_GATE: HSA instinct promotion must occur in the HSA zone (INFRA_HSA_ZONE=1)');
    }
    // Dual-control is enforced separately by dual-control-promotion-gate.
  }

  if (!request.evidence || request.evidence.length === 0) {
    warnings.push('LEARNING_GATE: No supporting evidence provided');
  }

  if (request.instinctId && ledger.exists(request.zone, request.instinctId)) {
    warnings.push(`LEARNING_GATE: Instinct ${request.instinctId} already exists (will overwrite)`);
  }

  return { errors, warnings };
}

function denyDecision(reason) {
  return {
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason: reason,
    },
  };
}

/**
 * Validate + (optionally) write. Returns { ok, errors, warnings, path }.
 */
async function processPromotion(request, { write = true } = {}) {
  if (String(process.env.INFRA_BYPASS_LEARNING_GATE || '').toLowerCase() === '1') {
    await ledger.logGovernance({
      rule: 'learning-promotion-gate', severity: 'critical',
      message: 'EMERGENCY BYPASS ACTIVATED', context: { instinct_id: request.instinctId, zone: request.zone },
    });
    process.stderr.write('⚠️  LEARNING_GATE BYPASS ACTIVE — this is audited\n');
    let bypassPath;
    if (write) bypassPath = await ledger.promote(request);
    return { ok: true, errors: [], warnings: ['bypass'], path: bypassPath };
  }

  const { errors, warnings } = validatePromotion(request);
  if (errors.length > 0) {
    await ledger.logGovernance({
      rule: 'learning-promotion-gate', severity: 'critical',
      message: `Instinct promotion denied: ${errors.join('; ')}`,
      context: { instinct_id: request.instinctId, zone: request.zone, approver: request.approver },
    });
    return { ok: false, errors, warnings };
  }

  let writtenPath;
  if (write) writtenPath = await ledger.promote(request);
  return { ok: true, errors: [], warnings, path: writtenPath };
}

// ---- CLI ----
function parseCliArgs(argv) {
  const out = { _mode: null };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--promote') out._mode = 'promote';
    else if (a === '--validate') out._mode = 'validate';
    else if (a === '--dry-run') out.dryRun = true;
    else if (a.startsWith('--')) out[a.slice(2)] = argv[++i];
  }
  return out;
}

async function runCli(argv) {
  const args = parseCliArgs(argv);
  const request = parsePromotionRequest({
    id: args.id, zone: args.zone, content: args.content, confidence: args.confidence,
    citation: args.citation, approver: args.approver,
    evidence: args.evidence ? String(args.evidence).split(',').map((id) => ({ observation_id: id.trim() })) : [],
  });

  const write = args._mode === 'promote' && !args.dryRun;
  const result = await processPromotion(request, { write });

  result.warnings.forEach((w) => process.stderr.write(`⚠️  ${w}\n`));
  if (!result.ok) {
    process.stderr.write(`❌ LEARNING_GATE DENIED:\n${result.errors.join('\n')}\n`);
    return 1;
  }
  if (result.path) process.stdout.write(`✅ Instinct written to ${result.path}\n`);
  else process.stdout.write('✅ LEARNING_GATE PASSED (no write — validate/dry-run)\n');
  return 0;
}

// ---- Hook (stdin) ----
const PROMOTION_TOOLS = ['instinct_promote', 'instinct_promotion', 'learning_promote', 'pattern_promote'];

async function runHook(raw) {
  let input;
  try {
    input = typeof raw === 'string' ? JSON.parse(raw) : raw;
  } catch {
    return null;
  }
  if (!PROMOTION_TOOLS.includes(input.tool_name || '')) return null;

  const request = parsePromotionRequest(input.tool_input || {});
  // In hook mode we validate only; the actual write happens via the CLI path.
  const result = await processPromotion(request, { write: false });
  if (!result.ok) {
    return denyDecision(`[infra-ops] Instinct promotion blocked:\n${result.errors.join('\n')}`);
  }
  return null;
}

if (require.main === module) {
  const argv = process.argv.slice(2);
  if (argv.includes('--promote') || argv.includes('--validate')) {
    runCli(argv).then((code) => process.exit(code));
  } else {
    let raw = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (c) => { raw += c; });
    process.stdin.on('end', async () => {
      const decision = await runHook(raw);
      if (decision) process.stdout.write(JSON.stringify(decision));
      process.exit(0);
    });
  }
}

module.exports = {
  parsePromotionRequest,
  validatePromotion,
  processPromotion,
  parseCliArgs,
  runCli,
  runHook,
};
