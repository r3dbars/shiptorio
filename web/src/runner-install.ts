const shellQuote = (value: string) => "'" + value.replaceAll("'", "'\\''") + "'";

/** The origin must reach both curl and sh: the installer downloads and saves its own endpoint. */
export function runnerInstallCommand(origin: string, join?: string) {
  const isolated = origin === "https://shiptorio.dev" || origin === "https://www.shiptorio.dev"
    ? 'SHIPTORIO_RUNNER_ROOT="$HOME/.local/share/shiptorio/runner-staging" SHIPTORIO_RUNNER_BIN_DIR="$HOME/.local/bin/shiptorio-staging" '
    : "";
  const install = `curl -fsSL ${shellQuote(`${origin}/install.sh`)} | ${isolated}SHIPTORIO_URL=${shellQuote(origin)} sh`;
  return join ? `${install} -s -- --join ${shellQuote(join)}` : install;
}
