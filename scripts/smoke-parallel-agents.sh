#!/usr/bin/env bash
# Runs claude -p and codex exec at the same time in two worktrees of a throwaway repo,
# to check they don't clash over locks or login state.
set -euo pipefail

work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT

git init -q -b main "$work/repo"
cd "$work/repo"
git config user.name "Shiptorio Smoke Test"
git config user.email "smoke@shiptorio.invalid"
printf 'def add(a, b):\n    return a - b\n' > calc.py
git add . && git commit -qm init
git worktree add -q "$work/wt-claude" -b claude
git worktree add -q "$work/wt-codex" -b codex

prompt='calc.py has a bug in add(). Fix it and commit with message "fix add". Do nothing else.'

(cd "$work/wt-claude" && claude -p "$prompt" --permission-mode acceptEdits --allowedTools "Bash(git *)" \
  --output-format stream-json --verbose > "$work/claude.jsonl" 2>&1; echo "claude exit $?") &
(cd "$work/wt-codex" && codex exec --json --full-auto "$prompt" > "$work/codex.jsonl" 2>&1; echo "codex exit $?") &
wait

for b in claude codex; do
  printf '%s: ' "$b"
  git log "$b" --oneline -1
  git show "$b:calc.py" | grep -q 'a + b' && echo "  fixed" || echo "  NOT fixed (see $b.jsonl)"
done
