#!/usr/bin/env node
/**
 * Infra-Ops SIEM Forwarder
 *
 * forwards governance events and audit logs to SIEM systems.
 * Supports: Splunk HEC, Elastic HTTP, generic webhook endpoints.
 *
 * Environment Variables:
 * - SIEM_ENABLED: "1" to enable forwarding
 * - SIEM_TYPE: "splunk" | "elastic" | "webhook"
 * - SIEM_ENDPOINT: HTTP(S) endpoint URL
 * - SIEM_TOKEN: Auth token (for Splunk HEC)
 * - SIEM_SOURCE: Source identifier (default: "infra-ops")
 * - SIEM_SOURCETYPE: Splunk sourcetype (default: "json")
 * - SIEM_INDEX: Splunk index (optional)
 */

'use strict';

const https = require('https');
const http = require('http');
const { URL } = require('url');
const { retry } = require('./retry.js');

// Transient network/timeout failures worth retrying.
function isTransient(err) {
  const code = err && err.code;
  if (['ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT', 'EAI_AGAIN', 'EPIPE'].includes(code)) return true;
  return /timeout|socket hang up|network/i.test((err && err.message) || '');
}

// Read from the unified State Store library (single source of truth).
let StateStore;
try {
  StateStore = require('./state-store.js');
} catch {
  StateStore = null;
}

/**
 * SIEM forwarder configuration.
 *
 * The documented one-liner is INFRAOPS_AUDIT_FORWARD (a webhook endpoint). The
 * SIEM_* variables remain available for richer setups (Splunk HEC / Elastic).
 */
function getConfig() {
  const endpoint = process.env.SIEM_ENDPOINT || process.env.INFRAOPS_AUDIT_FORWARD || '';
  return {
    enabled: String(process.env.SIEM_ENABLED || '').toLowerCase() === '1' || !!process.env.INFRAOPS_AUDIT_FORWARD,
    type: process.env.SIEM_TYPE || 'webhook',
    endpoint,
    token: process.env.SIEM_TOKEN || '',
    source: process.env.SIEM_SOURCE || 'infra-ops',
    sourcetype: process.env.SIEM_SOURCETYPE || 'json',
    index: process.env.SIEM_INDEX || 'main',
    timeout: parseInt(process.env.SIEM_TIMEOUT || '5000', 10)
  };
}

/**
 * Forward a single record in real time (used by governance-ledger). Fire-and-forget
 * friendly: resolves on success, rejects on transport error.
 */
function forwardRecord(record, config = getConfig()) {
  if (!config.enabled || !config.endpoint) return Promise.resolve({ skipped: true });
  const event = formatEvent(record, 'audit_record', config);
  return retry(() => sendEvent(event, config), { retries: 3, baseMs: 500, shouldRetry: isTransient });
}

/**
 * Format event for SIEM consumption
 */
function formatEvent(event, eventType, config) {
  const base = {
    timestamp: new Date().toISOString(),
    source: config.source,
    event_type: eventType,
    hostname: require('os').hostname(),
    session_id: process.env.CLAUDE_SESSION_ID || 'unknown'
  };

  switch (config.type) {
    case 'splunk':
      // Splunk HEC format
      return {
        time: Math.floor(Date.now() / 1000),
        host: base.hostname,
        source: config.source,
        sourcetype: config.sourcetype,
        index: config.index,
        event: {
          ...base,
          ...event
        }
      };

    case 'elastic':
      // ECS (Elastic Common Schema) format
      return {
        '@timestamp': new Date().toISOString(),
        agent: {
          name: 'infra-ops',
          version: '1.0.0'
        },
        event: {
          action: eventType,
          category: ['configuration', 'security'],
          type: ['info'],
          ...event
        },
        host: {
          hostname: base.hostname,
          name: base.hostname
        },
        source: config.source
      };

    case 'webhook':
    default:
      // Generic JSON format
      return {
        ...base,
        ...event
      };
  }
}

/**
 * Send event to SIEM endpoint
 */
