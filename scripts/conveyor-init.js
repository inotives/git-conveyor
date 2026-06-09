#!/usr/bin/env node
import { existsSync, mkdirSync, copyFileSync, readdirSync, readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, '..');
const CONVEYOR_DIR = join(PROJECT_ROOT, '.conveyor');

const DIRS = [
  'profiles/project-manager/skills',
  'profiles/coder/skills',
  'profiles/reviewer/skills',
  'shared/kanban',
  'shared/skills',
  'shared/runners/adapters',
  'metrics',
  'alerts/blocked',
  'logs',
];

const GITIGNORE_ENTRIES = [
  '',
  '# Local SQLite DB',
  '.conveyor/shared/kanban/kanban.db',
  '',
  '# Secrets & env files',
  '.conveyor/**/.env',
  '',
  '# Metrics & alerts',
  '.conveyor/metrics/',
  '.conveyor/alerts/',
  '',
  '# Node',
  'node_modules/',
];

function scaffold() {
  console.log('Scaffolding .conveyor/ into the current project...\n');

  for (const dir of DIRS) {
    const fullPath = join(CONVEYOR_DIR, dir);
    if (!existsSync(fullPath)) {
      mkdirSync(fullPath, { recursive: true });
      console.log(`  Created: .conveyor/${dir}/`);
    } else {
      console.log(`  Exists: .conveyor/${dir}/`);
    }
  }

  const gitignorePath = join(PROJECT_ROOT, '.gitignore');
  if (!existsSync(gitignorePath)) {
    writeFileSync(gitignorePath, GITIGNORE_ENTRIES.join('\n'), 'utf8');
    console.log('  Created: .gitignore');
  } else {
    const content = readFileSync(gitignorePath, 'utf8');
    if (!content.includes('kanban.db')) {
      writeFileSync(gitignorePath, content + '\n' + GITIGNORE_ENTRIES.join('\n'), 'utf8');
      console.log('  Updated: .gitignore (added conveyor entries)');
    } else {
      console.log('  Skipped: .gitignore (already has conveyor entries)');
    }
  }

  console.log('\nScaffolding complete! Next steps:');
  console.log('  1. Run: npm install');
  console.log('  2. Run: npm run conveyor:db:init');
  console.log('  3. Copy .env.template files to .env and fill in API keys');
  console.log('  4. Start the sync-daemon: npm run conveyor:sync');
  console.log('  5. Launch agents from scripts/ or VS Code tasks');
}

scaffold();
