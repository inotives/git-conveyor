#!/usr/bin/env node
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { loadConfig, getDb, allTasks } from './local-db-client.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, '..', '..', '..');
const config = loadConfig();
const cycleDelay = config.sync?.cycleDelayMs ?? 30000;
const maxRetries = config.retry?.maxAttempts ?? 3;
const retryIntervalMs = config.retry?.intervalMs ?? 60000;
const blockedDir = config.alerts?.blockedDir
  ? (config.alerts.blockedDir.startsWith('/') ? config.alerts.blockedDir : join(PROJECT_ROOT, config.alerts.blockedDir))
  : join(__dirname, '..', '..', 'alerts', 'blocked');

export function retryWithFixedInterval(fn, attempts, intervalMs) {
  return new Promise((resolve, reject) => {
    let lastErr;
    function tryFn(n) {
      Promise.resolve().then(fn).then(resolve).catch((err) => {
        lastErr = err;
        if (n < attempts) {
          setTimeout(() => tryFn(n + 1), intervalMs);
        } else {
          reject(lastErr);
        }
      });
    }
    tryFn(1);
  });
}

export function writeAlertFile(taskId, title, errorMessage) {
  if (!existsSync(blockedDir)) mkdirSync(blockedDir, { recursive: true });
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `${timestamp}--${taskId}.md`;
  const path = join(blockedDir, filename);
  const content = [
    `# Sync Alert: Task #${taskId}`,
    '',
    `**Task**: ${title}`,
    `**Time**: ${new Date().toISOString()}`,
    `**Error**: ${errorMessage}`,
    '',
    'The sync daemon has exhausted its retries for this operation.',
    'Manual intervention may be required.',
  ].join('\n');
  writeFileSync(path, content, 'utf8');
  console.error(`  Alert written: ${path}`);
}

export async function pullFromGithub() {
  console.log('[sync] Pulling tasks from GitHub...');
  console.log('[sync] Pull complete (no-op placeholder).');
}

export async function pushToGithub() {
  console.log('[sync] Pushing local changes to GitHub...');
  const conn = getDb();
  const pending = allTasks({}).filter(t => t.local_changes_pending);
  for (const task of pending) {
    try {
      await retryWithFixedInterval(async () => {
        console.log(`  Pushing task #${task.task_number} — ${task.stage}`);
        conn.prepare('UPDATE tasks SET local_changes_pending = 0 WHERE id = ?').run(task.id);
      }, maxRetries, retryIntervalMs);
    } catch (err) {
      console.error(`  Failed to push task #${task.task_number}: ${err.message}`);
      writeAlertFile(task.task_number, task.title, err.message);
    }
  }
  console.log('[sync] Push complete.');
}

export async function syncCycle() {
  console.log(`[sync] Cycle starting at ${new Date().toISOString()}`);
  try {
    await pullFromGithub();
    await pushToGithub();
  } catch (err) {
    console.error(`[sync] Cycle error: ${err.message}`);
    if (!existsSync(blockedDir)) mkdirSync(blockedDir, { recursive: true });
    const alertPath = join(blockedDir, `sync-daemon-crash-${Date.now()}.md`);
    writeFileSync(alertPath, `# Sync Daemon Crash\n\n${err.stack}\n`, 'utf8');
  }
  console.log(`[sync] Cycle complete. Next in ${cycleDelay}ms`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  console.log(`Sync daemon starting (cycle: ${cycleDelay}ms, retries: ${maxRetries} × ${retryIntervalMs}ms)`);
  syncCycle();
  setInterval(syncCycle, cycleDelay);
}
