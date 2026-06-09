# Security Checks

Before marking a task as Done, verify:

1. **No hardcoded secrets** — scan all modified files for patterns matching:
   - `api_key`, `apikey`, `API_KEY`
   - `secret`, `SECRET`
   - `password`, `PASSWORD`
   - `token`, `TOKEN` (except known-safe refs like `GITHUB_TOKEN` in `.env.template`)
   - `private_key`, `PRIVATE_KEY`
2. **No committed `.env` files** — ensure no `.env` file appears in the diff.
3. **No internal URLs** — ensure no internal/private URLs leaked into public code.
