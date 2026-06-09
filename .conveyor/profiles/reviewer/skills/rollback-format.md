# Rollback Note Format

When a review fails, write a rollback log at `.conveyor/logs/YYYY-MM-DD__<task-id>.md`:

```markdown
# Rollback: <task-title>

**Task ID**: <id>
**Failed stage**: <hook name>
**Attempt**: <N>

## Failure summary
<1-3 sentence summary of what failed>

## Hook output
```
<stdout/stderr from the failed hook>
```

## Metadata
\`\`\`json
{
  "taskId": "<id>",
  "attempt": <N>,
  "failedHook": "<name>",
  "exitCode": <N>,
  "timestamp": "<ISO-8601>"
}
\`\`\`
```
