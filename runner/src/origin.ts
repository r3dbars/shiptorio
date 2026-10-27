/** Self-hosted HTTPS origins are allowed; unencrypted transport stays local-only. */
export function runnerOrigin(value: string, pinned?: string): string {
  let url: URL;
  try { url = new URL(value); } catch { throw new Error("Unsupported Shiptorio origin"); }
  const local = url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if ((url.protocol !== "https:" && !local) || url.username || url.password || url.pathname !== "/" || url.search || url.hash) {
    throw new Error("Use an HTTPS Shiptorio origin, or HTTP on localhost for development");
  }
  if (pinned !== undefined && url.origin !== runnerOrigin(pinned)) {
    throw new Error("This runner is paired with another Shiptorio server. Use a separate SHIPTORIO_RUNNER_ROOT or restore its original SHIPTORIO_URL.");
  }
  return url.origin;
}
