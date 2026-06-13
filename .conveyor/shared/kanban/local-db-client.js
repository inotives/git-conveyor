import Database from 'better-sqlite3';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCHEMA_PATH = join(__dirname, 'schema.sql');
const DB_PATH = process.env.CONVEYOR_DB_PATH || join(__dirname, 'kanban.db');
const CONFIG_PATH = join(__dirname, '..', 'configs.yaml');

let db = null;

function getDb() {
  if (db) return db;
  const dbDir = dirname(DB_PATH);
  if (!existsSync(dbDir)) mkdirSync(dbDir, { recursive: true });
  db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  db.pragma('busy_timeout = 5000');
  return db;
}

function loadConfig() {
  if (!existsSync(CONFIG_PATH)) return {};
  const yaml = readFileSync(CONFIG_PATH, 'utf8');
  const cfg = {};
  const lines = yaml.split('\n');
  let currentParent = null;
  for (const line of lines) {
    const indent = line.match(/^\s*/)[0].length;
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const m = trimmed.match(/^([\w-]+):\s*(.*)$/);
    if (!m) continue;
    const key = m[1];
    const val = m[2].trim();
    if (indent === 0) {
      cfg[key] = val === '' ? {} : parseYamlValue(val);
      currentParent = val === '' ? key : null;
    } else {
      if (!currentParent) continue;
      cfg[currentParent] ??= {};
      cfg[currentParent][key] = parseYamlValue(val);
    }
  }
  return cfg;
}

function parseYamlValue(val) {
  if (val === '') return {};
  return isNaN(val) ? val : Number(val);
}

function initDb() {
  const conn = getDb();
  const schema = readFileSync(SCHEMA_PATH, 'utf8');
  conn.exec(schema);
  console.log(`Schema initialized at ${DB_PATH}`);
}

function nextTask(stage) {
  const conn = getDb();
  const row = conn.prepare(
    `SELECT * FROM tasks WHERE stage = ? AND locked_by IS NULL ORDER BY created_at ASC LIMIT 1`
  ).get(stage);
  return row || null;
}

function claimTask(taskId, agentName) {
  const conn = getDb();
  const result = conn.prepare(
    `UPDATE tasks SET locked_by = ?, locked_at = datetime('now'), status = 'In Progress', updated_at = datetime('now') WHERE id = ? AND locked_by IS NULL`
  ).run(agentName, taskId);
  return result.changes > 0;
}

function releaseTask(taskId) {
  const conn = getDb();
  conn.prepare(
    `UPDATE tasks SET locked_by = NULL, locked_at = NULL, updated_at = datetime('now') WHERE id = ?`
  ).run(taskId);
}

function transitionTask(taskId, nextStage, nextStatus) {
  const conn = getDb();
  conn.prepare(
    `UPDATE tasks SET stage = ?, status = ?, locked_by = NULL, locked_at = NULL, local_changes_pending = 1, updated_at = datetime('now') WHERE id = ?`
  ).run(nextStage, nextStatus || nextStage, taskId);
}

function incrementRetry(taskId) {
  const conn = getDb();
  const task = conn.prepare(`SELECT retry_count, max_retries FROM tasks WHERE id = ?`).get(taskId);
  if (!task) return { blocked: false };
  const newCount = task.retry_count + 1;
  const blocked = newCount >= task.max_retries;
  conn.prepare(
    `UPDATE tasks SET retry_count = ?, stage = ?, status = ?, locked_by = NULL, locked_at = NULL, local_changes_pending = 1, updated_at = datetime('now') WHERE id = ?`
  ).run(newCount, blocked ? 'Blocked' : 'To Do', blocked ? 'Blocked' : 'To Do', taskId);
  return { blocked, retryCount: newCount };
}

function resetRetries(taskId) {
  const conn = getDb();
  conn.prepare(`UPDATE tasks SET retry_count = 0, updated_at = datetime('now') WHERE id = ?`).run(taskId);
}

function allTasks(opts = {}) {
  const conn = getDb();
  const { stage, status, limit = 50 } = opts;
  let sql = `SELECT * FROM tasks`;
  const clauses = [];
  const params = {};
  if (stage) { clauses.push('stage = @stage'); params.stage = stage; }
  if (status) { clauses.push('status = @status'); params.status = status; }
  if (clauses.length) sql += ' WHERE ' + clauses.join(' AND ');
  sql += ' ORDER BY created_at DESC LIMIT @limit';
  params.limit = limit;
  return conn.prepare(sql).all(params);
}

function upsertTask(task) {
  const conn = getDb();
  const existing = conn.prepare(`SELECT id FROM tasks WHERE task_number = ?`).get(task.task_number);
  const params = {
    title: task.title || '',
    description: task.description || '',
    stage: task.stage || 'Backlog',
    status: task.status || 'Backlog',
    github_issue_id: task.github_issue_id ?? null,
    github_project_item_id: task.github_project_item_id ?? null,
  };
  if (existing) {
    conn.prepare(
      `UPDATE tasks SET title = @title, description = @description, stage = @stage, status = @status, github_issue_id = @github_issue_id, github_project_item_id = @github_project_item_id, updated_at = datetime('now') WHERE id = @id`
    ).run({ ...params, id: existing.id });
    return existing.id;
  }
  const result = conn.prepare(
    `INSERT INTO tasks (task_number, title, description, stage, status, github_issue_id, github_project_item_id) VALUES (@task_number, @title, @description, @stage, @status, @github_issue_id, @github_project_item_id)`
  ).run({ task_number: task.task_number, ...params });
  return result.lastInsertRowid;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const command = process.argv[2];
  if (command === 'init') {
    initDb();
  } else if (command === 'next-task') {
    const stage = process.argv[3];
    if (!stage) { console.error('Usage: node local-db-client.js next-task <stage>'); process.exit(1); }
    const task = nextTask(stage);
    console.log(task ? JSON.stringify(task, null, 2) : 'No task available');
  } else if (command) {
    console.error(`Unknown command: ${command}`);
    process.exit(1);
  }
}

export {
  initDb,
  nextTask,
  claimTask,
  releaseTask,
  transitionTask,
  incrementRetry,
  resetRetries,
  allTasks,
  upsertTask,
  getDb,
  loadConfig,
};
