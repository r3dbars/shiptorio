import { runnerOrigin } from "./origin";

// Prefer a renewed installed token only when it belongs to the same pairing and endpoint.
export function pairingConfig(workspace: string, installed?: string): string {
  if (!installed) return workspace;
  const value = (text: string, name: string) => text.match(new RegExp(`^${name}=(.*)$`, "m"))?.[1];
  const claims = (text: string) => {
    const body = value(text, "SHIPTORIO_RUNNER_TOKEN")?.split(".")[0];
    if (!body) return null;
    try { return JSON.parse(atob(body.replace(/-/g, "+").replace(/_/g, "/"))); } catch { return null; }
  };
  const a = claims(workspace), b = claims(installed);
  if (a && b && a.pairId === b.pairId && a.repo === b.repo && b.expires > a.expires && value(workspace, "SHIPTORIO_URL") === value(installed, "SHIPTORIO_URL")) return installed;
  return workspace;
}

/** Resolve the endpoint from the same effective vars used by the launched CLI.
 * Refuse interpolated/ambiguous dotenv values rather than move credentials on a guess. */
export function serviceConnectionOrigin(config: string, pinned?: string): string {
  const entries = config.split(/\r?\n/).filter(line => /^\s*(?:export\s+)?SHIPTORIO_URL\s*=/.test(line));
  if (entries.length > 1) throw new Error("Duplicate runner server configuration");
  let value = entries[0]?.replace(/^\s*(?:export\s+)?SHIPTORIO_URL\s*=\s*/, "").trim();
  if (value?.startsWith('"') || value?.startsWith("'")) {
    if (value.at(-1) !== value[0]) throw new Error("Invalid runner server configuration");
    value = value.slice(1, -1);
  }
  if (value && /[$\s\\'"#]/.test(value)) throw new Error("Ambiguous runner server configuration");
  return runnerOrigin(value || pinned || "https://shiptorio.com", pinned);
}
