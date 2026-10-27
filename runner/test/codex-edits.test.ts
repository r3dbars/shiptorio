import { expect, test } from "bun:test";
import { CODEX_EDIT_LIMITS, parseCodexEdits } from "../src/codex-edits";
const proposal = { summary: "Small fix", edits: [{ path: "src/a.ts", create: false, oldText: "answer = 1", newText: "answer = 2" }] };
const events = (value: unknown) => [JSON.stringify({ type: "item.completed", item: { type: "agent_message", text: JSON.stringify(value) } }), JSON.stringify({ type: "turn.completed" })].join("\n");
test("Codex accepts only a bounded completed final structured proposal", () => {
  expect(parseCodexEdits(events(proposal), ["src/a.ts"])).toEqual(proposal);
  for (const text of ["{}", events(proposal).split("\n")[0], events(proposal)+"\n{}", events(proposal)+"x", "x".repeat(CODEX_EDIT_LIMITS.transcriptBytes+1), events({ ...proposal, extra: true }), events({ ...proposal, edits: [] }), events({ ...proposal, summary: "x".repeat(501) })]) expect(() => parseCodexEdits(text, ["src/a.ts"])).toThrow();
});
test("Codex rejects tool attempts, failed turns, unsafe paths and malformed replacements", () => {
  for (const path of ["src/b.ts", "../a.ts", "/a.ts", "server/.dev.vars", "src//a.ts"]) expect(() => parseCodexEdits(events({ ...proposal, edits: [{ ...proposal.edits[0], path }] }), ["src/a.ts"])).toThrow();
  for (const changed of [{ oldText: "" }, { oldText: "answer = 2" }, { create: true }, { newText: "\0" }, { newText: "é".repeat(20000) }]) expect(() => parseCodexEdits(events({ ...proposal, edits: [{ ...proposal.edits[0], ...changed }] }), ["src/a.ts"])).toThrow();
  for (const type of ["file_change", "command_execution", "mcp_tool_call"]) expect(() => parseCodexEdits(JSON.stringify({type:"item.completed",item:{type}})+"\n"+events(proposal), ["src/a.ts"])).toThrow();
  expect(() => parseCodexEdits(JSON.stringify({type:"turn.failed"})+"\n"+events(proposal), ["src/a.ts"])).toThrow();
  // A valid earlier message cannot rescue a malformed final message.
  expect(() => parseCodexEdits(events(proposal).split("\n")[0]+"\n"+events("not edits"), ["src/a.ts"])).toThrow();
});
