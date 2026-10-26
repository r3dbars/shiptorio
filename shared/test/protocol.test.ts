import { describe, expect, it } from "bun:test";
import { FactoryState, RunnerToServer, ServerToRunner, ServerToWeb, WebToServer } from "../src/index";

const state = { repo: "r3dbars/shiptorio", baseBranch: "main", districts: [], machines: [], items: [], power: [], belts: [], science: { red: 0, green: 0, grey: 0, blue: 0 }, trust: 0.5, tick: 0 };
describe("shared simulator and live wire contract", () => {
  it("round trips an initial snapshot using the frontend's state payload", () => {
    const msg = { type: "snapshot", state };
    expect(ServerToWeb.parse(JSON.parse(JSON.stringify(msg)))).toEqual(msg);
  });
  it("strips undeclared credentials from browser snapshots", () => {
    const parsed = ServerToWeb.parse({type:"snapshot",state:{...state,token:"private"},token:"private"});
    expect(parsed).toEqual({type:"snapshot",state});
  });
  it("accepts upsert patches and explicit removals used by the live frontend", () => {
    const msg = {type:"patch",patch:{items:[],removed:[{kind:"machine",id:"a"}]}};
    expect(ServerToWeb.parse(msg)).toEqual(msg);
  });
  it("rejects unknown commands, invalid machine types and nonfinite coordinates", () => {
    expect(WebToServer.safeParse({type:"delete_everything"}).success).toBe(false);
    expect(WebToServer.safeParse({type:"place_machine",machineType:"unknown",x:0,y:0}).success).toBe(false);
    expect(WebToServer.safeParse({type:"place_machine",machineType:"assembler",x:Infinity,y:0}).success).toBe(false);
    expect(FactoryState.safeParse({...state,items:[{state:"done"}]}).success).toBe(false);
  });
  it("keeps job tokens on runner assignments and validates runner events", () => {
    const msg={type:"job_assign",jobId:"j1",repo:state.repo,baseSha:"a".repeat(40),token:"private",harness:"codex",task:{title:"Fix bug",body:"Details",district:"/"}};
    expect(ServerToRunner.parse(msg)).toEqual(msg);
    expect(RunnerToServer.parse({type:"job_done",jobId:"j1",ok:false,summary:"Tests failed"}).type).toBe("job_done");
    expect(RunnerToServer.safeParse({type:"hello",mode:"local",harnesses:["unknown"],powerSources:[]}).success).toBe(false);
  });
});

describe("check-in deck", () => {
  const card = { id: "m1", title: "Launch #41", why: "112 users", options: [{ id: "go", label: "Merge", recommended: true }], createdAt: 1, kind: "ship", focus: "gate-1", evidence: [{ station: "CI", ok: true }], locked: false };
  it("carries a ranked deck on the state and as its own message", () => {
    expect(FactoryState.parse({ ...state, deck: [card] }).deck?.[0].kind).toBe("ship");
    expect(ServerToWeb.parse({ type: "deck", deck: [card] }).type).toBe("deck");
    expect(ServerToWeb.safeParse({ type: "deck", deck: Array.from({ length: 13 }, (_, i) => ({ ...card, id: `m${i}` })) }).success).toBe(false);
  });
  it("accepts later and never swipes, and rejects an unknown never reason", () => {
    expect(WebToServer.parse({ type: "defer_move", moveId: "m1" }).type).toBe("defer_move");
    expect(WebToServer.parse({ type: "dismiss_move", moveId: "m1", why: "kind" }).type).toBe("dismiss_move");
    expect(WebToServer.safeParse({ type: "dismiss_move", moveId: "m1", why: "bored" }).success).toBe(false);
  });
});
