import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import { spawnSync } from 'child_process';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CLI = join(__dirname, '..', '.conveyor', 'shared', 'kanban', 'cli.js');
const DB_PATH = join(__dirname, '..', '.conveyor', 'shared', 'kanban', 'kanban.db');
const DB_CLIENT = join(__dirname, '..', '.conveyor', 'shared', 'kanban', 'local-db-client.js');

function run(args) {
  return spawnSync('node', [CLI, ...args], { encoding: 'utf8' });
}

describe('CLI', () => {
  before(() => {
    // Ensure DB has schema and a task
    spawnSync('node', [DB_CLIENT, 'init'], { encoding: 'utf8' });
    // Clear stale data, seed fresh
    const seed = spawnSync('node', ['--input-type=module', '-e', `
      import Database from 'better-sqlite3';
      const db = new Database('${DB_PATH}');
      db.pragma('journal_mode = WAL');
      db.prepare('DELETE FROM tasks').run();
      db.prepare("INSERT INTO tasks (task_number, title, description, stage, status) VALUES (1, 'CLI test task', 'Testing CLI', 'To Do', 'To Do')").run();
      db.close();
    `], { encoding: 'utf8' });
    if (seed.status !== 0) console.error('Seed failed:', seed.stderr);
  });

  after(() => {
    spawnSync('node', ['--input-type=module', '-e', `
      import Database from 'better-sqlite3';
      const db = new Database('${DB_PATH}');
      db.prepare('DELETE FROM tasks').run();
      db.close();
    `], { encoding: 'utf8' });
  });

  it('shows help with no arguments', () => {
    const result = run([]);
    assert.ok(result.stdout.includes('Usage:'));
    assert.ok(result.stdout.includes('next-task'));
    assert.ok(result.stdout.includes('list'));
  });

  it('lists all tasks', () => {
    const result = run(['list']);
    assert.ok(result.stdout.includes('#1'));
    assert.ok(result.stdout.includes('CLI test task'));
  });

  it('filters list by stage', () => {
    const result = run(['list', 'To Do']);
    assert.ok(result.stdout.includes('#1'));
  });

  it('shows empty for stage with no tasks', () => {
    const result = run(['list', 'Review']);
    assert.ok(result.stdout.includes('No tasks found'));
  });

  it('shows next task in stage', () => {
    const result = run(['next-task', 'To Do']);
    assert.ok(result.stdout.includes('Task #1'));
    assert.ok(result.stdout.includes('CLI test task'));
  });

  it('shows no task available for empty stage', () => {
    const result = run(['next-task', 'Review']);
    assert.ok(result.stdout.includes('No tasks available'));
  });
});
