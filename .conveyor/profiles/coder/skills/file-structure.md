# File Structure

```
project-root/
├── .conveyor/               # Core pipeline directory
│   ├── profiles/            # Agent profiles
│   ├── shared/              # Shared code, config, skills
│   ├── metrics/             # JSON observability logs (gitignored)
│   └── alerts/              # Alert files (gitignored)
├── scripts/                 # Convenience launcher scripts
├── docs/                    # Project documentation
├── conveyor.config.js       # Single source of truth for settings
└── package.json
```
