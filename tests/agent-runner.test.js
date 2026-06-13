import { describe, it } from 'node:test';
import assert from 'node:assert';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { tmpdir } from 'os';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

describe('Agent Runner', () => {

  it('profile INSTRUCTIONS.md files exist and contain role info', () => {
    for (const profile of ['project-manager', 'coder', 'reviewer']) {
      const path = join(__dirname, '..', '.conveyor', 'profiles', profile, 'INSTRUCTIONS.md');
      assert.ok(existsSync(path), `Missing INSTRUCTIONS.md for ${profile}`);
      const content = readFileSync(path, 'utf8');
      assert.ok(content.includes('## Role'), `${profile} INSTRUCTIONS.md missing Role section`);
    }
  });

  it('coder profile has 3 skills', () => {
    const skillsDir = join(__dirname, '..', '.conveyor', 'profiles', 'coder', 'skills');
    const files = readdirSync(skillsDir).filter(f => f.endsWith('.md'));
    assert.equal(files.length, 3);
  });

  it('reviewer profile has security-checks skill', () => {
    const skillsDir = join(__dirname, '..', '.conveyor', 'profiles', 'reviewer', 'skills');
    const files = readdirSync(skillsDir);
    assert.ok(files.includes('security-checks.md'));
  });

  it('shared skills directory has 3 files', () => {
    const sharedDir = join(__dirname, '..', '.conveyor', 'shared', 'skills');
    const files = readdirSync(sharedDir).filter(f => f.endsWith('.md'));
    assert.equal(files.length, 3);
  });

  it('adapter files exist for all configured engines', () => {
    const adaptersDir = join(__dirname, '..', '.conveyor', 'shared', 'runners', 'adapters');
    const expected = ['claude.js', 'codex.js', 'opencode.js', 'pi.js', 'custom.js'];
    for (const file of expected) {
      assert.ok(existsSync(join(adaptersDir, file)), `Missing adapter: ${file}`);
    }
  });

  it('adapter modules export execute function', async () => {
    for (const name of ['pi', 'codex', 'claude', 'opencode']) {
      const adapter = await import(`../.conveyor/shared/runners/adapters/${name}.js`);
      assert.ok(adapter.default, `Adapter ${name} has no default export`);
      assert.equal(typeof adapter.default.execute, 'function', `Adapter ${name}.execute is not a function`);
    }
  });

  it('writes a failure log, retry transition, and metrics when a reviewer hook fails', async () => {
    const db = await import('../.conveyor/shared/kanban/local-db-client.js');
    const runner = await import('../.conveyor/shared/runners/agent-runner.js');
    const conn = db.getDb();
    conn.prepare('DELETE FROM tasks').run();
    const taskId = db.upsertTask({
      task_number: 101,
      title: 'Hook failure task',
      description: 'Should fail reviewer hook',
      stage: 'Review',
      status: 'Review',
    });
    const tempDir = mkdtempSync(join(tmpdir(), 'conveyor-runner-'));
    const logsDir = join(tempDir, 'logs');
    const metricsDir = join(tempDir, 'metrics');
    const config = {
      hooks: {
        test: 'node -e "console.log(\'hook stdout\'); console.error(\'hook stderr\'); process.exit(1)"',
        timeoutMs: 5000,
      },
    };

    const result = await runner.pollAgentOnce({
      profileName: 'reviewer',
      targetStage: 'Review',
      nextStage: 'Done',
      adapter: { execute: () => 0 },
      config,
      agentConfig: { runHooks: ['test'], timeoutMs: 5000 },
      options: { logsDir, metricsDir },
    });

    assert.equal(result.status, 'retried');
    const task = conn.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId);
    assert.equal(task.stage, 'To Do');
    assert.equal(task.locked_by, null);
    assert.equal(task.retry_count, 1);
    assert.equal(task.local_changes_pending, 1);

    const logFiles = readdirSync(logsDir);
    assert.equal(logFiles.length, 1);
    const log = readFileSync(join(logsDir, logFiles[0]), 'utf8');
    assert.match(log, /"failure_type": "hook_failure"/);
    assert.match(log, /hook stdout/);
    assert.match(log, /hook stderr/);

    const metricFiles = readdirSync(metricsDir);
    assert.equal(metricFiles.length, 1);
    const events = readFileSync(join(metricsDir, metricFiles[0]), 'utf8')
      .trim()
      .split('\n')
      .map(line => JSON.parse(line).event);
    assert.deepEqual(events, [
      'task_claimed',
      'adapter_started',
      'adapter_finished',
      'hook_started',
      'hook_finished',
      'task_retried',
    ]);
  });

  it('moves a task to Blocked when the failing hook reaches max retries', async () => {
    const db = await import('../.conveyor/shared/kanban/local-db-client.js');
    const runner = await import('../.conveyor/shared/runners/agent-runner.js');
    const conn = db.getDb();
    conn.prepare('DELETE FROM tasks').run();
    const taskId = db.upsertTask({
      task_number: 102,
      title: 'Blocked task',
      description: 'Should block after retry',
      stage: 'Review',
      status: 'Review',
    });
    conn.prepare('UPDATE tasks SET retry_count = 2, max_retries = 3 WHERE id = ?').run(taskId);
    const tempDir = mkdtempSync(join(tmpdir(), 'conveyor-runner-'));
    const config = {
      hooks: {
        test: 'node -e "process.exit(1)"',
        timeoutMs: 5000,
      },
    };

    const result = await runner.pollAgentOnce({
      profileName: 'reviewer',
      targetStage: 'Review',
      nextStage: 'Done',
      adapter: { execute: () => 0 },
      config,
      agentConfig: { runHooks: ['test'], timeoutMs: 5000 },
      options: { logsDir: join(tempDir, 'logs'), metricsDir: join(tempDir, 'metrics') },
    });

    assert.equal(result.status, 'blocked');
    const task = conn.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId);
    assert.equal(task.stage, 'Blocked');
    assert.equal(task.status, 'Blocked');
    assert.equal(task.locked_by, null);
    assert.equal(task.retry_count, 3);
  });

  it('injects the latest failure log into coder task context', async () => {
    const db = await import('../.conveyor/shared/kanban/local-db-client.js');
    const runner = await import('../.conveyor/shared/runners/agent-runner.js');
    const conn = db.getDb();
    conn.prepare('DELETE FROM tasks').run();
    db.upsertTask({
      task_number: 103,
      title: 'Retry task',
      description: 'Original description',
      stage: 'To Do',
      status: 'To Do',
    });
    const tempDir = mkdtempSync(join(tmpdir(), 'conveyor-runner-'));
    const logsDir = join(tempDir, 'logs');
    const metricsDir = join(tempDir, 'metrics');
    mkdirSync(logsDir, { recursive: true });
    writeFileSync(join(logsDir, '2026-06-13__task-103.md'), 'Previous hook failed here.', 'utf8');
    let capturedTask;

    const result = await runner.pollAgentOnce({
      profileName: 'coder',
      targetStage: 'To Do',
      nextStage: 'Review',
      adapter: {
        execute: ({ task }) => {
          capturedTask = task;
          return 0;
        },
      },
      config: { hooks: {} },
      agentConfig: { timeoutMs: 5000 },
      options: { logsDir, metricsDir },
    });

    assert.equal(result.status, 'transitioned');
    assert.match(capturedTask.description, /Original description/);
    assert.match(capturedTask.description, /Previous failure context/);
    assert.match(capturedTask.description, /Previous hook failed here/);
  });
});
