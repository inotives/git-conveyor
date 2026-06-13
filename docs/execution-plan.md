# Git-Conveyor Execution Plan

> Structured, phased plan derived from `project-specs.md` + all “grill-me” decisions.

---

## Current Progress

**Current phase:** late Phase 1 / early Phase 2.

Phase 1 is complete enough to build on: the `.conveyor/` scaffold, profiles, config, SQLite schema, launcher scripts, retry config, and `Blocked` stage are present. Phase 2 has started with local task claiming, transitions, retry counting, blocked-state movement, and sync alert helpers.

The next implementation target is **local-loop hardening**, not GitHub Projects V2 sync. Real GitHub pull/push remains deferred until the local Coder/Reviewer loop is deterministic, logged, observable, and regression-tested.

---

## Phase 1 – Environment Setup
**Goal**: Establish a local development ecosystem with pipeline components.

| # | Step | Details |
|---|------|---------|
| 1 | **Initialize Project Structure** | Run `conveyor init` to scaffold `.conveyor/`, profiles, and config files. Confirm `kanban.db` schema via `npm run conveyor:db:init`. |
| 2 | **Local Secret Management** | Generate `.env.template` (e.g. `GITHUB_TOKEN`, API keys) and copy to each profile directory (`coder`, `reviewer`, `project-manager`). Add `.env` to `.gitignore`. |
| 3 | **Add Observability Folders** | Create `.conveyor/metrics/` and `.conveyor/alerts/blocked/`. Add both to `.gitignore`. |
| 4 | **Configure Agents** | Update `conveyor.config.js`:<br>• Stages include `Blocked`.<br>• Coder hooks: `["test", "lint"]`.<br>• Reviewer hooks: `["test", "lint", "security-checks"]`. |

---

## Phase 2 – Pipeline Development
**Goal**: Build automated task execution and robustness mechanisms.

| # | Step | Details |
|---|------|---------|
| 1 | **Retry Logic in Sync Daemon** | Patch `sync-daemon.js` to wrap GitHub/API calls in `retryWithFixedInterval` (3 attempts, 60 s fixed interval). Use `syncHelper.js` for back-off + alert generation. |
| 2 | **Agent Rollback System** | Reviewer agent:<br>• Writes failure logs (JSON + markdown) to `.conveyor/logs/` and alerts to `.conveyor/alerts/blocked/`.<br>• Moves task back to `To Do` after 3+ consecutive failures.<br>Coder agent reads failure logs from `.conveyor/logs/`. |
| 3 | **Offline Resilience** | Agents retain their `locked_by` claim in SQLite while daemon is down. Daemon auto-resyncs on restart. |

### Next Vertical Slice: Local-Loop Hardening

Implement this before real GitHub sync:

| # | Step | Details |
|---|------|---------|
| 1 | **Runner-Owned Hooks** | `agent-runner.js` executes configured hooks from `conveyor.config.js`, including `security-checks`, instead of relying on the Reviewer model to run them. |
| 2 | **Hook Failure Logs** | On hook failure, write `.conveyor/logs/YYYY-MM-DD__task-<number>.md` before transitioning the task. Include summary, JSON metadata, command, exit code, stdout, stderr, retry count, and timestamps. |
| 3 | **Retry + Block Transition** | Any non-zero adapter exit, hook failure, timeout, or runner error increments retry count. If the configured max retry count is reached, move the task to `Blocked`; otherwise return it to `To Do`. |
| 4 | **Previous Failure Context** | When the Coder claims a retry task, inject the latest matching failure log into the task context so the next attempt is informed by the actual failure. |
| 5 | **Separate Timeouts** | Add separate timeouts for agent adapter execution and hook execution. Adapter timeouts are role-specific; hook timeouts are shared unless overridden. |
| 6 | **Metrics JSONL** | Write `.conveyor/metrics/YYYY-MM-DD.jsonl`, one event per line. Minimum events: `task_claimed`, `adapter_started`, `adapter_finished`, `hook_started`, `hook_finished`, `task_retried`, `task_blocked`, `task_transitioned`, `runner_error`. |
| 7 | **Regression Tests** | Prove one full failure path: Reviewer hook fails, log is written, retry increments, task returns to `To Do` or `Blocked`, Coder receives latest failure context, and metrics are emitted. |

---

## Phase 3 – Observability & Testing
**Goal**: Ensure visibility and reliability before production use.

| # | Step | Details |
|---|------|---------|
| 1 | **Validate Observability** | Generate dummy metrics with `node .conveyor/scripts/metrics-to-csv.js`. Confirm JSON includes `task_throughput`, `agent_latency`, `hook_failures`. |
| 2 | **Simulate Failures** | • **Network outage** – test daemon retries + alert creation.<br>• **Invalid `GITHUB_TOKEN`** – verify alerts + agents halt new tasks.<br>• **Security check** – inject a fake secret to trigger `security-checks` skill. |
| 3 | **Monitor Retries** | Use `.conveyor/metrics/` or CSV exports to track completion/blocked rates. |

---

## Phase 4 – Hosting & Automation
**Goal**: Enable safe collaboration and future maintenance.

| # | Step | Details |
|---|------|---------|
| 1 | **Automate Profile Setup** | Add script to copy `.env.template → .env` for new profiles during `conveyor init`. |
| 2 | **Future-Proof Config** | Extend `configs.yaml` with `retry` and `alerts.blockedDir`. Document retry policy + alert filename pattern in `README.md`. |
| 3 | **CI/CD Integration (Optional)** | Add Slack/Discord webhook notifications on task completion or block. |

---

## Final Testing Checklist
- [ ] Sync daemon retries GitHub calls 3× before alerting.
- [ ] Reviewer rolls tasks to `To Do` after 3+ failures.
- [ ] Reviewer hooks are executed by the runner with captured stdout/stderr.
- [ ] Hook failures create markdown logs with embedded JSON metadata.
- [ ] Coder retry prompts include the latest matching failure log.
- [ ] Adapter and hook timeouts are enforced separately.
- [ ] Metrics JSONL records claim, adapter, hook, retry, blocked, transition, and error events.
- [ ] Agents claim/delete branches atomically and cleanly.
- [ ] Metrics and alerts persist through daemon restarts.
- [ ] Security checks prevent secrets from entering the repo.

---

## Post-Execution Notes
- **Alert Cleanup**: Add cron job/script to purge old `.conveyor/alerts/blocked/` files (e.g., older than 30 days).
- **Metrics Aggregation**: Periodically aggregate metrics into a dashboard (Grafana + Prometheus bridge or simple CSV viewer).
