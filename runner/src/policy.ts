// Child environments are constructed, never inherited. Subscription auth requires
// an explicitly selected dedicated home; callers must not pass the user's HOME.
export function agentEnvironment(input: NodeJS.ProcessEnv, home?: string): NodeJS.ProcessEnv {
  return {
    PATH: "/usr/bin:/bin:/usr/sbin:/sbin", LANG: "en_US.UTF-8", TERM: "dumb",
    GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: "/dev/null", GIT_TERMINAL_PROMPT: "0",
    ...(home ? { HOME: home, CODEX_HOME: `${home}/.codex` } : {}),
  };
}
export function assertCheckCommand(args: string[], runtime: string, scripts: string[]): void {
  if (args[0] !== runtime) throw new Error("Check executable is not Bun");
  const tail = args.slice(1);
  if (JSON.stringify(tail) === JSON.stringify(["install", "--frozen-lockfile", "--ignore-scripts"])) return;
  if (tail.length === 1 && tail[0] === "test") return;
  if (tail.length === 2 && tail[0] === "run" && /^[a-zA-Z0-9:_-]+$/.test(tail[1]) && scripts.includes(tail[1])) return;
  throw new Error("Check command is outside the allowlist");
}
export function validateChanges(paths: string[], allowed: string[], diff: string) {
  if (!paths.length || paths.length > 10 || paths.some(p => !allowed.includes(p))) throw new Error("Agent changed paths outside the approved scope");
  if (diff.split("\n").filter(l => /^[+-](?![+-])/.test(l)).length > 500) throw new Error("Agent patch exceeds 500 changed lines");
  const added = diff.split("\n").filter(l => l.startsWith("+") && !l.startsWith("+++")).join("\n");
  if (/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|\b(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|LLM_\d+_[A-Za-z0-9_-]{20,})/.test(added)) throw new Error("Secret-looking content in patch");
}
export function harnessArgs(harness: "codex" | "claude_code", prompt: string): string[] {
  return harness === "codex"
    ? ["exec", "--ignore-user-config", "--ephemeral", "--sandbox", "workspace-write", "-c", 'approval_policy="never"', "--json", prompt]
    : ["--print", "--safe-mode", "--restricted", "--strict-mcp-config", "--mcp-config", '{"mcpServers":{}}', "--permission-mode", "acceptEdits", "--permission-prompts", "none", "--tools", "Read,Edit,Write,Glob,Grep", "--no-session-persistence", "--output-format", "json", prompt];
}
