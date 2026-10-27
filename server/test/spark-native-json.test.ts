import { afterEach, expect, it } from "bun:test";
import { z } from "zod";
import { nativeFormat, sparkChat } from "../src/spark";
import { sparkTestEnv } from "./budget-fixture";

const reply = z.object({ tool: z.enum(["read_file", "assign_job"]), path: z.string().max(200).optional(), picks: z.record(z.string(), z.string()).optional() }).strict();
const realFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = realFetch; });

it("sends the reply schema as a native response_format only behind SPARK_NATIVE_JSON", () => {
  expect(nativeFormat({}, reply)).toBeUndefined();
  const format = nativeFormat({ SPARK_NATIVE_JSON: "1" }, reply)!;
  expect(format).toMatchObject({ type: "json_schema", json_schema: { name: "reply", schema: { type: "object", required: ["tool"], additionalProperties: false } } });
  expect(JSON.stringify(format)).not.toContain("$schema");
  expect(JSON.stringify(format)).not.toContain("propertyNames");
  // Meta rejects recursive $refs: those stay prompt-only.
  type Tree = { kids: Tree[] };
  const tree: z.ZodType<Tree> = z.lazy(() => z.object({ kids: z.array(tree) }));
  expect(nativeFormat({ SPARK_NATIVE_JSON: "1" }, tree)).toBeUndefined();
});

it("puts response_format on the Chat Completions body when asked, and leaves it off otherwise", async () => {
  const bodies: Record<string, unknown>[] = [];
  globalThis.fetch = (async (_: unknown, init?: RequestInit) => { bodies.push(JSON.parse(String(init?.body))); return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ tool: "read_file" }) } }], usage: { total_tokens: 10 } })); }) as typeof fetch;
  const env = sparkTestEnv();
  await sparkChat(env, [{ role: "user", content: "hi" }], "low", nativeFormat({ SPARK_NATIVE_JSON: "1" }, reply));
  await sparkChat(env, [{ role: "user", content: "hi" }], "low");
  expect(bodies[0].response_format).toMatchObject({ type: "json_schema" });
  expect("response_format" in bodies[1]).toBe(false);
});
