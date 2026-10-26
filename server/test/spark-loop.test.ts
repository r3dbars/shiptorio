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

test("assignment narrows reference files to explicit edit paths and refuses missing or expanded scope", async () => {
  const original = globalThis.fetch;
  const candidates = ["server/src/factory.ts", "server/test/factory.test.ts", "shared/src/protocol.ts"];
  const run = async (files: unknown) => {
    let call = 0;
    globalThis.fetch = (async () => Response.json({ choices: [{ message: { content: JSON.stringify(++call === 1 ? { tool: "read_issue", reason: "Understand goal persistence" } : call === 2 ? { tool: "read_file", path: "shared/src/protocol.ts", reason: "Confirm existing protocol without editing it" } : { tool: "assign_job", reason: "Schema already supports goals", plan: "Persist the existing goal without changing schemas.", acceptance: ["Survives reload"], files }) } }] })) as unknown as typeof fetch;
    return planLocalTask({ META_API_KEY: "test" }, { title: "Persist goal", body: "No schema changes", district: "server" }, candidates, async () => "existing schema", async () => {});
  };
  try {
    const assignment = await run(candidates.slice(0, 2));
    expect(assignment.files).toEqual(candidates.slice(0, 2));
    expect(assignment.plan).toContain("without changing schemas");
    for (const invalid of [undefined, [], ["server/.dev.vars"], ["server/src/factory.ts", "unapproved.ts"]]) await expect(run(invalid)).rejects.toThrow("explicit writable subset");
  } finally { globalThis.fetch = original; }
});
