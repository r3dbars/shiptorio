const shellQuote = (value: string) => "'" + value.replaceAll("'", "'\\''") + "'";

/** The origin must reach both curl and sh: the installer downloads and saves its own endpoint. */
export function runnerInstallCommand(origin: string, join?: string) {
  const install = `curl -fsSL ${shellQuote(`${origin}/install.sh`)} | SHIPTORIO_URL=${shellQuote(origin)} sh`;
  return join ? `${install} -s -- --join ${shellQuote(join)}` : install;
}
