import { CODEX_EDIT_LIMITS, CODEX_EDIT_SCHEMA, codexEditPrompt, checkEditProposal, type CodexEdits } from "./codex-edits";

// Muse Code (Meta, `muse exec --json`) has no output-schema flag, so the schema travels in the prompt and the
// supervisor enforces it after exit. Same contract as Codex: no tools, one JSON proposal, the runner writes.
export function museEditPrompt(job: { plan: string; allowedPaths: string[] }, files: { path: string; content: string }[]): string {
  return `${codexEditPrompt(job, files)}\nThe JSON schema for your reply: ${JSON.stringify(CODEX_EDIT_SCHEMA)}`;
}

/** Envelope stream: one JSON object per stdout line, typed by payload_type. Any tool intent fails the run. */
export function parseMuseEdits(transcript: string, allowed: string[]): CodexEdits {
  if (Buffer.byteLength(transcript) > CODEX_EDIT_LIMITS.transcriptBytes) throw Error("Muse Code transcript exceeds limit");
  const lines = transcript.trim().split("\n").filter(line => line.trim());
  if (lines.length > CODEX_EDIT_LIMITS.events * 4) throw Error("Too many Muse Code events");
  let deltas = "", terminal: { terminal?: unknown; text?: unknown } | undefined;
  for (const line of lines) {
    let event: any;
    try { event = JSON.parse(line); } catch { throw Error("Malformed Muse Code event"); }
    if (!event || typeof event !== "object" || typeof event.payload_type !== "string") throw Error("Invalid Muse Code event");
    const type: string = event.payload_type, payload = event.payload ?? {};
    if (type === "approval_wait.effect.started") throw Error("Muse Code asked for a tool approval instead of returning edits");
    if (type === "task.lifecycle.side_effect_intent" && String(payload.event?.operation ?? "").startsWith("tool:")) throw Error("Muse Code attempted a tool instead of returning edits");
    if (type === "tool.result") throw Error("Muse Code attempted a tool instead of returning edits");
    if (type === "run.output.delta" && typeof payload.text === "string") deltas += payload.text;
    if (type.startsWith("run.terminal.")) terminal = payload;
  }
  if (terminal?.terminal !== "completed") throw Error("Muse Code turn did not complete");
  const final = (deltas.trim() || (typeof terminal.text === "string" ? terminal.text : "")).trim();
  if (!final || Buffer.byteLength(final) > CODEX_EDIT_LIMITS.replyBytes) throw Error("Missing or oversized Muse Code response");
  // Without schema enforcement a model may wrap its JSON in one code fence; nothing else is tolerated.
  const fenced = /^```(?:json)?\s*\n([\s\S]*?)\n```$/.exec(final);
  let value: unknown;
  try { value = JSON.parse(fenced ? fenced[1] : final); } catch { throw Error("Muse Code final message is not JSON"); }
  return checkEditProposal(value, allowed);
}
