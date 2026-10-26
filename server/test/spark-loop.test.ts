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
    expect(calls).toBe(7); // five turns plus two free repeat reminders
    action = { tool: "ask_player", reason: "Need clarification" };
    await expect(run()).rejects.toThrow("player input");
  } finally { globalThis.fetch = original; }
});

test("a repeated read doesn't spend a planning turn or show up as a step", async () => {
  const original = globalThis.fetch;
  const script = [
    { tool: "read_issue", reason: "read it" },
    { tool: "read_issue", reason: "read it again" },
    { tool: "read_issue", reason: "and again" },
    { tool: "read_file", path: "web/src/a.ts", reason: "a" },
    { tool: "read_file", path: "web/src/b.ts", reason: "b" },
    { tool: "read_file", path: "web/src/c.ts", reason: "c" },
    { tool: "assign_job", reason: "ready", plan: "Fix all three", acceptance: ["works"] },
  ];
  const payloads: string[] = [];
  globalThis.fetch = (async (_: unknown, init: { body: string }) => {
    payloads.push(JSON.parse(init.body).messages[1].content);
    return Response.json({ choices: [{ message: { content: JSON.stringify(script[payloads.length - 1]) } }] });
  }) as unknown as typeof fetch;
  const steps: string[] = [];
  try {
    const plan = await planLocalTask({ META_API_KEY: "test" }, { title: "Issue", body: "Evidence", district: "web" }, ["web/src/a.ts", "web/src/b.ts", "web/src/c.ts"], async () => "code", async s => { steps.push(s.tool); });
    expect(plan).toContain("Fix all three");
    expect(steps).toEqual(["read_issue", "read_file", "read_file", "read_file", "assign_job"]);
    expect(JSON.parse(payloads[1]).alreadyRead).toEqual(["issue"]);
  } finally { globalThis.fetch = original; }
});
