# git-conveyor

> A self-driving, stack-agnostic assembly line for any Git project.

`git-conveyor` is a boilerplate framework that drops a multi-agent development pipeline into any existing project. It operates in two distinct modes: a **human-in-the-loop PM** that interacts with a developer to decompose and push tasks to GitHub, and a **fully autonomous back-end** where the Coder and Reviewer agents poll a local SQLite Kanban, execute tasks headlessly via Pi, and advance them through the pipeline without further human interaction.

---

## Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Project Structure](#project-structure)
4. [Configuration](#configuration)
5. [Agents](#agents)
6. [Task Lifecycle](#task-lifecycle)
7. [Supported Engines](#supported-engines)
8. [Setup & Installation](#setup--installation)
9. [Usage](#usage)
10. [Extending & Customising](#extending--customising)
11. [Maintenance & Troubleshooting](#maintenance--troubleshooting)
12. [Roadmap](#roadmap)

---

## Overview

### What it does

`git-conveyor` turns your GitHub Issues into autonomous work orders. A developer works interactively with the PM agent to scope and decompose issues, which are then pushed to GitHub as structured tasks. From there, the Coder and Reviewer agents take over — continuously polling a local SQLite Kanban, claiming tasks atomically, executing them headlessly via Pi (backed by OpenRouter models), and advancing them from To Do all the way to Done without any further human interaction.

### Current implementation status

The project is currently in **late Phase 1 / early Phase 2**:

- The local scaffold, profiles, config, SQLite schema, launcher scripts, adapter structure, retry config, and `Blocked` stage exist.
- The local agent loop has basic task claiming, adapter execution, success transitions, retry counting, and blocked-state movement.
- GitHub Projects V2 pull/push sync is still deferred. The sync daemon currently provides the local retry/alert structure that real GitHub transport will use later.
- The next implementation target is local-loop hardening: runner-owned hooks, failure logs, separate timeouts, Coder retry context, and JSONL metrics.

### Design goals

| Goal | How it's achieved |
|---|---|
| **Stack-agnostic** | All project-specific settings live in `conveyor.config.js` — no runner code needs editing |
| **Engine-agnostic** | Any agent role can be pointed at Claude Code, Codex, OpenCode, Pi, or any headless CLI |
| **Drop-in** | `conveyor init` scaffolds `.conveyor/` into any existing project in seconds |
| **Race-condition safe** | SQLite WAL mode with `busy_timeout` ensures atomic task claiming across all agents |
| **Human-overridable** | GitHub Projects V2 remains the intended source of truth once real sync is implemented |

### What it is not

- A hosted service — everything runs locally on your machine
- A replacement for your existing CI/CD pipeline — it works alongside it
- Opinionated about language or framework — any test command, any project type

---

## Architecture

```
                    ┌─────────────────────────────┐
                    │   Human Developer             │
                    └──────────┬──────────────────┘
                               │ interacts with
                    ┌──────────▼──────────────────┐
                    │   PM Agent (interactive)      │
                    │   Codex CLI (default)         │
                    │   alt: Claude Code, OpenCode  │
                    └──────────┬──────────────────┘
                               │ pushes scoped tasks
                    ┌──────────▼──────────────────┐
                    │   GitHub Projects V2          │  ← source of truth
                    └──────────┬──────────────────┘
                               │ sync-daemon.js (push/pull)
                    ┌──────────▼──────────────────┐
                    │   kanban.db (SQLite, WAL)     │  ← local coordination
                    └────────┬──────────┬──────────┘
                             │          │
              ┌──────────────▼──┐  ┌───▼──────────────┐
              │  Coder Agent    │  │  Reviewer Agent   │
              │  Pi SDK         │  │  Pi SDK           │
              │  OpenRouter     │  │  OpenRouter       │
              │  nemotron-ultra │  │  laguna-m.1       │
              │  (autonomous)   │  │  (autonomous)     │
              └─────────────────┘  └──────────────────┘
```

### Two operating modes

**PM — Human-in-the-loop**: The PM agent launches as an interactive Codex (or Claude Code / OpenCode) session. The developer converses with it to decompose GitHub issues into scoped, deterministic tasks with clear acceptance criteria. When satisfied, the PM pushes the structured tasks to GitHub. The sync daemon then pulls them into `kanban.db` and the autonomous pipeline takes over.

**Coder & Reviewer — Fully autonomous**: Both agents run as persistent Pi SDK loops. They poll `kanban.db`, claim tasks atomically via WAL locking, execute headlessly using Pi's `runPrintMode`, and transition task stages without any human interaction. Skills and system prompts are loaded from each profile's `skills/` folder at runtime.

### Core coordination: Lock & Execute

The autonomous agent runner (`agent-runner.js`) follows this non-blocking loop:

1. **Scan** — query SQLite for tasks at `targetStage` with no `locked_by`
2. **Claim** — atomically set `locked_by = agentName` (WAL prevents concurrent claims)
3. **Load** — read `INSTRUCTIONS.md` + all `skills/*.md` from the profile directory
4. **Execute** — run Pi SDK in `runPrintMode` with the loaded system prompt and task context
5. **Transition** — on exit 0, advance task to `nextStage` and clear lock; on exit 1+, roll back and clear lock for retry

### Sync strategy

A background `sync-daemon.js` runs independently, continuously reconciling:

- **Pull**: new/updated GitHub Project items → `kanban.db`
- **Push**: local status changes flagged by `local_changes_pending = 1` → GitHub

This decouples agents from GitHub API rate limits and latency. All agent operations are local; GitHub is updated asynchronously.

**Implementation note:** real GitHub API pull/push is not the next slice. The sync daemon should keep its retry/alert contract, but GitHub transport work is deferred until the local runner behavior is deterministic and covered by tests.

---

## Project Structure

```
project-root/
├── .conveyor/                             # Core git-conveyor directory (drop into any project)
│   ├── profiles/
│   │   ├── project-manager/
│   │   │   ├── INSTRUCTIONS.md            # PM system prompt (context for interactive session)
│   │   │   └── .env                       # PM engine API key (Codex / Claude / OpenCode)
│   │   ├── coder/
│   │   │   ├── INSTRUCTIONS.md            # Coder base system prompt
│   │   │   ├── .env                       # OPENROUTER_API_KEY + model config
│   │   │   └── skills/
│   │   │       ├── code-conventions.md    # Project coding style rules
│   │   │       ├── file-structure.md      # Where files live in this project
│   │   │       └── commit-format.md       # Commit message conventions
│   │   └── reviewer/
│   │       ├── INSTRUCTIONS.md            # Reviewer base system prompt
│   │       ├── .env                       # OPENROUTER_API_KEY + model config
│   │       └── skills/
│   │           ├── review-criteria.md     # What passes/fails a review
│   │           ├── rollback-format.md     # How to write rollback notes
│   │           └── security-checks.md     # Security rules to enforce
│   └── shared/
│       ├── kanban/
│       │   ├── schema.sql                 # SQLite schema definition
│       │   ├── kanban.db                  # Runtime state DB (gitignored)
│       │   ├── local-db-client.js         # DB read/write library (WAL-safe)
│       │   ├── cli.js                     # CLI wrapper for bash scripts
│       │   ├── sync-daemon.js             # GitHub ↔ SQLite sync loop
│       │   └── run-sync.sh                # Sync daemon launcher
│       ├── skills/                        # Shared skills loaded by ALL autonomous agents
│       │   ├── project-context.md         # Project name, tech stack, purpose
│       │   ├── git-conventions.md         # Branch naming, commit style
│       │   └── security-rules.md          # Never hardcode secrets, etc.
│       └── runners/
│           ├── agent-runner.js            # Universal Pi SDK runner (autonomous agents)
│           └── adapters/
│               ├── codex.js               # PM: Codex CLI adapter (interactive)
│               ├── claude.js              # PM: Claude Code CLI adapter (interactive)
│               ├── opencode.js            # PM: OpenCode CLI adapter (interactive)
│               └── custom.js              # Template for custom PM engine adapters
├── scripts/
│   ├── conveyor-init.js                   # Scaffolding script: drops .conveyor/ into any project
│   ├── start-sync.sh                      # Launch sync daemon
│   ├── start-pm.sh                        # Launch PM interactive session
│   ├── start-coder.sh                     # Launch autonomous Coder loop
│   └── start-reviewer.sh                  # Launch autonomous Reviewer loop
├── conveyor.config.js                     # ← Single source of truth for all project settings
├── .vscode/
│   └── tasks.json                         # One-click VS Code launcher for all agents
├── .gitignore                             # Includes kanban.db, all .env files
├── package.json
└── README.md
```

---

## Configuration

All project-specific settings are centralised in `conveyor.config.js` at the project root. No runner or daemon code needs to be edited when adopting `git-conveyor` in a new project.

```js
// conveyor.config.js
export default {

  // --- Project identity ---
  project: {
    name: 'my-project',
    github: {
      owner: 'your-org',
      repo: 'your-repo',
      projectNumber: 1,           // GitHub Projects V2 project number
    },
  },

  // --- Local state ---
  db: {
    path: '.conveyor/shared/kanban/kanban.db',
  },

  // --- Stack-specific hooks ---
  hooks: {
    test: 'npm test',             // Replace with: pytest, go test ./..., cargo test, etc.
    lint: 'npm run lint',         // Optional pre-review lint step
    build: 'npm run build',       // Optional post-code build verification
    'security-checks': 'node .conveyor/shared/hooks/security-checks.js',
    timeoutMs: 300000,
  },

  // --- Kanban stages (matches your GitHub Projects board exactly) ---
  stages: [
    'Backlog',
    'To Do',
    'In Progress',
    'Review',
    'Blocked',
    'Done',
  ],

  // --- Agent definitions ---
  agents: {
    pm: {
      engine: 'claude',           // Which adapter to use
      targetStage: 'Backlog',
      nextStage: 'To Do',
      pollInterval: 10000,        // ms
    },
    coder: {
      engine: 'codex',            // Switch to 'opencode' if preferred
      targetStage: 'To Do',
      nextStage: 'Review',
      pollInterval: 12000,
      timeoutMs: 900000,
    },
    reviewer: {
      engine: 'pi',
      model: 'qwen-2.5-coder',
      targetStage: 'Review',
      nextStageSuccess: 'Done',
      nextStageFailure: 'To Do',  // Rolls back for Coder to retry
      pollInterval: 15000,
      timeoutMs: 600000,
      runHooks: ['test', 'lint', 'security-checks'],
    },
  },

};
```

### Environment variables

Each agent profile has its own `.env` file. A `.env.example` is provided for each:

```bash
# .conveyor/profiles/project-manager/.env.example
ANTHROPIC_API_KEY=your_key_here

# .conveyor/profiles/coder/.env.example
OPENAI_API_KEY=your_key_here      # Used by Codex
# OPENCODE_API_KEY=your_key_here  # Used by OpenCode (if switching engines)

# .conveyor/profiles/reviewer/.env.example
PI_API_KEY=your_key_here

# Shared (can be set at project root .env)
GITHUB_TOKEN=your_pat_here        # Needs: read:project, write:project, repo
```

---

## Agents

### Project Manager

**Engine**: Claude Code CLI  
**Responsibility**: Reads raw GitHub issues from Backlog, breaks them into scoped, deterministic tasks with clear acceptance criteria and an implementation plan (approach, affected files, edge cases, test strategy), then advances them to To Do for the Coder to pick up.

**INSTRUCTIONS.md should define**:
- How to interpret issue titles and bodies
- Output format for scoped task descriptions and implementation plan
- Any project naming conventions or architectural constraints

### Coder

**Engine**: Codex CLI (default) or OpenCode  
**Responsibility**: Picks up tasks from To Do, executes the PM's implementation plan — writes code, creates or modifies files, and auto-commits. Both Codex and OpenCode support fully headless one-shot execution without interactive prompts.

**Codex** is well-suited for tasks with clear file-level instructions and strong code generation requirements. **OpenCode** is an alternative for teams already invested in that toolchain or preferring its model routing.

**INSTRUCTIONS.md should define**:
- Coding style and conventions
- File structure rules
- Test file co-location requirements
- Commit message format

### Reviewer

**Engine**: Pi (`qwen-2.5-coder` default)  
**Responsibility**: Evaluates output quality after deterministic runner-owned hooks (`test`, `lint`, `build`, `security-checks`) pass. The runner executes hooks, captures stdout/stderr, writes failure logs, and either advances the task to Done or rolls it back to To Do / Blocked based on retry count.

**INSTRUCTIONS.md should define**:
- What constitutes a passing review beyond test exit codes
- How to write rollback notes for the Coder to act on
- Any security or performance checks to apply

---

## Local-Loop Hardening

Before implementing real GitHub Projects V2 sync, the local Coder/Reviewer loop must prove one complete failure path:

1. Reviewer reaches a task in `Review`.
2. `agent-runner.js` executes configured hooks from `conveyor.config.js`.
3. A hook fails or times out.
4. The runner writes `.conveyor/logs/YYYY-MM-DD__task-<number>.md` with a summary, embedded JSON metadata, command, exit code, stdout, stderr, retry count, and timestamps.
5. Retry count increments.
6. The task returns to `To Do` or moves to `Blocked` after max retries.
7. The Coder's next prompt receives the latest matching failure log as bounded retry context.
8. `.conveyor/metrics/YYYY-MM-DD.jsonl` records runner events such as task claim, adapter start/end, hook start/end, retry, blocked transition, normal transition, and runner error.

Adapter execution timeouts and hook execution timeouts are separate. Any non-zero adapter exit, hook failure, timeout, or runner error is a failed task attempt and increments retry count.

---

## Task Lifecycle

```
GitHub Issue Created
        ↓
   [ Backlog ]  ←──────────────────────────┐
        ↓  PM Agent                         │
      [ To Do ]                             │
        ↓  Coder Agent                      │
   [ In Progress ]  (locked during exec)    │
        ↓                                   │
      [ Review ]                            │
        ↓  Reviewer Agent                   │
     hooks pass? ──── no ──→ [ To Do ] ─────┘
        ↓ yes
      [ Done ]
        ↓
   sync-daemon pushes status to GitHub
```

### Deterministic task requirements

For agents to operate reliably without hallucination or infinite loops, every GitHub issue used as a task input should specify:

- **What** — the exact behaviour or file to produce
- **Where** — specific file paths or directories to touch
- **Done when** — a concrete, testable completion condition (e.g. "unit tests pass", "endpoint returns 200", "file exists at `src/x/y.ts`")

Vague tasks (e.g. "improve performance") will cause agents to loop or produce non-deterministic output.

---

## Supported Engines

| Engine | Adapter | Headless flag | Notes |
|---|---|---|---|
| Claude Code | `claude.js` | `--prompt` | Best for planning/PM tasks |
| Codex | `codex.js` | `--quiet` | Best for code implementation |
| OpenCode | `opencode.js` | `--no-interactive` | Alternative coder engine |
| Pi | `pi.js` | `--mode print` | Good for research and review |
| Custom | `custom.js` | Configurable | Template for any other CLI |

### Adding a custom engine

1. Copy `.conveyor/shared/runners/adapters/custom.js`
2. Implement the `execute(task, systemPrompt, env)` interface
3. Register it in `conveyor.config.js` under `agents.<role>.engine`

```js
// adapters/custom.js
export function execute({ task, systemPrompt, env }) {
  return spawnSync('your-cli', [
    '--prompt', task.body,
    '--system', systemPrompt,
    '--no-interactive',
  ], { stdio: 'inherit', env, shell: true });
}
```

---

## Setup & Installation

### Prerequisites

- Node.js 18+
- SQLite3
- At least one supported AI CLI engine installed and authenticated
- A GitHub Personal Access Token with `repo` and `project` scopes

### Option A: New project

```bash
# Clone git-conveyor as your project scaffold
git clone https://github.com/your-org/git-conveyor my-project
cd my-project
npm install

# Configure
cp conveyor.config.example.js conveyor.config.js
# Edit conveyor.config.js with your project details

# Set up agent profiles
cp .conveyor/profiles/project-manager/.env.example .conveyor/profiles/project-manager/.env
# Repeat for each profile, fill in API keys
```

### Option B: Drop into an existing project

```bash
# From within your existing project root
npx git-conveyor init

# This scaffolds .conveyor/, scripts/, conveyor.config.js, and .vscode/tasks.json
# without touching any existing project files
```

### Initialise the database and start syncing

```bash
# Initialise SQLite schema
npm run conveyor:db:init

# Start the sync daemon (pulls current GitHub Project state)
./scripts/start-sync.sh

# Wait for initial sync, then launch agents
./scripts/start-pm.sh
./scripts/start-coder.sh
./scripts/start-reviewer.sh
```

### VS Code (recommended)

Open the Command Palette → `Tasks: Run Task` → select agents to launch. Each agent runs in its own dedicated terminal panel.

---

## Usage

### Starting the full swarm

```bash
# Terminal 1 — always start first
./scripts/start-sync.sh

# Terminals 2–4 (or via VS Code tasks)
./scripts/start-pm.sh
./scripts/start-coder.sh
./scripts/start-reviewer.sh
```

### Manually inspecting the queue

```bash
# What's next in a given stage?
node .conveyor/shared/kanban/cli.js next-task "To Do"

# Full queue overview
sqlite3 .conveyor/shared/kanban/kanban.db "SELECT task_number, title, status, locked_by FROM tasks"

# Trigger a manual GitHub sync
npm run conveyor:sync
```

### Overriding agent behaviour

Move any card on the GitHub Projects board. The sync daemon will detect the remote change and update `kanban.db` within one sync cycle. The agent currently processing the affected task will see the updated status on its next poll and stop processing.

---

## Maintenance & Troubleshooting

### Emergency: release all stuck locks

```bash
sqlite3 .conveyor/shared/kanban/kanban.db "UPDATE tasks SET locked_by = NULL, locked_at = NULL"
```

### Reset local state entirely

```bash
rm .conveyor/shared/kanban/kanban.db
./scripts/start-sync.sh   # Recreates DB from GitHub state
```

### An agent is looping on a failed task

1. Move the card back to Backlog on GitHub
2. The sync daemon updates `kanban.db`
3. The PM agent will re-scope it on the next poll
4. Alternatively, edit the issue body directly to add a clearer completion condition

### Sync daemon stops pushing changes

Check that `GITHUB_TOKEN` has `write:project` scope. Verify with:

```bash
curl -H "Authorization: bearer $GITHUB_TOKEN" https://api.github.com/user
```

---

## Roadmap

| Feature | Status |
|---|---|
| `conveyor init` scaffolding CLI | Planned |
| `conveyor.config.js` universal config | Planned |
| Universal `agent-runner.js` with adapter pattern | Planned |
| Custom engine adapter template | Planned |
| Configurable hooks (`test`, `lint`, `build`) | Planned |
| Web dashboard for queue observability | Considering |
| Multi-repo support | Considering |
| Slack / Discord notifications on stage transitions | Considering |
| Support for GitHub Actions trigger mode (non-polling) | Considering |

---

## Contributing

`git-conveyor` is designed to be a living boilerplate. Contributions that improve engine adapters, expand the init scaffolder, or add new runner patterns are welcome.

1. Fork the repo
2. Create a feature branch: `git checkout -b feat/your-feature`
3. Follow existing code conventions in `.conveyor/shared/runners/`
4. Open a PR against `main`

---

## License

MIT — use freely in personal and commercial projects.
