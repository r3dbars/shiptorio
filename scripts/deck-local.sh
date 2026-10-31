#!/usr/bin/env bash
# Play the 2D deck on your Mac with one paste:
#   curl -fsSL https://raw.githubusercontent.com/r3dbars/shiptorio/dev/scripts/deck-local.sh | bash
# Pulls the latest dev into ~/shiptorio-deck (its own folder, so ~/shiptorio-preview is left
# alone), installs, serves on http://localhost:5191 and opens the deck. Run it again any time
# to pick up new merges. Ctrl+C stops it.
#   DECK_BRANCH=some-branch   try a branch before it's merged
#   DECK_PORT=5191            pick another port
#   DECK_DIR=~/shiptorio-deck pick another folder (it gets reset to the branch, don't edit in it)
set -euo pipefail

BRANCH="${DECK_BRANCH:-dev}"
PORT="${DECK_PORT:-5191}"
DIR="${DECK_DIR:-$HOME/shiptorio-deck}"
PAGE="/deck.html"  # the pixel deck is the default now (?px=0 = old painted look)

say() { printf '\033[1;33m▸ %s\033[0m\n' "$*"; }

command -v git >/dev/null || { echo "git is missing. Run: xcode-select --install"; exit 1; }
if ! command -v bun >/dev/null; then
  [ -x "$HOME/.bun/bin/bun" ] || { say "Installing bun (one time)"; curl -fsSL https://bun.sh/install | bash >/dev/null; }
  export PATH="$HOME/.bun/bin:$PATH"
fi

if [ ! -d "$DIR/.git" ]; then
  say "Downloading Shiptorio into $DIR"
  git clone --quiet --filter=blob:none https://github.com/r3dbars/shiptorio.git "$DIR"
fi
cd "$DIR"
say "Getting the latest $BRANCH"
git fetch --quiet origin "$BRANCH"
git checkout --quiet -B "$BRANCH" FETCH_HEAD
git reset --quiet --hard FETCH_HEAD
say "Installing (fast after the first time)"
bun install --silent

# Stop an older copy of this script still holding the port.
old="$(lsof -ti tcp:"$PORT" -sTCP:LISTEN 2>/dev/null || true)"
[ -n "$old" ] && { say "Stopping the old server on port $PORT"; kill $old 2>/dev/null || true; sleep 1; }

# Older dev has no deck page yet; fall back to the story prototype so the paste still shows something.
[ -f web/deck.html ] || [ -f web/public/deck.html ] || { PAGE="/story-b/"; say "No deck page on $BRANCH yet, opening the story prototype instead"; }

URL="http://localhost:$PORT$PAGE"
LAN="$(ipconfig getifaddr en0 2>/dev/null || true)"
(
  for _ in $(seq 1 120); do curl -fs "http://localhost:$PORT/" >/dev/null 2>&1 && break; sleep 0.5; done
  echo
  say "Deck is up: $URL"
  [ -n "$LAN" ] && say "On your phone (same Wi-Fi): http://$LAN:$PORT$PAGE"
  say "Ctrl+C here to stop it"
  open "$URL" 2>/dev/null || true
) &

cd web
exec bun x vite --port "$PORT" --strictPort --host
