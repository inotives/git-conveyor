# Decision Log — Grill-Me Session

This document captures the key design decisions made during the grill-me review of `project-spec.md` and the subsequent implementation discussion.

---

## 1. Conflict Resolution in Sync

**Question:**
If a human moves a card on GitHub at the same time an autonomous agent changes the task locally, how should the conflict be resolved?

**Resolution:**
Use a **remote-wins with execution lock** policy:
- GitHub Projects V2 remains the source of truth.
- If a task is currently `locked_by` an agent, the sync daemon should **not** interrupt that execution.
- Once the agent finishes and releases the lock, the daemon can reconcile the remote state.
- Human moves are respected, but never mid-execution.

---

## 2. Failure Handling for Hooks

**Question:**
When the Reviewer’s hook (test/lint/build) fails, how should the failure be communicated back to the Coder?

**Resolution:**
The Reviewer must provide a **complete failure comment/log**:
- Include the full `stdout` and `stderr` from the failed hook.
- Add a concise failure summary.
- Store metadata as JSON inside the same markdown log.
- The Coder reads the log before retrying and fixes the issue based on it.

---

## 3. Skill Loading

**Question:**
How should the agents know which skills to use?

**Resolution:**
Each profile’s `INSTRUCTIONS.md` should declare which skills are enabled.  
Additional skills are loaded from the profile’s own `skills/` folder.  
No global skill registry is required.

---

## 4. Agent Timeout & Rollback

**Question:**
If a task exceeds its allowed runtime, what should happen?

**Resolution:**
Use a **hard timeout**:
- `agent-runner.js` enforces the timeout.
- If the timeout is hit, the agent stops, releases the lock, and rolls the task back to `To Do`.
- No task is allowed to hang indefinitely.

---

## 5. Failure Logs vs Short-Lived Branches

**Question:**
Should failed tasks create a short-lived PR branch, or use a local log folder?

**Resolution:**
Use a **local logs folder**, not short-lived branches:
- Store failure logs in `.conveyor/logs/`.
- Filename format: `YYYY-MM-DD__<task-id-or-name>.md`.
- The markdown file contains:
  - a failure summary,
  - a JSON metadata block,
  - the full hook output.
- The Coder reads the latest log for the same task before retrying.

---

## 6. Retry Limit & Blocked Stage

**Question:**
How should the system prevent infinite retry loops?

**Resolution:**
If a task fails repeatedly, move it to a **Blocked** stage:
- Retry count is tracked per task.
- After the configured maximum retries (currently `3`), the task is moved to `Blocked`.
- A human must validate the issue and move it back to `To Do`.
- When the task re-enters `To Do`, the retry counter is reset.

---

## 7. Secret Management

**Question:**
How should secrets be stored and used?

**Resolution:**
Use **local `.env` files per profile**:
- `.env` files are never committed.
- A `.env.template` is provided and copied during initialization.
- Each profile (coder, reviewer, project-manager) gets its own `.env`.
- Agents read secrets from `process.env`.
- A `security-checks` skill scans tracked files for secret patterns before a task can be marked `Done`.

---

## 8. Observability & Metrics

**Question:**
How should system observability be implemented?

**Resolution:**
Use **local JSON metrics logs**:
- Store daily files in `.conveyor/metrics/YYYY-MM-DD.json`.
- Log entries include:
  - `task_throughput`,
  - `agent_latency`,
  - `hook_failure`,
  - token usage when available.
- This keeps overhead low and avoids extra services.
- Optional CSV export can be added later.

---

## 9. Sync Daemon Retry Policy

**Question:**
How should the sync daemon behave when GitHub or SQLite operations fail?

**Resolution:**
Use **fixed-interval retries**:
- Maximum attempts: `3`.
- Fixed back-off interval: `60` seconds.
- After all retries fail, write a markdown alert file under:
  - `.conveyor/alerts/blocked/YYYY-MM-DD-HH-MM-SS--<taskId>.md`
- Agents continue their current task; they do not start new ones while the daemon is unavailable.
- Once the daemon recovers, it resynchronizes the board before continuing.

---

## 10. Shared Configuration

**Question:**
Where should retry counts, intervals, and other operational settings live?

**Resolution:**
Store them in a shared config file:
- `.conveyor/shared/configs.yaml`
- Suggested keys:
  - `retry.maxAttempts`
  - `retry.intervalMs`
  - `sync.cycleDelayMs`
  - `alerts.blockedDir`
- The daemon reads this file at startup and uses it for retry behavior and alert paths.

---

## 11. Local-Only Development Philosophy

**Question:**
Is this system intended for cloud or production use?

**Resolution:**
No.  
The current scope is **purely local development**:
- No cloud-hosted agents.
- No production deployment.
- No remote execution environment.
- All state, logs, metrics, and alerts remain on the developer’s machine.

---

