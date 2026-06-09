# Review Criteria

A task passes review when ALL of the following are true:
1. All configured hooks exit with code 0.
2. No security secrets detected in the diff (checked by `security-checks`).
3. Code follows conventions in `code-conventions.md`.
4. All modified files exist and are syntactically valid.
5. No TODO/FIXME comments left in new code unless explicitly allowed by the task.