function sendEvent(event, config) {
  return new Promise((resolve, reject) => {
    if (!config.endpoint) {
      return reject(new Error('SIEM_ENDPOINT not configured'));
    }

    const url = new URL(config.endpoint);
    const isHttps = url.protocol === 'https:';
    const client = isHttps ? https : http;

    const payload = JSON.stringify(event);
    const headers = {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(payload)
    };

    // Add auth for Splunk HEC
    if (config.type === 'splunk' && config.token) {
      headers['Authorization'] = `Splunk ${config.token}`;
    }
    // Add auth token for generic endpoints
    else if (config.token) {
      headers['Authorization'] = `Bearer ${config.token}`;
    }

    const options = {
      hostname: url.hostname,
      port: url.port || (isHttps ? 443 : 80),
      path: url.pathname + url.search,
      method: 'POST',
      headers,
      timeout: config.timeout
    };

    const req = client.request(options, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve({ statusCode: res.statusCode, body: data });
        } else {
          reject(new Error(`SIEM returned ${res.statusCode}: ${data}`));
        }
      });
    });

    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('SIEM request timeout'));
    });

    req.write(payload);
    req.end();
  });
}

async function readCollection(name) {
  if (!StateStore || !StateStore[name]) return [];
  try {
    return await StateStore[name].getAll();
  } catch {
    return [];
  }
}

/**
 * Forward governance events to SIEM
 */
async function forwardGovernanceEvents(config) {
  const events = await readCollection('governanceEvents');

  return Promise.allSettled(
    events.map(event => {
      const siemEvent = formatEvent({
        severity: event.severity || 'info',
        rule: event.rule || 'unknown',
        message: event.message || '',
        context: event.context || {}
      }, 'governance_event', config);

      return sendEvent(siemEvent, config);
    })
  );
}

/**
 * Forward skill runs to SIEM
 */
async function forwardSkillRuns(config) {
  const runs = await readCollection('skillRuns');

  return Promise.allSettled(
    runs.map(run => {
      const siemEvent = formatEvent({
        skill: run.skill || 'unknown',
        status: run.status || 'unknown',
        duration_ms: run.duration || 0,
        result: run.result || {}
      }, 'skill_run', config);

      return sendEvent(siemEvent, config);
    })
  );
}

/**
 * Forward session activity to SIEM
 */
async function forwardSessionActivity(config) {
  const sessions = await readCollection('sessions');

  return Promise.allSettled(
    sessions.map(session => {
      const siemEvent = formatEvent({
        session_id: session.id,
        start_time: session.startedAt,
        end_time: session.endedAt,
        tool_count: session.toolsUsed || 0,
        file_count: session.filesAccessed || []
      }, 'session_activity', config);

      return sendEvent(siemEvent, config);
    })
  );
}

/**
 * CLI entry point
 */
async function main() {
  const config = getConfig();

  if (!config.enabled) {
    console.error('SIEM forwarding is disabled. Set SIEM_ENABLED=1 to enable.');
    process.exit(1);
  }

  console.error(`SIEM forwarding enabled: ${config.type} → ${config.endpoint}`);

  const results = {
    governanceEvents: await forwardGovernanceEvents(config),
    skillRuns: await forwardSkillRuns(config),
    sessions: await forwardSessionActivity(config)
  };

  // Report results
  let successCount = 0;
  let failCount = 0;

  Object.entries(results).forEach(([type, settled]) => {
    const fulfilled = settled.filter(r => r.status === 'fulfilled').length;
    const rejected = settled.filter(r => r.status === 'rejected').length;
    successCount += fulfilled;
    failCount += rejected;

    console.error(`${type}: ${fulfilled} succeeded, ${rejected} failed`);
  });

  console.error(`Total: ${successCount} events forwarded, ${failCount} failed`);

  process.exit(failCount > 0 ? 1 : 0);
}

/**
 * Library exports
 */
module.exports = {
  getConfig,
  formatEvent,
  sendEvent,
  forwardRecord,
  forwardGovernanceEvents,
  forwardSkillRuns,
  forwardSessionActivity
};

if (require.main === module) {
  main().catch(err => {
    console.error(err);
    process.exit(1);
  });
}
