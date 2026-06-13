#!/usr/bin/env node
import { spawnSync } from 'child_process';
import { existsSync, readFileSync } from 'fs';

const SECRET_PATTERNS = [
  /AKIA[0-9A-Z]{16}/,
  /ghp_[A-Za-z0-9_]{30,}/,
  /github_pat_[A-Za-z0-9_]{30,}/,
  /sk-[A-Za-z0-9]{32,}/,
  /-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY-----/,
];

const ALLOWED_FILES = new Set([
  '.conveyor/profiles/coder/.env.template',
  '.conveyor/profiles/project-manager/.env.template',
  '.conveyor/profiles/reviewer/.env.template',
]);

function trackedFiles() {
  const result = spawnSync('git', ['ls-files'], { encoding: 'utf8' });
  if (result.status !== 0) {
    throw new Error(result.stderr || 'Unable to list tracked files.');
  }
  return result.stdout.split('\n').filter(Boolean);
}

function main() {
  const findings = [];
  for (const file of trackedFiles()) {
    if (ALLOWED_FILES.has(file) || !existsSync(file)) continue;
    const content = readFileSync(file, 'utf8');
    for (const pattern of SECRET_PATTERNS) {
      if (pattern.test(content)) {
        findings.push(`${file}: matched ${pattern.source}`);
      }
    }
  }

  if (findings.length) {
    console.error('Potential secrets found in tracked files:');
    for (const finding of findings) {
      console.error(`- ${finding}`);
    }
    process.exit(1);
  }

  console.log('No secret patterns found in tracked files.');
}

try {
  main();
} catch (err) {
  console.error(err.message);
  process.exit(1);
}
