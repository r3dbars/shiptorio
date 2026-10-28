#!/usr/bin/env bash
# Prints code=false to $GITHUB_OUTPUT when a pull request changes only notes that never
# reach a build: Markdown outside docs/site/, plus anything under docs/context/ or
# docs/playtest/ (the same files the Deploy workflow skips). Anything else, or any event
# that isn't a pull request, prints code=true so every check runs.
set -euo pipefail
code=true
if [ "${GITHUB_EVENT_NAME:-}" = pull_request ] && [ -n "${PR_NUMBER:-}" ]; then
  files=$(gh api "repos/$GITHUB_REPOSITORY/pulls/$PR_NUMBER/files" --paginate --jq '.[].filename')
  if [ -n "$files" ] && ! grep -Ev '^docs/(context|playtest)/|\.md$' <<<"$files" | grep -q . \
    && ! grep -q '^docs/site/' <<<"$files"; then
    code=false
    echo "Docs-only change; skipping builds and tests:"
    echo "$files"
  fi
fi
echo "code=$code" >> "$GITHUB_OUTPUT"
