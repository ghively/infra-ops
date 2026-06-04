#!/usr/bin/env node
/**
 * Infra-Ops Learning Promotion Gate
 *
 * Final safety gate for instinct promotion requiring:
 * - Human approval (signature + timestamp)
 * - Documentation citation (for compliance items)
 * - Minimum confidence score (0.7)
 * - Zone sandbox verification
 *
 * This is the final gate before learned patterns become instincts.
 *
 * Environment Variables:
 * - INFRA_BYPASS_LEARNING_GATE: "1" for emergency bypass (AUDIT LOGGED)
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
  const parameters = toolInput.parameters || toolInput;

  return {
    instinctId: parameters.id || parameters.instinct_id || null,
    version: parameters.version || 1,
    content: parameters.content || parameters.pattern || '',
    zone: parameters.zone || 'corpor',
    confidence: parameters.confidence || 0.0,
    evidence: parameters.evidence || [],
    approver: parameters.approver || parameters.promoted_by || null,
    approverSignature: parameters.approver_signature || parameters.signature || null,
    citation: parameters.citation || null,
    timestamp: parameters.timestamp || new Date().toISOString()
  };
}

/**
 * Validate promotion requirements
 */
function validatePromotion(request) {
  const errors = [];
  const warnings = [];

  // Check 1: Human approval (signature + timestamp)
  if (!request.approver) {
    errors.push('LEARNING_GATE: Requires approver identifier');
  }

  if (!request.approverSignature && !request.timestamp) {
    errors.push('LEARNING_GATE: Requires approver signature or timestamp');
  }

  // Check 2: Documentation citation (for compliance-related instincts)
  const complianceKeywords = ['pci', 'dss', 'cpsa', 'pin', 'chd', 'card-production', 'hsm'];
  const isComplianceRelated = complianceKeywords.some(keyword =>
    (request.content || '').toLowerCase().includes(keyword)
  );

  if (isComplianceRelated && !request.citation) {
    errors.push('LEARNING_GATE: Compliance-related instincts require documentation citation (e.g., "PCI DSS Req 7.2")');
  }

  // Check 3: Minimum confidence score
  if (request.confidence < 0.7) {
    errors.push(`LEARNING_GATE: Confidence below threshold (${request.confidence} < 0.7)`);
  } else if (request.confidence < 0.85) {
    warnings.push(`LEARNING_GATE: Confidence below recommended (${request.confidence} < 0.85)`);
  }

  // Check 4: Zone sandbox verification
  const validZones = ['corpor', 'in-zone', 'hsa'];
  if (!validZones.includes(request.zone)) {
    errors.push(`LEARNING_GATE: Invalid zone "${request.zone}"`);
  }

  // Check 5: HSA zone requires dual-control
  if (request.zone === 'in-zone' || request.zone === 'hsa') {
    const isHSAZone = String(process.env.INFRA_HSA_ZONE || '').toLowerCase() === '1';
    if (!isHSAZone) {
      errors.push('LEARNING_GATE: HSA instinct promotion must occur in HSA zone');
    }
    // Note: Dual-control check is delegated to dual-control-promotion-gate
  }

  // Check 6: Evidence exists
  if (!request.evidence || request.evidence.length === 0) {
    warnings.push('LEARNING_GATE: No supporting evidence provided');
  }

  // Check 7: Instinct ID uniqueness
  const instinctPath = path.join(
    request.zone === 'in-zone' || request.zone === 'hsa' ? INSTINCT_LEDGER.in_zone : INSTINCT_LEDGER.corpor,
    `${request.instinctId}.yml`
  );

  if (fs.existsSync(instinctPath)) {
    warnings.push(`LEARNING_GATE: Instinct ID ${request.instinctId} already exists (will update)`);
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
      rule: 'learning-promotion-gate',
      severity: result === 'denied' ? 'critical' : 'info',
      message: `Instinct promotion ${result}: ${reason}`,
      context: {
        instinct_id: request.instinctId,
        zone: request.zone,
        approver: request.approver,
        confidence: request.confidence
      }
    });

    // Prune old events (max 1000)
    if (state.governanceEvents.length > 1000) {
      state.governanceEvents = state.governanceEvents.slice(-1000);
    }

    fs.writeFileSync(stateStorePath, JSON.stringify(state, null, 2));
  } catch (err) {
    console.error(`[learning-gate] Failed to log event: ${err.message}`);
  }
}

