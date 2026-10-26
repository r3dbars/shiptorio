import { expect, test } from "bun:test";
import { planLocalTask } from "../src/spark";
test("foreman rejects unapproved tools/paths and premature assignment, and stops after five turns", async () => {
  const original = globalThis.fetch;
  let calls = 0;
  let action: unknown;
  globalThis.fetch = (async () => { calls++; return Response.json({ choices: [{ message: { content: JSON.stringify(action) } }] }); }) as unknown as typeof fetch;
  const run = () => planLocalTask({ META_API_KEY: "test" }, { title: "Issue", body: "Evidence", district: "server" }, ["server/src/engine.ts"], async () => "code", async () => {});
  try {
    for (const invalid of [{ tool: "run_shell", reason: "do it" }, { tool: "read_file", path: "server/.dev.vars", reason: "read secrets" }, { tool: "assign_job", reason: "skip inspection", plan: "fix", acceptance: ["works"] }]) {
      action = invalid;
      await expect(run()).rejects.toThrow("unavailable or unapproved");
    }
    calls = 0; action = { tool: "read_issue", reason: "keep reading" };
    await expect(run()).rejects.toThrow("five-turn");
    expect(calls).toBe(5);
    action = { tool: "ask_player", reason: "Need clarification" };
    await expect(run()).rejects.toThrow("player input");
  } finally { globalThis.fetch = original; }
});
