#!/usr/bin/env node
/**
 * Infra-Ops Dual-Control Promotion Gate
 *
 * CPSA-gated check that blocks instinct promotion within the HSA zone without
 * two-person (distinct) approval and a documentation citation.
 *
 * Required for: PCI DSS Req 7.2 (two-person control for critical systems) and
 * PCI Card Production logical-security separation of duties.
 *
 * Governance logging is delegated to the shared instinct-ledger library so events
 * land in the single State Store.
 *
 * Modes:
 *   CLI:   node dual-control-promotion-gate.js --check --id <id> --zone <zone> \
 *            --approvers a,b --citation "<ref>" [--confidence <n>]
 *          Exits 0 if dual-control satisfied, non-zero otherwise.
 *   Hook:  stdin JSON; denies a promotion tool call that fails dual control.
 *
 * Environment:
 *   INFRA_HSA_ZONE=1               required for in-zone/hsa promotions
 *   INFRA_BYPASS_DUAL_CONTROL=1    emergency bypass (AUDIT LOGGED)
 */

'use strict';

const ledger = require('../lib/instinct-ledger.js');

function parseRequest(input) {
  const p = input.parameters || input;
  let approvers = p.approvers || [];
  if (typeof approvers === 'string') approvers = approvers.split(',').map((s) => s.trim()).filter(Boolean);
  return {
    instinctId: p.id || p.instinct_id || null,
    zone: p.zone || 'corporate',
    confidence: typeof p.confidence === 'number' ? p.confidence : parseFloat(p.confidence || '0') || 0,
    approvers,
    citation: p.citation || null,
    timestamp: p.timestamp || new Date().toISOString(),
  };
}

function validateDualControl(request) {
  const errors = [];
  const warnings = [];

  const names = (request.approvers || []).map((a) => (typeof a === 'string' ? a : a.name));
  if (names.length < 2) {
    errors.push(`DUAL_CONTROL: Requires at least 2 approvers (got ${names.length})`);
  } else if (new Set(names).size < 2) {
    errors.push('DUAL_CONTROL: Approvers must be distinct persons');
  }

  if (!request.citation) {
    errors.push('DUAL_CONTROL: Requires documentation citation (e.g., "PCI DSS Req 7.2")');
  }

  if (request.confidence < 0.7) {
    warnings.push(`DUAL_CONTROL: Confidence below threshold (${request.confidence} < 0.7)`);
  }

  if (request.zone === 'hsa' || request.zone === 'in-zone') {
    if (String(process.env.INFRA_HSA_ZONE || '').toLowerCase() !== '1') {
      errors.push('DUAL_CONTROL: HSA instinct promotion must occur in the HSA zone (INFRA_HSA_ZONE=1)');
    }
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

async function processDualControl(request) {
  if (String(process.env.INFRA_BYPASS_DUAL_CONTROL || '').toLowerCase() === '1') {
    await ledger.logGovernance({
      rule: 'dual-control-promotion-gate', severity: 'critical',
      message: 'EMERGENCY BYPASS ACTIVATED', context: { instinct_id: request.instinctId, zone: request.zone },
    });
    process.stderr.write('⚠️  DUAL_CONTROL BYPASS ACTIVE — this is audited\n');
    return { ok: true, errors: [], warnings: ['bypass'] };
  }

  const { errors, warnings } = validateDualControl(request);
  await ledger.logGovernance({
    rule: 'dual-control-promotion-gate',
    severity: errors.length ? 'critical' : 'info',
    message: errors.length ? `Dual control denied: ${errors.join('; ')}` : 'Dual control satisfied',
    context: { instinct_id: request.instinctId, zone: request.zone, approvers: request.approvers, citation: request.citation },
  });
  return { ok: errors.length === 0, errors, warnings };
}

// ---- CLI ----
function parseCliArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--check') out._check = true;
    else if (a.startsWith('--')) out[a.slice(2)] = argv[++i];
  }
  return out;
}

async function runCli(argv) {
  const args = parseCliArgs(argv);
  const request = parseRequest({
    id: args.id, zone: args.zone, confidence: args.confidence,
    approvers: args.approvers, citation: args.citation,
  });
  const result = await processDualControl(request);
  result.warnings.forEach((w) => process.stderr.write(`⚠️  ${w}\n`));
  if (!result.ok) {
    process.stderr.write(`❌ DUAL_CONTROL DENIED:\n${result.errors.join('\n')}\n`);
    return 1;
  }
  process.stdout.write('✅ DUAL_CONTROL satisfied\n');
  return 0;
}

// ---- Hook ----
const PROMOTION_TOOLS = ['instinct_promote', 'instinct_promotion', 'role_promote', 'learning_promotion'];

async function runHook(raw) {
  let input;
  try {
    input = typeof raw === 'string' ? JSON.parse(raw) : raw;
  } catch {
    return null;
  }
  if (!PROMOTION_TOOLS.includes(input.tool_name || '')) return null;

  const request = parseRequest(input.tool_input || {});
  // Only gate HSA-zone promotions in the hook path.
  if (request.zone !== 'hsa' && request.zone !== 'in-zone') return null;

  const result = await processDualControl(request);
  if (!result.ok) {
    return denyDecision(`[infra-ops] HSA dual control not satisfied:\n${result.errors.join('\n')}`);
  }
  return null;
}

if (require.main === module) {
  const argv = process.argv.slice(2);
  if (argv.includes('--check')) {
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
  parseRequest,
  validateDualControl,
  processDualControl,
  parseCliArgs,
  runCli,
  runHook,
};
