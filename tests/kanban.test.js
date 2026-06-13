import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import { existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

describe('Kanban DB Client', () => {
  let db;
  let taskId;

  before(async () => {
    db = await import('../.conveyor/shared/kanban/local-db-client.js');
    db.initDb();
    const conn = db.getDb();
    conn.prepare('DELETE FROM tasks').run();
  });

  it('initializes schema and creates tables', () => {
    const conn = db.getDb();
    const tables = conn.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
    assert.ok(tables.some(t => t.name === 'tasks'));
  });

  it('upserts and retrieves a task', () => {
    taskId = db.upsertTask({
      task_number: 1,
      title: 'Test task',
      description: 'A test',
      stage: 'To Do',
      status: 'To Do',
      github_issue_id: 42,
    });
    assert.ok(taskId > 0);
    const tasks = db.allTasks({});
    assert.equal(tasks.length, 1);
    assert.equal(tasks[0].title, 'Test task');
  });

  it('finds next unclaimed task by stage', () => {
    const task = db.nextTask('To Do');
    assert.ok(task);
    assert.equal(task.task_number, 1);
    assert.equal(task.locked_by, null);
  });

  it('returns null when no tasks in stage', () => {
    const task = db.nextTask('Review');
    assert.equal(task, null);
  });

  it('atomically claims a task', () => {
    const claimed = db.claimTask(taskId, 'test-agent');
    assert.equal(claimed, true);
    const task = db.nextTask('To Do');
    assert.equal(task, null);
    const conn = db.getDb();
    const locked = conn.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId);
    assert.equal(locked.locked_by, 'test-agent');
  });

  it('fails to claim already-locked task', () => {
    const claimed = db.claimTask(taskId, 'other-agent');
    assert.equal(claimed, false);
  });

  it('releases a task lock', () => {
    db.releaseTask(taskId);
    const task = db.nextTask('To Do');
    assert.ok(task);
    assert.equal(task.locked_by, null);
  });

  it('transitions task to next stage', () => {
    db.transitionTask(taskId, 'Review', 'Review');
    const tasks = db.allTasks({ stage: 'Review' });
    assert.equal(tasks.length, 1);
    assert.equal(tasks[0].stage, 'Review');
  });

  it('increments retry count and blocks after max', () => {
    db.transitionTask(taskId, 'To Do', 'To Do');
    db.claimTask(taskId, 'test-agent');

    let r = db.incrementRetry(taskId);
    assert.equal(r.blocked, false);
    assert.equal(r.retryCount, 1);

    let task = db.nextTask('To Do');
    assert.ok(task);
    assert.equal(task.locked_by, null);
    assert.equal(task.local_changes_pending, 1);

    r = db.incrementRetry(taskId);
    assert.equal(r.blocked, false);

    r = db.incrementRetry(taskId);
    assert.equal(r.blocked, true);

    const tasks = db.allTasks({ stage: 'Blocked' });
    assert.equal(tasks.length, 1);
    assert.equal(tasks[0].locked_by, null);
  });

  it('resets retry counter', () => {
    db.resetRetries(taskId);
    const conn = db.getDb();
    const task = conn.prepare('SELECT retry_count FROM tasks WHERE id = ?').get(taskId);
    assert.equal(task.retry_count, 0);
  });

  it('updates existing task on upsert', () => {
    db.upsertTask({
      task_number: 1,
      title: 'Updated title',
      description: 'Updated',
      stage: 'Done',
      status: 'Done',
      github_issue_id: 42,
    });
    const tasks = db.allTasks({});
    assert.equal(tasks.length, 1);
    assert.equal(tasks[0].title, 'Updated title');
    assert.equal(tasks[0].stage, 'Done');
  });

  after(() => {
    const conn = db.getDb();
    conn.prepare('DELETE FROM tasks').run();
  });
});
