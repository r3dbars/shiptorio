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
origin=https://shiptorio.com
support="$HOME/.local/share/shiptorio/runner"
bin="$HOME/.local/bin"
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
command -v git >/dev/null 2>&1 || { echo 'Install git first (macOS: xcode-select --install).' >&2; exit 1; }
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
  curl -fsSL "https://github.com/oven-sh/bun/releases/download/bun-v$version/$asset.zip" -o "$staging/bun.zip"
  unzip -q "$staging/bun.zip" -d "$staging"
  chmod 700 "$staging/$asset/bun"
  mv "$staging/$asset/bun" "$support/bun"
fi
curl -fsSL "$origin/runner-manifest.json" -o "$staging/manifest.json"
curl -fsSL "$origin/runner.mjs" -o "$staging/runner.mjs"
"$support/bun" --no-env-file --config=/dev/null -e '
const [manifest, bundle] = process.argv.slice(1);
const info = await Bun.file(manifest).json();
const digest = new Bun.CryptoHasher("sha256").update(await Bun.file(bundle).arrayBuffer()).digest("hex");
if (!/^[a-f0-9]{64}$/.test(info.sha256) || digest !== info.sha256) throw Error("Runner download changed. Rerun the installer.");
' "$staging/manifest.json" "$staging/runner.mjs"
mv "$staging/runner.mjs" "$support/runner.mjs"
cat > "$staging/shiptorio-runner" <<'LAUNCHER'
#!/bin/sh
cd "$HOME/.local/share/shiptorio/runner"
exec "$HOME/.local/share/shiptorio/runner/bun" --no-env-file --config=/dev/null "$HOME/.local/share/shiptorio/runner/runner.mjs" "$@"
LAUNCHER
chmod 700 "$staging/shiptorio-runner"
mv "$staging/shiptorio-runner" "$bin/shiptorio-runner"
# Spend the join code first: it is the short-lived part, and the factory shows "connected" right away.
[ -z "$join" ] || "$bin/shiptorio-runner" pair --join "$join"
echo 'Shiptorio runner installed. Checking your local agents…'
"$bin/shiptorio-runner" setup
echo 'Starting your runner. Keep this terminal open; Ctrl-C stops it.'
exec "$bin/shiptorio-runner" watch
