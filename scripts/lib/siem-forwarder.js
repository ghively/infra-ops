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
const fs = require('fs');
const path = require('path');

// State Store path
const STATE_STORE_PATH = process.env.INFRA_OPS_STATE_STORE ||
  path.join(process.env.CLAUDE_PLUGIN_ROOT || '.', '.infra-ops', 'state-store.json');

/**
 * SIEM forwarder configuration
 */
function getConfig() {
  return {
    enabled: String(process.env.SIEM_ENABLED || '').toLowerCase() === '1',
    type: process.env.SIEM_TYPE || 'webhook',
    endpoint: process.env.SIEM_ENDPOINT || '',
    token: process.env.SIEM_TOKEN || '',
    source: process.env.SIEM_SOURCE || 'infra-ops',
    sourcetype: process.env.SIEM_SOURCETYPE || 'json',
    index: process.env.SIEM_INDEX || 'main',
    timeout: parseInt(process.env.SIEM_TIMEOUT || '5000', 10)
  };
}

/**
 * Load State Store
 */
function loadStateStore() {
  try {
    if (fs.existsSync(STATE_STORE_PATH)) {
      const raw = fs.readFileSync(STATE_STORE_PATH, 'utf8');
      return JSON.parse(raw);
    }
  } catch (err) {
    // State store not readable
  }
  return {
    sessions: [],
    skillRuns: [],
    decisions: [],
    governanceEvents: [],
    knowledgeBase: [],
    installState: [],
    workItems: []
  };
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

/**
 * Forward governance events to SIEM
 */
function forwardGovernanceEvents(config) {
  const state = loadStateStore();
  const events = state.governanceEvents || [];

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
function forwardSkillRuns(config) {
  const state = loadStateStore();
  const runs = state.skillRuns || [];

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
function forwardSessionActivity(config) {
  const state = loadStateStore();
  const sessions = state.sessions || [];

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
