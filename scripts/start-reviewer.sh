#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

echo "Starting Reviewer agent (autonomous)..."
echo "Root: $PROJECT_ROOT"
echo ""

cd "$PROJECT_ROOT"
node .conveyor/shared/runners/agent-runner.js reviewer
