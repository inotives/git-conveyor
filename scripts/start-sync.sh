#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

echo "Starting git-conveyor sync daemon..."
echo "Root: $PROJECT_ROOT"
echo ""

cd "$PROJECT_ROOT"
node .conveyor/shared/kanban/sync-daemon.js
