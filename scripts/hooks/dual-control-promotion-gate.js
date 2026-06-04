#!/usr/bin/env node
/**
 * Infra-Ops Dual-Control Promotion Gate
 *
 * CPSA-gated hook that blocks instinct/role promotion within the HSA zone
 * without two-person approval and documentation citation.
 *
 * Required for: PCI DSS Req 7.2 (Two-person control for critical systems)
 *
 * Environment Variables:
 * - INFRA_HSA_ZONE: "1" when operating in HSA zone
 * - INFRA_BYPASS_DUAL_CONTROL: "1" for emergency bypass (AUDIT LOGGED)
 *
 * Usage: Called by instinct-promotion skill before promotion actions
 */

'use strict';

const fs = require('fs');
const path = require('path');

// State Store path
const STATE_STORE_PATH = process.env.INFRA_OPS_STATE_STORE ||
  path.join(process.env.CLAUDE_PLUGIN_ROOT || '.', '.infra-ops', 'state-store.json');

// Instinct ledger paths
const INSTINCT_LEDGER = {
  corpor: path.join(process.env.CLAUDE_PLUGIN_ROOT || '.', 'knowledge', 'instincts', 'corpor'),
  in_zone: path.join(process.env.CLAUDE_PLUGIN_ROOT || '.', 'knowledge', 'instincts', 'in-zone')
};

/**
 * Parse promotion request from tool input
 */
function parsePromotionRequest(toolInput) {
  // Look for promotion parameters in various tool calls
  const parameters = toolInput.parameters || toolInput;

  return {
    instinctId: parameters.id || parameters.instinct_id || null,
    zone: parameters.zone || 'corpor',
    confidence: parameters.confidence || 0.0,
    approvers: parameters.approvers || [],
    citation: parameters.citation || null,
    timestamp: parameters.timestamp || new Date().toISOString()
  };
}

/**
 * Validate dual-control requirements
 */
function validateDualControl(request) {
  const errors = [];
  const warnings = [];

  // Check 1: Two-person approval
  if (!request.approvers || request.approvers.length < 2) {
    errors.push(`DUAL_CONTROL: Requires at least 2 approvers (got ${request.approvers?.length || 0})`);
  } else {
    // Verify approvers are distinct
    const uniqueApprovers = new Set(request.approvers);
    if (uniqueApprovers.size < 2) {
      errors.push('DUAL_CONTROL: Approvers must be distinct persons');
    }
  }

  // Check 2: Documentation citation for compliance items
  if (!request.citation) {
    errors.push('DUAL_CONTROL: Requires documentation citation (e.g., "PCI DSS Req 7.2")');
  }

  // Check 3: Minimum confidence threshold
  if (request.confidence < 0.7) {
    warnings.push(`DUAL_CONTROL: Confidence below threshold (${request.confidence} < 0.7)`);
  }

  // Check 4: Zone sandbox verification (HSA only)
  if (request.zone === 'hsa' || request.zone === 'in-zone') {
    const isHSAZone = String(process.env.INFRA_HSA_ZONE || '').toLowerCase() === '1';
    if (!isHSAZone) {
      errors.push('DUAL_CONTROL: HSA instinct promotion must occur in HSA zone');
    }
  }

  // Check 5: Approver signatures (mock - requires actual signature verification)
  if (request.approvers) {
    request.approvers.forEach((approver, idx) => {
      if (!approver.signature && !approver.signed_at) {
        warnings.push(`DUAL_CONTROL: Approver ${idx + 1} missing signature/timestamp`);
      }
    });
  }

  return { errors, warnings };
}

/**
 * Log promotion attempt to governance events
 */