/**
 * Write instinct to ledger
 */
function writeInstinct(request) {
  const ledgerDir = request.zone === 'in-zone' || request.zone === 'hsa'
    ? INSTINCT_LEDGER.in_zone
    : INSTINCT_LEDGER.corpor;

  // Ensure directory exists
  fs.mkdirSync(ledgerDir, { recursive: true });

  const instinctPath = path.join(ledgerDir, `${request.instinctId}.yml`);

  // Format instinct as YAML
  const instinct = {
    id: request.instinctId,
    version: request.version,
    confidence: request.confidence,
    evidence: request.evidence,
    promoted_at: request.timestamp,
    promoted_by: request.approver,
    status: 'active',
    content: request.content
  };

  // Write as YAML (simple formatting)
  const yaml = [
    `id: ${instinct.id}`,
    `version: ${instinct.version}`,
    `confidence: ${instinct.confidence}`,
    `evidence:`,
    ...(instinct.evidence.map(e => [
      `  - observation_id: ${e.observation_id || 'unknown'}`,
      `    citation: "${e.citation || ''}"`
    ]).flat()),
    `promoted_at: "${instinct.promoted_at}"`,
    `promoted_by: "${instinct.promoted_by}"`,
    `status: ${instinct.status}`,
    `content: |`,
    ...instinct.content.split('\n').map(line => `  ${line}`)
  ].join('\n');

  fs.writeFileSync(instinctPath, yaml);
  return instinctPath;
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

  // Only gate promotion tools
  const promotionTools = [
    'instinct_promote',
    'instinct_promotion',
    'learning_promote',
    'pattern_promote'
  ];

  if (!promotionTools.includes(toolName)) {
    return rawInput;
  }

  const request = parsePromotionRequest(toolInput);

  // Check for emergency bypass (AUDIT LOGGED)
  if (String(process.env.INFRA_BYPASS_LEARNING_GATE || '').toLowerCase() === '1') {
    logPromotionAttempt(request, 'allowed', 'EMERGENCY BYPASS ACTIVATED');
    console.error('⚠️  LEARNING_GATE BYPASS ACTIVE - This will be audited');
    return rawInput;
  }

  // Validate promotion requirements
  const validation = validatePromotion(request);

  if (validation.errors.length > 0) {
    const errorMessage = validation.errors.join('\n');
    logPromotionAttempt(request, 'denied', errorMessage);

    return {
      ...rawInput,
      stderr: (rawInput.stderr || '') + `\n❌ LEARNING_GATE DENIED:\n${errorMessage}\n`
    };
  }

  if (validation.warnings.length > 0) {
    const warningMessage = validation.warnings.join('\n');
    console.error(`⚠️  LEARNING_GATE WARNINGS:\n${warningMessage}`);
  }

  // Write instinct to ledger
  try {
    const instinctPath = writeInstinct(request);
    console.error(`✅ LEARNING_GATE PASSED - Instinct written to: ${instinctPath}`);
    logPromotionAttempt(request, 'allowed', 'All requirements met');
  } catch (err) {
    console.error(`⚠️  LEARNING_GATE: Failed to write instinct: ${err.message}`);
    logPromotionAttempt(request, 'failed', `Write error: ${err.message}`);
  }

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
      version: 1,
      content: 'When authoring Ansible playbooks, always use FQCN (Fully Qualified Collection Name).',
      zone: 'corpor',
      confidence: 0.85,
      evidence: [
        { observation_id: 'obs-001', citation: 'Best practices for Ansible 2.+' }
      ],
      approver: 'user-123',
      signature: 'abc123',
      citation: 'Ansible Best Practices',
      timestamp: new Date().toISOString()
    }
  };

  console.error('Testing learning promotion gate...');
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
  validatePromotion,
  logPromotionAttempt,
  writeInstinct,
  run
};
