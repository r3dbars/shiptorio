import { expect, test } from "bun:test";
import { Redactor } from "../../server/src/redact";
import { codexDoctorFailure } from "../src/codex-diagnostic";
const result = (out: string, err = "Reading additional input from stdin...") => ({ code: 1, out, err });

test("doctor surfaces failed JSONL turn/error categories instead of a harmless stderr notice", () => {
  for (const event of [
    { type: "error", message: "Your credentials expired. Please sign in again." },
    { type: "turn.failed", error: { message: "refresh_token_reused" } },
  ]) {
    const diagnostic = codexDoctorFailure(result(JSON.stringify(event)), new Error("provider failed"));
    expect(diagnostic).toContain("authentication or authorization rejected");
    expect(diagnostic).not.toContain("Reading additional input");
    expect(diagnostic).not.toContain(JSON.stringify(event));
  }
});

test("a successful process failing filesystem proof stays failed and never prints agent_message", () => {
  const out = JSON.stringify({ type: "item.completed", item: { type: "agent_message", text: "PRIVATE PROMPT ECHO: usage limit reached" } });
  const diagnostic = codexDoctorFailure({ code: 0, out, err: "" }, new Error("Agent did not produce the required file edit"));
  expect(diagnostic).toContain("without the required verified file edit");
  expect(diagnostic).not.toContain("PRIVATE PROMPT"); expect(diagnostic).not.toContain("usage or rate limit");
});

test("known secret values are redacted whole before classification or output bounds", () => {
  const secret = "refresh_token_reused" + "x".repeat(4000);
  const redactor = new Redactor({ api_key: secret });
  const diagnostic = codexDoctorFailure(result(JSON.stringify({ type: "error", message: secret })), new Error("provider failed"), redactor);
  expect(diagnostic).toContain("details withheld");
  expect(diagnostic).not.toContain("authentication or authorization");
  expect(diagnostic).not.toContain(secret.slice(0, 100));
});

test("provider text, credentials, URLs and arbitrary errors are never diagnostic output", () => {
  const privateMessage = "Unknown private prompt and source contents; password=synthetic-private-value https://example.invalid/?token=synthetic-private-value";
  const diagnostic = codexDoctorFailure(result(JSON.stringify({ type: "error", message: privateMessage })), new Error("provider failed"));
  expect(diagnostic).toContain("details withheld");
  for (const text of ["private prompt", "synthetic-private-value", "https://", "source contents"]) expect(diagnostic).not.toContain(text);
});

test("fixed diagnostics distinguish quota, HTTP, configuration, schema, permission and network failures", () => {
  for (const [message, expected] of [
    ["Usage limit reached", "usage or rate limit"], ["HTTP status 503", "HTTP 503"],
    ["unexpected argument --unsupported", "configuration or arguments"], ["invalid response_format schema", "response schema"],
    ["Operation not permitted", "sandbox or OS permission"], ["ECONNRESET", "provider connection"],
  ]) expect(codexDoctorFailure(result(JSON.stringify({ type: "turn.failed", error: { message } })), new Error("provider failed"))).toContain(expected);
});

test("malformed, excessive and successful JSONL do not expose transcript contents", () => {
  for (const out of ["not JSON PRIVATE", JSON.stringify({ type: "item.completed", item: { type: "agent_message", text: "refresh_token_reused PRIVATE" } }), "PRIVATE".repeat(100000), "{}\n".repeat(1001)]) {
    const diagnostic = codexDoctorFailure(result(out), new Error("provider failed"));
    expect(diagnostic).not.toContain("PRIVATE"); expect(diagnostic).not.toContain("authentication or authorization");
  }
  expect(codexDoctorFailure({ code: 1, out: "", err: "", timedOut: true }, Error("provider failed"))).toContain("timed out");
});
