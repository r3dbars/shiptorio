import { afterEach, expect, test } from "bun:test";
import { sparkChat } from "../src/spark";
import { sparkTestEnv } from "./budget-fixture";
import { budgetUsage } from "../src/budget";
const original = globalThis.fetch;
afterEach(() => { globalThis.fetch = original; });
const message = [{ role: "user" as const, content: "Review README at revision one" }];
function provider() {
  let calls = 0, release!: () => void, started!: () => void;
  const ready = new Promise<void>(resolve => { started = resolve; });
  const gate = new Promise<void>(resolve => { release = resolve; });
  globalThis.fetch = (async () => { calls++; started(); await gate; return Response.json({ choices: [{ message: { content: "same decision" } }], usage: { total_tokens: 100 } }); }) as unknown as typeof fetch;
  return { release, ready, calls: () => calls };
}
test("identical concurrent decisions share one paid call; later state is evaluated again", async () => {
  const env = sparkTestEnv(), p = provider();
  const first = sparkChat(env, message), duplicate = sparkChat(env, message);
  p.release();
  expect(await Promise.all([first, duplicate])).toEqual(["same decision", "same decision"]);
  expect(p.calls()).toBe(1);
  expect((await budgetUsage(env, "owner")).calls).toBe(1);
  await sparkChat(env, message);
  expect(p.calls()).toBe(2);
});
test("different evidence, run environments and reasoning do not share decisions", async () => {
  const env = sparkTestEnv(), other = sparkTestEnv(), p = provider();
  const runs = [sparkChat(env, message), sparkChat(env, [{role:"user",content:"revision two"}]), sparkChat(env,message,"high"), sparkChat(other,message)];
  p.release(); await Promise.all(runs);
  expect(p.calls()).toBe(4);
});
test("failed decisions are not cached and a kill switch still blocks duplicates", async () => {
  const env = { ...sparkTestEnv(), SPARK_DISABLED: "0" }; let calls = 0;
  globalThis.fetch = (async () => { calls++; return new Response(null,{status:429}); }) as unknown as typeof fetch;
  await expect(sparkChat(env,message)).rejects.toThrow("rate limit");
  await expect(sparkChat(env,message)).rejects.toThrow("rate limit");
  expect(calls).toBe(2);
  env.SPARK_DISABLED="1";
  await expect(sparkChat(env,message)).rejects.toThrow("kill switch");
  expect(calls).toBe(2);
});

test("duplicate issue-to-review notifications keep the same plan and verdict with half the fixture spend", async () => {
  const { triage } = await import("../src/spark");
  const { planLocalTask, reviewWithTools } = await import("../src/spark-tools");
  async function run(shared: boolean) {
    const env = sparkTestEnv(), counts = { triage: 0, plan: 0, review: 0 };
    let stage: keyof typeof counts = "triage";
    globalThis.fetch = (async (_url: unknown, init?: RequestInit) => {
      counts[stage]++;
      const body = JSON.parse(String(init?.body));
      const wrapped = body.messages.find((m: {role:string}) => m.role === "user").content;
      const data = JSON.parse(JSON.parse(wrapped.split("\n")[1]));
      const read = data.observations?.some((o: {tool:string}) => o.tool === "read_file");
      const reply = stage === "triage" ? {kind:"cleanup",district:"/",reason:"README clarification"}
        : !read ? {tool:"read_file",path:"README.md",reason:"Inspect the README"}
        : stage === "plan" ? {tool:"assign_job",reason:"Clarify the README",plan:"Clarify the checks paragraph.",acceptance:["Read the updated paragraph"],files:["README.md"],heeded:[]}
        : {tool:"verdict",verdict:"pass",reason:"The README matches the change.",findings:[]};
      // Yield so both duplicate observers reach the same in-flight request.
      await new Promise(resolve => setTimeout(resolve, 1));
      return Response.json({choices:[{message:{content:JSON.stringify(reply)}}],usage:{total_tokens:100}});
    }) as unknown as typeof fetch;
    const copies = () => shared ? [env,env] : [{...env,planningSignal:new AbortController().signal},{...env,planningSignal:new AbortController().signal}];
    const issue = {title:"Clarify README checks",body:"Explain the existing checks.",labels:[]};
    const classified = await Promise.all(copies().map(e => triage(e,issue,["/"])));
    stage="plan";
    const planned = await Promise.all(copies().map(e => planLocalTask(e,{...issue,district:"/"},["README.md"],async()=>"# README\nChecks",async()=>{})));
    stage="review";
    const reviewed = await Promise.all(copies().map(e => reviewWithTools(e,{...issue,builder:"codex"},"+Clarified checks",{paths:["README.md"],read:async()=>"# README\nChecks"})));
    return {counts, classified, planned, verdicts:reviewed.map(r=>({verdict:r.verdict,reason:r.reason,findings:r.findings})), usage:await budgetUsage(env,"owner")};
  }
  const before=await run(false), after=await run(true);
  expect(after.classified).toEqual(before.classified);
  expect(after.planned).toEqual(before.planned);
  expect(after.verdicts).toEqual(before.verdicts);
  expect(before.counts).toEqual({triage:2,plan:4,review:4});
  expect(after.counts).toEqual({triage:1,plan:2,review:2});
  expect([before.usage.calls,after.usage.calls]).toEqual([10,5]);
  expect([before.usage.tokens,after.usage.tokens]).toEqual([1000,500]);
});


test("a transient account lookup retries before any paid request", async () => {
  const env = sparkTestEnv(); let lookups = 0, calls = 0;
  env.budgetAccount = async () => { if (++lookups === 1) throw new Error("Temporary account lookup failure"); return "owner"; };
  globalThis.fetch = (async () => { calls++; return Response.json({ choices: [{ message: { content: "decision" } }], usage: {total_tokens: 100} }); }) as unknown as typeof fetch;
  expect(await sparkChat(env, message)).toBe("decision");
  expect(lookups).toBe(2);
  expect(calls).toBe(1);
  expect((await budgetUsage(env,"owner")).calls).toBe(1);
});


test("fresh factory env wrappers share only an identical account and cancellation lifetime", async () => {
  const env = sparkTestEnv(), p = provider();
  const first = sparkChat(env,message);
  const duplicate = sparkChat({...env,budgetAccount: async()=>"owner"},message);
  const otherAccount = sparkChat({...env,budgetAccount:async()=>"other"},message);
  const otherSignal = sparkChat({...env,planningSignal:new AbortController().signal},message);
  p.release();
  await Promise.all([first,duplicate,otherAccount,otherSignal]);
  expect(p.calls()).toBe(3);
});


test("a newly paused factory or zero budget cannot join an in-flight decision", async () => {
  const env = sparkTestEnv(), p = provider();
  const first=sparkChat(env,message);
  await p.ready;
  await env.DB.prepare("INSERT INTO admin_controls(scope,paused) VALUES('*',1)").run();
  await expect(sparkChat({...env},message)).rejects.toThrow("paused");
  await env.DB.prepare("DELETE FROM admin_controls").run();
  await expect(sparkChat({...env,SPARK_DAILY_CALLS:'0'},message)).rejects.toThrow("exhausted");
  p.release(); await first;
  expect(p.calls()).toBe(1);
});
