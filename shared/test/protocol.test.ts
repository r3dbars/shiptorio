import { describe, expect, it } from "vitest";
import { FactorySchema, RunnerToServerSchema, ServerToRunnerSchema, ServerToWebSchema, WebToServerSchema } from "../src/protocol";

describe("factory wire contract", () => {
  const factory = { repo: "r3dbars/shiptorio", revision: 0, machines: [], items: [], belts: [] };
  it("round trips the simulator's initial snapshot", () => {
    const msg = { type: "snapshot", version: 1, factory };
    expect(ServerToWebSchema.parse(JSON.parse(JSON.stringify(msg)))).toEqual(msg);
  });
  it("rejects unsupported protocol versions and credentials in browser payloads", () => {
    expect(ServerToWebSchema.safeParse({ type: "snapshot", version: 2, factory }).success).toBe(false);
    expect(ServerToWebSchema.safeParse({ type: "snapshot", version: 1, factory, token: "secret" }).success).toBe(false);
  });
  it("rejects malformed identities, states and nonfinite coordinates", () => {
    expect(FactorySchema.safeParse({ ...factory, repo: "../escape" }).success).toBe(false);
    expect(FactorySchema.safeParse({ ...factory, items: [{ state: "done" }] }).success).toBe(false);
    expect(WebToServerSchema.safeParse({type:"place_machine",machine:{id:"a",kind:"assembler",position:{x:Infinity,y:0},harness:"codex",powerSource:"solar",modules:[]}}).success).toBe(false);
  });
  it("keeps tokens in runner assignments and forbids a successful job targeting main", () => {
    expect(ServerToRunnerSchema.parse({ type:"job_assign",jobId:"job-1",repo:factory.repo,baseSha:"a".repeat(40),token:"runner-only",harness:"codex",task:"Fix the bug" }).token).toBe("runner-only");
    expect(RunnerToServerSchema.safeParse({ type:"job_done",jobId:"job-1",result:{status:"passed",branch:"main",headSha:"a".repeat(40)} }).success).toBe(false);
    expect(RunnerToServerSchema.safeParse({ type:"job_done",jobId:"job-1",result:{status:"passed",branch:"shiptorio/job-1",headSha:"a".repeat(40)} }).success).toBe(true);
  });
  it("accepts failure events and collection replacement patches", () => {
    expect(RunnerToServerSchema.parse({type:"job_done",jobId:"job-1",result:{status:"failed",failure:"Tests failed"}}).type).toBe("job_done");
    expect(ServerToWebSchema.parse({type:"patch",version:1,repo:factory.repo,baseRevision:0,revision:1,changes:{items:[]}}).type).toBe("patch");
  });
});
