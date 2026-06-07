'use strict';
const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

const INSTINCT_ROOT = path.join(__dirname, '../../knowledge/instincts');
const REQUIRED_FIELDS = ['id', 'zone', 'category', 'status', 'confidence', 'content', 'citation', 'promoted_by', 'promoted_at'];
const VALID_ZONES = ['corporate', 'hsa'];
const VALID_STATUSES = ['active', 'deprecated', 'candidate'];

let errors = 0;

function err(file, msg) {
  console.error(`FAIL [${file}]: ${msg}`);
  errors++;
}

function validateInstinct(instinct, filePath) {
  for (const field of REQUIRED_FIELDS) {
    if (instinct[field] === undefined || instinct[field] === null || instinct[field] === '') {
      err(filePath, `instinct id="${instinct.id || '?'}" missing required field: ${field}`);
    }
  }
  if (!VALID_ZONES.includes(instinct.zone)) {
    err(filePath, `instinct id="${instinct.id}" has invalid zone: ${instinct.zone}`);
  }
  if (!VALID_STATUSES.includes(instinct.status)) {
    err(filePath, `instinct id="${instinct.id}" has invalid status: ${instinct.status}`);
  }
  if (typeof instinct.confidence !== 'number' || instinct.confidence < 0 || instinct.confidence > 1) {
    err(filePath, `instinct id="${instinct.id}" confidence must be a number 0.0–1.0`);
  }
}

function walkDir(dir) {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkDir(full);
    } else if (entry.name.endsWith('.yaml') || entry.name.endsWith('.yml')) {
      const rel = path.relative(process.cwd(), full);
      try {
        const parsed = yaml.load(fs.readFileSync(full, 'utf8'), { schema: yaml.DEFAULT_SAFE_SCHEMA });
        if (!parsed || !Array.isArray(parsed.instincts)) {
          err(rel, 'file must contain top-level `instincts:` array');
          continue;
        }
        for (const instinct of parsed.instincts) {
          validateInstinct(instinct, rel);
        }
        console.log(`OK  [${rel}] (${parsed.instincts.length} instincts)`);
      } catch (e) {
        err(rel, `YAML parse error: ${e.message}`);
      }
    }
  }
}

walkDir(INSTINCT_ROOT);

if (errors === 0) {
  console.log(`\nvalidate-instincts: all instincts valid`);
  process.exit(0);
} else {
  console.error(`\nvalidate-instincts: ${errors} error(s) found`);
  process.exit(1);
}
