#!/usr/bin/env node

/**
 * Validate agent files
 * Checks for proper frontmatter and required sections
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const AGENTS_DIR = path.resolve(__dirname, '../../agents');

function validateAgentFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const errors = [];

  // Check for YAML frontmatter
  if (!content.match(/^---\s*\n([\s\S]*?)\n---/)) {
    errors.push('Missing YAML frontmatter');
  }

  // Check for required frontmatter fields
  const frontmatterMatch = content.match(/^---\s*\n([\s\S]*?)\n---/);
  if (frontmatterMatch) {
    const frontmatter = frontmatterMatch[1];
    const requiredFields = ['name', 'description'];
    for (const field of requiredFields) {
      if (!frontmatter.includes(`${field}:`)) {
        errors.push(`Missing required frontmatter field: ${field}`);
      }
    }
  }

  // Check for Prompt Defense Baseline
  if (!content.includes('Prompt Defense Baseline')) {
    errors.push('Missing "Prompt Defense Baseline" section');
  }

  // Check for required sections
  const requiredSections = ['## Mission'];
  for (const section of requiredSections) {
    if (!content.includes(section)) {
      errors.push(`Missing required section: ${section}`);
    }
  }

  return errors;
}

function main() {
  const agentFiles = fs.readdirSync(AGENTS_DIR)
    .filter(f => f.endsWith('.md'))
    .map(f => path.join(AGENTS_DIR, f));

  if (agentFiles.length === 0) {
    console.log('No agent files found to validate');
    process.exit(0);
  }

  let hasErrors = false;

  for (const agentFile of agentFiles) {
    const errors = validateAgentFile(agentFile);
    if (errors.length > 0) {
      hasErrors = true;
      console.error(`\n❌ ${path.basename(agentFile)}:`);
      errors.forEach(e => console.error(`   - ${e}`));
    } else {
      console.log(`✓ ${path.basename(agentFile)}`);
    }
  }

  if (hasErrors) {
    process.exit(1);
  }

  console.log('\n✅ All agents validated');
}

main();
