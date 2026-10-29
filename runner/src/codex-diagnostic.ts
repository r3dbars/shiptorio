import { Redactor } from "../../server/src/redact";
import type { SandboxResult } from "./sandbox";

const MAX_BYTES = 512000, MAX_EVENTS = 1000;
const category = (message: string): string | undefined => {
  if (/refresh_token_reused|invalid_grant|invalid_api_key|authentication_required|not logged in|unauthorized|(?:token|session|credential|authentication).{0,80}(?:expired|revoked|already (?:been )?used)/i.test(message)) return "Codex authentication or authorization rejected";
  if (/rate.?limit|usage.?limit|quota|too many requests|\b429\b/i.test(message)) return "Codex usage or rate limit reached";
  const status = message.match(/\b(?:HTTP(?: status)?|status(?: code)?)\s*[:=]?\s*(4\d\d|5\d\d)\b/i)?.[1];
  if (status) return `Codex provider request failed (HTTP ${status})`;
  if (/trusted directory|skip-git-repo-check/i.test(message)) return "Codex rejected the working directory";
  if (/(?:invalid|unsupported).{0,40}(?:schema|response_format)/i.test(message)) return "Codex rejected the response schema";
  if (/(?:unknown|unexpected|invalid|unrecognized).{0,40}(?:argument|option|config|feature)/i.test(message)) return "Codex rejected its configuration or arguments";
  if (/(?:model.{0,60}(?:not found|unavailable|unsupported|not support)|unsupported.{0,30}model)/i.test(message)) return "Codex model unavailable or unsupported";
  if (/sandbox|operation not permitted|permission denied/i.test(message)) return "Codex sandbox or OS permission rejected";
  if (/ECONN|ENET|EHOST|DNS|timed? ?out|timeout|connection (?:reset|refused|closed)|stream disconnected|error sending request/i.test(message)) return "Codex provider connection failed";
  return undefined;
};

/** Doctor only: fixed categories, never provider text, agent_message or raw JSONL. */
export function codexDoctorFailure(result: SandboxResult | undefined, failure: unknown, redactor = new Redactor(process.env)): string {
  // Scrub complete inputs before applying any bound. Raw stdout is parsed only
  // within bounds and only explicit failure messages become diagnostic candidates.
  const out = result?.out ?? "", err = result?.err ?? "";
  const cleanOut = redactor.text(out), cleanErr = redactor.text(err);
  const message = redactor.text(failure instanceof Error ? failure.message : "");
  let reason: string | undefined;
  if (result?.timedOut) reason = "Codex edit probe timed out";
  else if (/Agent did not produce the required file edit/i.test(message)) reason = "Codex exited without the required verified file edit";
  else if (/Edit probe (?:modified an unapproved file|exceeded its approved scope)/i.test(message)) reason = "Codex failed approved-scope verification";
  else if (Buffer.byteLength(out) > MAX_BYTES || Buffer.byteLength(cleanOut) > MAX_BYTES || Buffer.byteLength(err) > MAX_BYTES || Buffer.byteLength(cleanErr) > MAX_BYTES) reason = "Codex diagnostics exceeded the safe output limit";
  else {
    const lines = out.split("\n");
    if (lines.length > MAX_EVENTS) reason = "Codex diagnostics exceeded the safe event limit";
    else for (const line of lines) {
      let event: any;
      try { event = JSON.parse(line); } catch { continue; }
      if (event?.type !== "error" && event?.type !== "turn.failed") continue;
      const candidate = event.type === "turn.failed" ? event.error?.message : event.message;
      if (typeof candidate === "string") {
        const safe = redactor.text(candidate);
        reason = category(safe) ?? reason;
      }
    }
    reason ??= category(cleanErr) ?? category(message);
  }
  return `Codex edit probe failed (${result?.code ?? "setup"}): ${reason ?? "Codex failure details withheld; no verified edit"}`;
}
