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
  if (reason === "Codex authentication or authorization rejected") return "Codex needs you to sign in again.\nshiptorio-runner login codex";
  if (reason === "Codex usage or rate limit reached") return "Codex has reached its usage limit; try again after it resets.";
  const explanations: Record<string, string> = {
    "Codex edit probe timed out": "Codex did not finish the test change in time.",
    "Codex exited without the required verified file edit": "Codex finished without making the test change.",
    "Codex failed approved-scope verification": "Codex changed files outside the approved test.",
    "Codex diagnostics exceeded the safe output limit": "Codex returned too much diagnostic output.",
    "Codex diagnostics exceeded the safe event limit": "Codex returned too many diagnostic events.",
    "Codex rejected the working directory": "Codex could not open its work folder.",
    "Codex rejected the response schema": "Codex could not read the test instructions.",
    "Codex rejected its configuration or arguments": "Codex needs a configuration check.",
    "Codex model unavailable or unsupported": "The selected Codex model is unavailable.",
    "Codex sandbox or OS permission rejected": "Your computer blocked the Codex safety check.",
    "Codex provider connection failed": "Codex could not connect.",
  };
  return `${reason?.startsWith("Codex provider request failed") ? "Codex could not finish the request." : explanations[reason ?? ""] ?? "Codex could not verify the test change."}\nshiptorio-runner doctor --edit codex`;
}
