# Git-Conveyor Execution Plan

> Structured, phased plan derived from `project-specs.md` + all “grill-me” decisions.

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
- [ ] Agents claim/delete branches atomically and cleanly.
- [ ] Metrics and alerts persist through daemon restarts.
- [ ] Security checks prevent secrets from entering the repo.

---

## Post-Execution Notes
- **Alert Cleanup**: Add cron job/script to purge old `.conveyor/alerts/blocked/` files (e.g., older than 30 days).
- **Metrics Aggregation**: Periodically aggregate metrics into a dashboard (Grafana + Prometheus bridge or simple CSV viewer).