# git-conveyor

> A self‑driving, stack‑agnostic assembly line for any Git project.

`git-conveyor` drops a multi‑agent development pipeline directly into an existing repository.  It orchestrates a **human‑in‑the‑loop Project Manager** and fully autonomous **Coder** and **Reviewer** agents that poll a local SQLite Kanban, claim tasks atomically, execute them headlessly via Pi, and advance them through the pipeline without further human interaction.

## Current status

`git-conveyor` is currently in **late Phase 1 / early Phase 2**. The local scaffold, profiles, config, SQLite schema, launcher scripts, adapters, retry config, and basic agent loop exist. The next implementation slice is local-loop hardening: runner-owned hooks, failure logs, separate timeouts, Coder retry context, and JSONL metrics.

Real GitHub Projects V2 pull/push sync is still deferred. The sync daemon currently provides the local retry/alert structure that the GitHub transport layer will use later.

## Features

- **Drop‑in scaffolding** – `conveyor init` injects a complete `.conveyor/` directory into any project.
- **Stack‑agnostic** – all project‑specific settings live in `conveyor.config.js`; the runners are engine‑agnostic (Claude, Codex, OpenCode, Pi, or custom adapters).
- **SQLite‑backed Kanban** – atomic task claiming using WAL mode ensures race‑condition safety across agents.
- **GitHub Projects V2 integration** – planned transport layer; local sync retry/alert scaffolding exists now.
- **Robust failure handling** – retry/blocking mechanics exist; failure logs, timeouts, and hook orchestration are the next slice.
- **Observability** – planned lightweight JSONL metrics stored in `.conveyor/metrics/`.
- **Security checks** – planned as a normal runner-owned hook, replaceable per project.
- **Extensible** – add new skills or custom engine adapters in each profile’s `skills/` folder.

## Quick start (local development)

```bash
# 1️⃣ Clone the repo (SSH personal host)
git clone git@github-personal:inotives/git-conveyor.git
cd git-conveyor

# 2️⃣ Initialise the conveyor scaffolding (creates .conveyor/)
npm run conveyor:init   # or: npx git-conveyor init

# 3️⃣ Populate .env files for each profile (copy from .env.template)
cp .conveyor/profiles/coder/.env.template .conveyor/profiles/coder/.env
# repeat for reviewer & project‑manager, then fill in your API keys

# 4️⃣ Initialise the SQLite Kanban schema
npm run conveyor:db:init

# 5️⃣ Start the sync daemon (foreground for first local test)
node .conveyor/shared/kanban/sync-daemon.js

# 6️⃣ Launch agents (in separate terminals)
./scripts/start-coder.sh
./scripts/start-reviewer.sh
# optional: ./scripts/start-pm.sh for interactive issue scoping
```

The local agents can now exercise the SQLite-backed conveyor loop. Full GitHub Project pull/push, deterministic runner-owned hooks, failure-log injection, and JSONL metrics are still being implemented.

## Configuration (conveyor.config.js)

All project‑specific settings live in `conveyor.config.js` at the repo root.  Important sections:

- **Project identity** (GitHub owner, repo, project number). 
- **Local DB path** (`.conveyor/shared/kanban/kanban.db`).
- **Stages** – must match your GitHub Projects board (including `Blocked`).
- **Agents** – engine selection, target/next stages, polling intervals.
- **Hooks** – test, lint, build commands run by the Reviewer.
- **Retry / Alert settings** – defined in `.conveyor/shared/configs.yaml`.

See the full spec in `docs/project-spec.md` for a deep dive into architecture, task lifecycle, and extensibility.

---

## License

```
MIT License

Copyright (c) 2026 inotives

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

---

## Common .gitignore (local development)

```
# Node modules & lock files
node_modules/
package-lock.json
yarn.lock

# Generated / temporary files
.DS_Store
*.log
*.tmp
*.swp

# Build artefacts
dist/
build/
*.tsbuildinfo

# Local SQLite DB (kept out of VCS – regenerated on first run)
.conveyor/shared/kanban/kanban.db

# Secrets & env files (never commit)
.conveyor/**/.env

# Metrics & alerts – local observability only
.conveyor/metrics/
.conveyor/alerts/

# VS Code workspace settings
.vscode/

# OS generated files
Thumbs.db
ehthumbs.db
Desktop.ini
```

---

## Contributing

Feel free to fork, open issues, or submit pull requests.  Follow the contribution guidelines in `CONTRIBUTING.md` (if present) or open an issue for discussion.

---

*Happy coding with git-conveyor!*