function logPromotionAttempt(request, result, reason) {
  try {
    const stateStorePath = STATE_STORE_PATH;
    let state = {};

    if (fs.existsSync(stateStorePath)) {
      state = JSON.parse(fs.readFileSync(stateStorePath, 'utf8'));
    }

    state.governanceEvents = state.governanceEvents || [];
    state.governanceEvents.push({
      id: `gov-${Date.now()}`,
      timestamp: new Date().toISOString(),
      rule: 'dual-control-promotion-gate',
      severity: result === 'denied' ? 'critical' : 'info',
      message: `Instinct promotion ${result}: ${reason}`,
      context: {
        instinct_id: request.instinctId,
        zone: request.zone,
        approvers: request.approvers,
        citation: request.citation
      }
    });

    // Prune old events (max 1000)
    if (state.governanceEvents.length > 1000) {
      state.governanceEvents = state.governanceEvents.slice(-1000);
    }

    fs.writeFileSync(stateStorePath, JSON.stringify(state, null, 2));
  } catch (err) {
    // Log failure should not block the gate
    console.error(`[dual-control-gate] Failed to log event: ${err.message}`);
  }
}

/**
 * Core gate logic
 */
function run(rawInput) {
  let input;
  try {
    input = typeof rawInput === 'string' ? JSON.parse(rawInput) : rawInput;
  } catch {
    return rawInput;
  }

  const toolName = input.tool_name || '';
  const toolInput = input.tool_input || {};

  // Only gate promotion-related tools
  const promotionTools = [
    'instinct_promote',
    'instinct_promotion',
    'role_promote',
    'learning_promotion'
  ];

  if (!promotionTools.includes(toolName)) {
    return rawInput;
  }

  const request = parsePromotionRequest(toolInput);

  // Check for emergency bypass (AUDIT LOGGED)
  if (String(process.env.INFRA_BYPASS_DUAL_CONTROL || '').toLowerCase() === '1') {
    logPromotionAttempt(request, 'allowed', 'EMERGENCY BYPASS ACTIVATED');
    console.error('⚠️  DUAL_CONTROL BYBASS ACTIVE - This will be audited');
    return rawInput;
  }

  // Validate dual-control requirements
  const validation = validateDualControl(request);

  if (validation.errors.length > 0) {
    const errorMessage = validation.errors.join('\n');
    logPromotionAttempt(request, 'denied', errorMessage);

    return {
      ...rawInput,
      stderr: (rawInput.stderr || '') + `\n❌ DUAL_CONTROL_GATE DENIED:\n${errorMessage}\n`
    };
  }

  if (validation.warnings.length > 0) {
    const warningMessage = validation.warnings.join('\n');
    console.error(`⚠️  DUAL_CONTROL_GATE WARNINGS:\n${warningMessage}`);
  }

  logPromotionAttempt(request, 'allowed', 'All dual-control requirements met');
  console.error('✅ DUAL_CONTROL_GATE PASSED');

  return rawInput;
}

/**
 * CLI entry point for testing
 */
async function main() {
  const args = process.argv.slice(2);
  const testRequest = {
    tool_name: 'instinct_promote',
    tool_input: {
      id: 'instinct-001',
      zone: 'hsa',
      confidence: 0.85,
      approvers: [
        { name: 'senior-op-1', signature: '...', signed_at: new Date().toISOString() },
        { name: 'cpsa-assessor', signature: '...', signed_at: new Date().toISOString() }
      ],
      citation: 'PCI DSS Req 7.2 - Two-person control for critical systems'
    }
  };

  console.error('Testing dual-control gate with sample request...');
  const result = run(testRequest);

  if (result.stderr && result.stderr.includes('DENIED')) {
    console.error('Result: DENIED');
    process.exit(1);
  } else {
    console.error('Result: ALLOWED');
    process.exit(0);
  }
}

/**
 * Stdin entry point
 */
if (require.main === module) {
  if (process.argv.includes('--test')) {
    main();
  } else {
    let raw = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', chunk => { raw += chunk; });
    process.stdin.on('end', () => {
      const result = run(raw);
      process.stdout.write(typeof result === 'string' ? result : JSON.stringify(result));
    });
  }
}

module.exports = {
  parsePromotionRequest,
  validateDualControl,
  logPromotionAttempt,
  run
};
