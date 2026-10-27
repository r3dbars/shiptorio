import type { Job } from "./messages";
import type { Pairing } from "./pairing";

export type Subscription = Exclude<Job["harness"], "local">;
export function authExpired(output: string): boolean {
  // Positive provider evidence only: configd/Seatbelt/network errors are not sign-in errors.
  return /(?:token|session|authentication|credentials?).{0,35}(?:expired|revoked|invalid)|(?:unauthorized|authentication_required|not logged in|please (?:log|sign) in|run (?:codex login|claude (?:auth )?login))|(?:invalid_grant|invalid_api_key|invalid api key)/i.test(output);
}
export function agentOffline(output: string): boolean {
  return /connection (?:reset|refused|closed)|network (?:unreachable|error)|stream (?:disconnected|closed)|(?:request|connect|connection) timed? ?out|unable to connect|error sending request|dns (?:error|lookup failed)/i.test(output);
}
export const loginCommand = (h: Subscription) => `shiptorio-runner login ${h === "codex" ? "codex" : "claude"}`;
export interface Diagnostic { check: string; ok: boolean; detail: string }
export async function diagnose(options: {
  harnesses: Job["harness"][]; pairs: Pairing[];
  auth(h: Job["harness"]): Promise<boolean>;
  sandbox(h?: Subscription): Promise<void>;
  pairing(pair: Pairing): Promise<void>;
}): Promise<Diagnostic[]> {
  const results: Diagnostic[] = [];
  const check = async (name: string, run: () => Promise<void>, remedy: string) => {
    try { await run(); results.push({ check: name, ok: true, detail: "OK" }); }
    catch { results.push({ check: name, ok: false, detail: remedy }); }
  };
  if (!options.harnesses.length) results.push({ check: "auth", ok: false, detail: "Install Codex CLI or Claude Code." });
  for (const h of options.harnesses) {
    await check(`auth:${h}`, async () => { if (!await options.auth(h)) throw Error(); }, h === "local" ? "Check the local model endpoint." : `Sign in again: ${loginCommand(h)}`);
  }
  await check("sandbox:verification", () => options.sandbox(), "OS sandbox probe failed. Check sandbox-exec / Apple Command Line Tools, or bubblewrap and user namespaces on Linux.");
  for (const h of options.harnesses.filter((h): h is Subscription => h !== "local")) {
    await check(`sandbox:${h}`, () => options.sandbox(h), "Agent sandbox probe failed (#235). Update the runner; check macOS preferences/network services or Linux bubblewrap. See the local log.");
  }
  if (!options.pairs.length) results.push({ check: "pairing", ok: false, detail: "No repositories paired. Run shiptorio-runner pair." });
  for (const pair of options.pairs) await check(`pairing:${pair.repo}`, async () => {
    if (pair.expires <= Date.now()) throw Error();
    await options.pairing(pair);
  }, "Pairing expired/revoked or server unreachable. Check the network, then run shiptorio-runner pair if needed.");
  return results;
}

/** A cached CLI status may still say logged in after a refresh token was revoked. */
export class AuthFailures {
  private failed = new Map<Subscription, string>();
  reject(h: Subscription, credentialVersion: string) { this.failed.set(h, credentialVersion); }
  ready(h: Subscription, status: boolean, credentialVersion: string) {
    if (!status || this.failed.get(h) === credentialVersion) return false;
    this.failed.delete(h); return true;
  }
}
