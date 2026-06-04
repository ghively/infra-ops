#!/usr/bin/env node

/**
 * Validate command files
 * Checks for proper frontmatter
 */

const fs = require('fs');
const path = require('path');

const COMMANDS_DIR = path.resolve(__dirname, '../../commands');

function validateCommandFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const errors = [];

  // Check for description frontmatter
  if (!content.match(/^---\s*\n([\s\S]*?)\n---/)) {
    errors.push('Missing YAML frontmatter');
  }

  const frontmatterMatch = content.match(/^---\s*\n([\s\S]*?)\n---/);
  if (frontmatterMatch) {
    const frontmatter = frontmatterMatch[1];
    if (!frontmatter.includes('description:')) {
      errors.push('Missing required frontmatter field: description');
    }
  }

  return errors;
}

function main() {
  const commandFiles = fs.readdirSync(COMMANDS_DIR)
    .filter(f => f.endsWith('.md'))
    .map(f => path.join(COMMANDS_DIR, f));

  if (commandFiles.length === 0) {
    console.log('No command files found to validate');
    process.exit(0);
  }

  let hasErrors = false;

  for (const commandFile of commandFiles) {
    const errors = validateCommandFile(commandFile);
    if (errors.length > 0) {
      hasErrors = true;
      console.error(`\n❌ ${path.basename(commandFile)}:`);
      errors.forEach(e => console.error(`   - ${e}`));
    } else {
      console.log(`✓ ${path.basename(commandFile)}`);
    }
  }

  if (hasErrors) {
    process.exit(1);
  }

  console.log('\n✅ All commands validated');
}

main();
