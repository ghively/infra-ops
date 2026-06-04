#!/usr/bin/env node

/**
 * Validate skill files
 * Checks for proper frontmatter and required sections
 */

const fs = require('fs');
const path = require('path');

const SKILLS_DIR = path.resolve(__dirname, '../../skills');

function validateSkillFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const errors = [];

  // Check for YAML frontmatter
  if (!content.match(/^---\s*\n([\s\S]*?)\n---/)) {
    errors.push('Missing YAML frontmatter');
  }

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

  // Check for recommended sections
  const recommendedSections = ['## When to Use', '## How It Works'];
  for (const section of recommendedSections) {
    if (!content.includes(section)) {
      errors.push(`Missing recommended section: ${section}`);
    }
  }

  return errors;
}

function main() {
  const skillDirs = fs.readdirSync(SKILLS_DIR, { withFileTypes: true })
    .filter(dirent => dirent.isDirectory())
    .map(dirent => path.join(SKILLS_DIR, dirent.name, 'SKILL.md'))
    .filter(f => fs.existsSync(f));

  if (skillDirs.length === 0) {
    console.log('No skill files found to validate');
    process.exit(0);
  }

  let hasErrors = false;

  for (const skillFile of skillDirs) {
    const errors = validateSkillFile(skillFile);
    if (errors.length > 0) {
      hasErrors = true;
      console.error(`\n❌ ${path.basename(path.dirname(skillFile))}/${path.basename(skillFile)}:`);
      errors.forEach(e => console.error(`   - ${e}`));
    } else {
      console.log(`✓ ${path.basename(path.dirname(skillFile))}`);
    }
  }

  if (hasErrors) {
    process.exit(1);
  }

  console.log('\n✅ All skills validated');
}

main();
