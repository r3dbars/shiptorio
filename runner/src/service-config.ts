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