## 12. Summary of Current Architecture

| Area | Decision |
|------|----------|
| Sync conflict handling | Remote-wins with execution lock |
| Failure reporting | Full markdown + JSON log in `.conveyor/logs/` |
| Retry policy | 3 attempts, 60 s fixed interval |
| Observability | Local JSON metrics in `.conveyor/metrics/` |
| Secret management | Local `.env` files per profile, gitignored |
| Security | `security-checks` skill before `Done` |
| Blocked tasks | Human validation required |
| Config | `.conveyor/shared/configs.yaml` |
| Runtime scope | Local-only, no cloud/prod |

---

## 13. Next Implementation Priority

**Question:**
Should the next implementation target be real GitHub Projects V2 sync, or should the local-only conveyor loop be hardened first?

**Resolution:**
Harden the **local-only conveyor loop first**:
- GitHub sync remains deferred until the local Coder/Reviewer loop is deterministic.
- The next slice should prove local task execution, hook failure handling, retry/blocking, Coder retry context, and metrics.
- GitHub sync should later be treated as a transport layer over a reliable local state machine.

---

## 14. Reviewer Hook Ownership

**Question:**
Should Reviewer hooks be executed by `agent-runner.js`, or should they live inside the Reviewer adapter/profile behavior?

**Resolution:**
Hook orchestration belongs in **`agent-runner.js`**, driven by `conveyor.config.js`:
- Hooks are deterministic pipeline mechanics, not model behavior.
- The runner captures command, exit code, stdout, stderr, and timing consistently.
- Reviewer model behavior may still evaluate quality, but hooks must not depend on the model voluntarily running the right commands.

---

## 15. Hook Failure Order

**Question:**
When Reviewer hooks fail, should the task transition happen immediately, or should a failure log be written first?

**Resolution:**
Always write the **failure log first**, then transition:
- The Coder's next attempt needs concrete failure evidence.
- Logs must include failed command, exit code, stdout, stderr, timestamp, retry count, and task metadata.
- After the log is written, the runner increments retry count and moves the task to `To Do` or `Blocked`.

---

## 16. Retry Failure Types

**Question:**
What should count as a retry failure?

**Resolution:**
Any failed task attempt increments retry count:
- non-zero adapter exit,
- hook failure,
- runner-enforced timeout,
- runner error.

Each log should include a `failure_type`, such as:
- `adapter_exit`
- `hook_failure`
- `timeout`
- `runner_error`

---

## 17. Timeout Boundaries

**Question:**
Should task timeout be global, or should adapter execution and hook execution have separate timeouts?

**Resolution:**
Use **separate timeouts**:
- Agent adapter timeout is role-specific.
- Hook timeout is shared unless a hook-specific override is added later.
- Timeouts must produce failure logs and increment retry count.

Suggested config shape:

```yaml
agents:
  coder:
    timeoutMs: 900000
  reviewer:
    timeoutMs: 600000

hooks:
  timeoutMs: 300000
```

---

## 18. Metrics Format

**Question:**
Should metrics only record task transitions, or lower-level runner events too?

**Resolution:**
Record lower-level events as **JSON lines**:
- Store daily files in `.conveyor/metrics/YYYY-MM-DD.jsonl`.
- Write one event per line for cheap local auditability and simple CSV export later.

Minimum event types:
- `task_claimed`
- `adapter_started`
- `adapter_finished`
- `hook_started`
- `hook_finished`
- `task_retried`
- `task_blocked`
- `task_transitioned`
- `runner_error`

---

## 19. Coder Retry Context

**Question:**
Should the Coder automatically receive the latest failure log for its task?

**Resolution:**
Yes. The runner should inject the latest matching `.conveyor/logs/` entry into the Coder task context:
- Retry quality should not depend on model-driven file discovery.
- The injected context should be bounded so large logs do not overwhelm the prompt.
- Matching should use task ID or task number.

---

## 20. Security Checks

**Question:**
Should `security-checks` be a normal shell hook or a built-in runner check?

**Resolution:**
Treat `security-checks` as a **normal shell hook** with a repo-provided default command:
- Every hook should have the same execution, timeout, logging, and retry semantics.
- Projects can replace the default with `gitleaks`, `trufflehog`, or a custom command without changing runner code.

---

## 21. Local-Loop Vertical Slice

**Question:**
Should local-loop hardening be implemented as one vertical slice or as broad subsystems?

**Resolution:**
Implement **one vertical slice first**:
- Reviewer runs configured hooks.
- A hook fails.
- The runner writes `.conveyor/logs/YYYY-MM-DD__task-<number>.md`.
- Retry count increments.
- The task returns to `To Do` or moves to `Blocked`.
- The Coder's next run receives the latest failure log in context.
- Metrics JSONL records the key events.

---

This decision log should be updated whenever the pipeline design changes significantly.
