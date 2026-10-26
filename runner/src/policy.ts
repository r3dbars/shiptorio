// Keep provider/Cloudflare/GitHub credentials out of child environments.
export function agentEnvironment(input: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  return Object.fromEntries(["HOME", "PATH", "TMPDIR", "USER", "LOGNAME", "SHELL", "LANG", "TERM", "CODEX_HOME"].filter(k => input[k]).map(k => [k, input[k]]));
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
