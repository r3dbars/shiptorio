import { z } from "zod";
import { DATA_POLICY, untrustedData, validatePlan, pathAllowed } from "../../server/src/injection-policy";

export const CODEX_EDIT_LIMITS = { transcriptBytes: 512000, events: 1000, replyBytes: 128000, edits: 20, textBytes: 32000, fileBytes: 256000 } as const;
const edit = z.object({ path: z.string().min(1).max(200), create: z.boolean(), oldText: z.string().max(CODEX_EDIT_LIMITS.textBytes), newText: z.string().max(CODEX_EDIT_LIMITS.textBytes) }).strict();
const response = z.object({ summary: z.string().min(1).max(500), edits: z.array(edit).min(1).max(CODEX_EDIT_LIMITS.edits) }).strict();
export type CodexEdits = z.infer<typeof response>;
export const CODEX_EDIT_SCHEMA = z.toJSONSchema(response);

export function codexEditPrompt(job: { plan: string; allowedPaths: string[] }, files: { path: string; content: string }[]): string {
  validatePlan(job.plan, job.allowedPaths);
  if (files.some(f => !job.allowedPaths.includes(f.path))) throw Error("Unapproved assembler context");
  return `${DATA_POLICY}\nReturn ONLY JSON matching the supplied schema. Do not call ANY tools, read or write files, run commands, access credentials, change settings, invoke agents, commit or publish. The supervisor supplies source evidence below and applies your proposal after you exit. Make the smallest fix and regression test within these exact approved paths: ${JSON.stringify(job.allowedPaths)}. Each edit replaces one unique nonempty exact oldText with newText; use enough surrounding text to match exactly once. Multiple edits to one file run in order. Do not return whole-file replacements for existing files. For a new file only, set create=true and oldText=""; newText is its complete content. For existing files set create=false. No deletion or rename. Source excerpts may be truncated: preserve everything outside each exact replacement.\n${untrustedData(job.plan, 17000)}\n${untrustedData(JSON.stringify(files), 64000)}`;
}

/** Parse the completed final message, never scrape JSON from reasoning/tool output. */
export function parseCodexEdits(transcript: string, allowed: string[]): CodexEdits {
  if (Buffer.byteLength(transcript) > CODEX_EDIT_LIMITS.transcriptBytes) throw Error("Codex transcript exceeds limit");
  const lines = transcript.trim().split("\n");
  if (lines.length > CODEX_EDIT_LIMITS.events) throw Error("Too many Codex events");
  let final: string | undefined, completed = false;
  for (const line of lines) {
    let event: any;
    try { event = JSON.parse(line); } catch { throw Error("Malformed Codex event"); }
    if (!event || typeof event !== "object" || typeof event.type !== "string" || completed) throw Error("Invalid Codex event sequence");
    if (event.type === "error" || event.type === "turn.failed") throw Error("Codex turn failed");
    if (event.item && !["agent_message", "reasoning"].includes(event.item.type)) throw Error("Codex attempted a tool instead of returning edits");
    if (event.type === "item.completed" && event.item?.type === "agent_message") {
      if (typeof event.item.text !== "string") throw Error("Missing Codex message");
      final = event.item.text;
    }
    if (event.type === "turn.completed") completed = true;
  }
  if (!completed || !final || Buffer.byteLength(final) > CODEX_EDIT_LIMITS.replyBytes) throw Error("Missing or oversized completed Codex response");
  let value: unknown;
  try { value = JSON.parse(final); } catch { throw Error("Codex final message is not JSON"); }
  const parsed = response.parse(value);
  for (const e of parsed.edits) {
    if (!allowed.includes(e.path) || !pathAllowed(e.path)) throw Error("Codex edit outside approved scope");
    if (Buffer.byteLength(e.oldText) > CODEX_EDIT_LIMITS.textBytes || Buffer.byteLength(e.newText) > CODEX_EDIT_LIMITS.textBytes || e.oldText.includes("\0") || e.newText.includes("\0")) throw Error("Invalid Codex edit text");
    if (e.create ? e.oldText !== "" || e.newText === "" : !e.oldText || e.oldText === e.newText) throw Error("Invalid Codex replacement");
  }
  return parsed;
}
