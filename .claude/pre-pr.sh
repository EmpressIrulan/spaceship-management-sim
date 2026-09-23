#!/usr/bin/env bash
# Repo-local check run by the pre-PR hook and by CI (see .github/workflows/ci.yml).
set -euo pipefail
cd "$(dirname "$0")/.."

if ! command -v npm >/dev/null; then
  echo "npm not found. Install Node 22 before running the pre-PR check." >&2
  exit 1
fi

npm install
npm run typecheck --workspaces --if-present
npm test --workspaces --if-present
