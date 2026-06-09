# Security Rules

- NEVER hardcode API keys, tokens, passwords, or secrets in source files.
- NEVER commit `.env` files to version control.
- If a secret is detected during review, fail the review and alert.
- Use environment variables or `.env` files (gitignored) for all sensitive values.
