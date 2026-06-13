import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
let cli;
let db;

function run(args) {
  const lines = [];
  const errors = [];
  const originalLog = console.log;
  const originalError = console.error;
  console.log = (...parts) => lines.push(parts.join(' '));
  console.error = (...parts) => errors.push(parts.join(' '));
  try {
    const status = cli.main(args);
    return { status, stdout: lines.join('\n'), stderr: errors.join('\n') };
  } finally {
    console.log = originalLog;
    console.error = originalError;
  }
}

describe('CLI', () => {
  before(async () => {
    cli = await import('../.conveyor/shared/kanban/cli.js');
    db = await import('../.conveyor/shared/kanban/local-db-client.js');
    db.initDb();
    const conn = db.getDb();
    conn.prepare('DELETE FROM tasks').run();
    db.upsertTask({
      task_number: 1,
      title: 'CLI test task',
      description: 'Testing CLI',
      stage: 'To Do',
      status: 'To Do',
    });
  });

  after(() => {
    const conn = db.getDb();
    conn.prepare('DELETE FROM tasks').run();
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
