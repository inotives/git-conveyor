CREATE TABLE IF NOT EXISTS tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_number INTEGER NOT NULL UNIQUE,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'Backlog'
    CHECK(status IN ('Backlog','To Do','In Progress','Review','Blocked','Done')),
  stage TEXT NOT NULL DEFAULT 'Backlog'
    CHECK(stage IN ('Backlog','To Do','In Progress','Review','Blocked','Done')),
  github_issue_id INTEGER,
  github_project_item_id TEXT,
  locked_by TEXT,
  locked_at TEXT,
  retry_count INTEGER NOT NULL DEFAULT 0,
  max_retries INTEGER NOT NULL DEFAULT 3,
  local_changes_pending INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_stage ON tasks(stage);
CREATE INDEX IF NOT EXISTS idx_tasks_locked_by ON tasks(locked_by);
