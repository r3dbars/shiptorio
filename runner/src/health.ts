import type { Job } from "./messages";
import { tokenClaims, type Pairing, type GrantRejectionCode } from "./pairing";

export class RunnerGrantRejected extends Error {
  constructor(public code: GrantRejectionCode, public status: number) {
    super("Runner connection needs re-pairing. Run shiptorio-runner pair.");
  }
}
/** Only explicit permanent codes from the authenticated endpoint stop a connection. */
export async function runnerResponseError(response: Response, repo: string, action: string): Promise<Error> {
  let code: unknown;
  if ([401, 403].includes(response.status) && response.headers.get("content-type")?.includes("application/json")) {
    const text = await response.text();
    if (text.length <= 4096) { try { code = JSON.parse(text).code; } catch {} }
  }
  if (typeof code === "string" && ["runner_grant_expired", "runner_grant_invalid", "runner_pair_revoked", "runner_access_revoked"].includes(code)) {
    return new RunnerGrantRejected(code as GrantRejectionCode, response.status);
  }
  return Object.assign(new Error(`Runner ${repo} ${action} failed (${response.status})`), { status: response.status });
}
export type Subscription = Exclude<Job["harness"], "local">;
/** Refresh with a day in hand, rather than relying on being awake in the final hour. */
export const RENEW_BEFORE_MS = 24 * 3600_000;
export function renewalDue(pair: Pick<Pairing, "expires"> & Partial<Pick<Pairing, "token">>, now = Date.now()): boolean {
  if (pair.expires > now + RENEW_BEFORE_MS) return false;
  try {
    // Scheduling only: the server still verifies the signed grant and live session on every call.
    const ceiling = tokenClaims(pair.token!).user?.expiresAt;
    if (Number.isFinite(ceiling) && pair.expires >= ceiling) return false;
  } catch { /* Older/malformed local records do not suppress renewal. */ }
  return true;
}
/** The heartbeat runs independently of a long local build, including grant renewal. */
export async function maintainConnection(pair: Pairing, options: {
  now?: () => number;
  renew(pair: Pairing): Promise<void>;
  heartbeat(pair: Pairing): Promise<unknown>;
}) {
  if (renewalDue(pair, options.now?.() ?? Date.now())) await options.renew(pair);
  await options.heartbeat(pair);
}
export function authExpired(output: string): boolean {
  // Positive provider evidence only: configd/Seatbelt/network errors are not sign-in errors.
  return /(?:token|session|authentication|credentials?).{0,35}(?:expired|revoked|invalid)|(?:unauthorized|authentication_required|not logged in|please (?:log|sign) in|run (?:codex login|muse login|claude (?:auth )?login))|(?:invalid_grant|invalid_api_key|invalid api key|refresh_token_reused|refresh token.{0,80}already used|(?:sign|log) in again)/i.test(output);
}
export function agentOffline(output: string): boolean {
  return /connection (?:reset|refused|closed)|network (?:unreachable|error)|stream (?:disconnected|closed)|(?:request|connect|connection) timed? ?out|unable to connect|could not resolve (?:host|proxy)|failed to connect|error sending request|dns (?:error|lookup failed)/i.test(output);
}
export const agentName = (h: Subscription) => h === "codex" ? "Codex" : h === "muse_code" ? "Muse Code" : "Claude";
export const loginCommand = (h: Subscription) => `shiptorio-runner login ${h === "codex" ? "codex" : h === "muse_code" ? "muse" : "claude"}`;
export interface Diagnostic { check: string; ok: boolean; detail: string }
export async function diagnose(options: {
  harnesses: Job["harness"][]; pairs: Pairing[];
  auth(h: Job["harness"]): Promise<boolean>;
  sandbox(h?: Subscription): Promise<void>;
  pairing(pair: Pairing): Promise<void>;
  editHarness?: Subscription;
  edit?(h: Subscription): Promise<void>;
}): Promise<Diagnostic[]> {
  const results: Diagnostic[] = [];
  const check = async (name: string, run: () => Promise<void>, remedy: string) => {
    try { await run(); results.push({ check: name, ok: true, detail: "OK" }); }
    catch { results.push({ check: name, ok: false, detail: remedy }); }
  };
  if (!options.harnesses.length) results.push({ check: "auth", ok: false, detail: "Install Codex or Muse Code." });
  for (const h of options.harnesses) {
    await check(`auth:${h}`, async () => { if (!await options.auth(h)) throw Error(); }, h === "local" ? "Check the local model endpoint." : `Sign in again: ${loginCommand(h)}`);
  }
  await check("sandbox:verification", () => options.sandbox(), "OS sandbox probe failed. Check sandbox-exec / Apple Command Line Tools, or bubblewrap and user namespaces on Linux.");
  for (const h of options.harnesses.filter((h): h is Subscription => h !== "local")) {
    await check(`sandbox:${h}`, () => options.sandbox(h), "Agent sandbox probe failed (#235). Update the runner; check macOS preferences/network services or Linux bubblewrap. See the local log.");
  }
  if (!options.pairs.length) results.push({ check: "pairing", ok: false, detail: "No repositories paired. Run shiptorio-runner pair." });
  for (const pair of options.pairs) await check(`pairing:${pair.repo}`, async () => {
    if (pair.rejected || pair.expires <= Date.now()) throw Error();
    await options.pairing(pair);
  }, "Pairing expired/revoked or server unreachable. Check the network, then run shiptorio-runner pair if needed.");
  if (options.editHarness) {
    const h = options.editHarness;
    await check(`edit:${h}`, async () => {
      if (!options.harnesses.includes(h) || !results.find(r => r.check === `auth:${h}`)?.ok || !options.edit) throw Error("Agent not ready");
      await options.edit(h);
    }, `Real file-edit probe failed. Check the local error; sign in with ${loginCommand(h)} if needed. A successful login/startup does not prove the assembler can edit files.`);
  }
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

/** Fixed public categories only: provider output, paths and credentials never become server copy. */
export class RunnerExecutionFailure extends Error {
  constructor(readonly kind: 'timeout' | 'stopped', readonly agent: 'Codex' | 'Muse Code' = 'Codex') {
    super(`${agent} ${kind === 'timeout' ? 'timed out' : 'stopped'} before finishing. No code was published.`);
    this.name = 'RunnerExecutionFailure';
  }
}
export function runnerFailureSummary(error: unknown): string {
  return error instanceof RunnerExecutionFailure ? error.message : 'Local runner stopped; inspect local evidence and approve another attempt.';
}
