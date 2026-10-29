#!/bin/sh
# Shiptorio standalone installer, macOS + Linux (Windows: run inside WSL2).
set -eu
umask 077
# The Power panel's one-paste command adds `-s -- --join <code>`: a single-use, ten-minute code for one repo.
join=
if [ "${1:-}" = --join ]; then
  join=${2:-}
  case "$join" in *[!a-f0-9]*|'') echo 'That setup command looks cut off. Copy a fresh one from Power in your factory.' >&2; exit 1 ;; esac
fi
origin=${SHIPTORIO_URL:-https://shiptorio.com}
origin=${origin%/}
case "$origin" in
  https://shiptorio.dev|https://www.shiptorio.dev)
    default_support="$HOME/.local/share/shiptorio/runner-staging"
    default_bin="$HOME/.local/bin/shiptorio-staging" ;;
  *) default_support="$HOME/.local/share/shiptorio/runner"; default_bin="$HOME/.local/bin" ;;
esac
support="${SHIPTORIO_RUNNER_ROOT:-$default_support}"
bin="${SHIPTORIO_RUNNER_BIN_DIR:-$default_bin}"
# Never send an existing installation's pairing tokens to a different server.
previous="$origin"
if [ -f "$support/server-url" ]; then
  previous=$(cat "$support/server-url")
elif [ -f "$support/runner.mjs" ]; then
  previous=https://shiptorio.com
fi
if [ "$previous" != "$origin" ]; then
  echo 'This runner is installed for another Shiptorio server. Use a separate SHIPTORIO_RUNNER_ROOT and SHIPTORIO_RUNNER_BIN_DIR, or uninstall it first.' >&2
  exit 1
fi
case "$(uname -s)" in
  Darwin) platform=darwin ;;
  Linux) platform=linux ;;
  *) echo 'Use macOS, Linux, or a Linux terminal in WSL2.' >&2; exit 1 ;;
esac
case "$(uname -m)" in
  arm64|aarch64) arch=aarch64 ;;
  x86_64|amd64) arch=x64 ;;
  *) echo 'Unsupported CPU. Use arm64 or x86_64.' >&2; exit 1 ;;
esac
command -v curl >/dev/null 2>&1 || { echo 'curl is missing; install it with your package manager, then run setup again.' >&2; exit 1; }
if ! command -v git >/dev/null 2>&1; then
  if [ "$platform" = darwin ]; then echo 'Git is missing; run xcode-select --install, then run setup again.' >&2
  else echo 'Git is missing; install git with your package manager, then run setup again.' >&2; fi
  exit 1
fi
mkdir -p "$support" "$bin"
chmod 700 "$support"
staging=$(mktemp -d "$support/install.XXXXXX")
trap 'rm -rf "$staging"' EXIT HUP INT TERM
# A private pinned Bun keeps the runner independent of checkout/runtime updates.
version=__BUN_VERSION__
if [ ! -x "$support/bun" ] || [ "$("$support/bun" --version)" != "$version" ]; then
  command -v unzip >/dev/null 2>&1 || { echo 'Install unzip first.' >&2; exit 1; }
  asset="bun-$platform-$arch"
  [ "$platform-$arch" != linux-x64 ] || asset=bun-linux-x64-baseline
  curl -fsSL "https://github.com/oven-sh/bun/releases/download/bun-v$version/$asset.zip" -o "$staging/bun.zip" || { echo 'The runner runtime could not download; check your connection and run setup again.' >&2; exit 1; }
  unzip -q "$staging/bun.zip" -d "$staging" || { echo 'The runner runtime download was incomplete; run setup again.' >&2; exit 1; }
  chmod 700 "$staging/$asset/bun"
  mv "$staging/$asset/bun" "$support/bun"
fi
# These public files are independent; fetch them together and verify before installing either.
curl -fsSL "$origin/runner-manifest.json" -o "$staging/manifest.json" 2>"$staging/manifest-download.log" &
manifest_pid=$!
curl -fsSL "$origin/runner.mjs" -o "$staging/runner.mjs" 2>"$staging/bundle-download.log" &
bundle_pid=$!
downloads_ok=1
wait "$manifest_pid" || downloads_ok=0
wait "$bundle_pid" || downloads_ok=0
[ "$downloads_ok" = 1 ] || { echo 'The runner could not download; check your connection and run setup again.' >&2; exit 1; }
if ! "$support/bun" --no-env-file --config=/dev/null -e '
const [manifest, bundle] = process.argv.slice(1);
const info = await Bun.file(manifest).json();
const digest = new Bun.CryptoHasher("sha256").update(await Bun.file(bundle).arrayBuffer()).digest("hex");
if (!/^[a-f0-9]{64}$/.test(info.sha256) || digest !== info.sha256) throw Error("Runner download changed. Rerun the installer.");
' "$staging/manifest.json" "$staging/runner.mjs" 2>"$staging/verify.log"; then
  echo 'The runner download could not be verified; run setup again.' >&2
  exit 1
fi
mv "$staging/runner.mjs" "$support/runner.mjs"
printf '%s\n' "$origin" > "$support/server-url"
# Remember this installation's directory even when a later terminal has no setup variables.
# Single-quote the path so spaces, dollars and apostrophes stay literal shell data.
escaped_support=$(printf '%s' "$support" | sed "s/'/'\\\\''/g")
{
  printf "#!/bin/sh\nsupport='%s'\n" "$escaped_support"
  cat <<'LAUNCHER'
support="${SHIPTORIO_RUNNER_ROOT:-$support}"
cd "$support"
exec "$support/bun" --no-env-file --config=/dev/null "$support/runner.mjs" "$@"
LAUNCHER
} > "$staging/shiptorio-runner"
chmod 700 "$staging/shiptorio-runner"
mv "$staging/shiptorio-runner" "$bin/shiptorio-runner"
# Spend the join code first: it is the short-lived part, and the factory shows "connected" right away.
[ -z "$join" ] || "$bin/shiptorio-runner" pair --join "$join"
echo 'Checking your coding agent sign-in…'
"$bin/shiptorio-runner" setup
echo 'Shiptorio runner is ready'
echo 'Keep this terminal open; Ctrl-C stops the runner.'
exec "$bin/shiptorio-runner" watch
