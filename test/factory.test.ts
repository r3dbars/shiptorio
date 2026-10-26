import { describe, expect, it } from "vitest";
import { applyCommand, emptyFactory, ingestIssue, patch } from "../server/factory";
import { ServerToWebSchema, type Machine } from "@shiptorio/shared";
const repo = "r3dbars/shiptorio";
const machine = (id: string): Machine => ({id,kind:"assembler",position:{x:0,y:0},harness:"codex",powerSource:"solar",modules:[]});
describe("factory state", () => {
  it("persists build actions as versioned, protocol-compatible patches without mutating snapshots", () => {
    const initial=emptyFactory(repo);
    const next=applyCommand(initial,{type:"place_machine",machine:machine("a")});
    expect(initial.machines).toHaveLength(0);
    expect(next.revision).toBe(1);
    expect(ServerToWebSchema.parse(patch(initial,next)).type).toBe("patch");
  });
  it("validates belt endpoints and removes attached belts with a machine", () => {
    let state=applyCommand(emptyFactory(repo),{type:"place_machine",machine:machine("a")});
    expect(()=>applyCommand(state,{type:"connect_belt",belt:{id:"b",from:"a",to:"missing"}})).toThrow("Unknown belt endpoint");
    state=applyCommand(state,{type:"place_machine",machine:machine("z")});
    state=applyCommand(state,{type:"connect_belt",belt:{id:"b",from:"a",to:"z"}});
    expect(applyCommand(state,{type:"remove_machine",machineId:"a"}).belts).toEqual([]);
  });
  it("deduplicates replayed GitHub issue deliveries", () => {
    const state=ingestIssue(emptyFactory(repo),{number:12,title:"Checkout fails"});
    expect(state.items[0].state).toBe("ore");
    expect(ingestIssue(state,{number:12,title:"Checkout fails"})).toBe(state);
    expect(ServerToWebSchema.safeParse({type:"snapshot",version:1,factory:state}).success).toBe(true);
  });
  it("rejects duplicate machines, duplicate modules and unknown machines", () => {
    const state=applyCommand(emptyFactory(repo),{type:"place_machine",machine:machine("a")});
    expect(()=>applyCommand(state,{type:"place_machine",machine:machine("a")})).toThrow("already exists");
    expect(()=>applyCommand(state,{type:"set_module",machineId:"a",modules:["x","x"]})).toThrow("Duplicate modules");
    expect(()=>applyCommand(state,{type:"remove_machine",machineId:"missing"})).toThrow("Unknown machine");
  });
  it("cannot launch a rocket or pretend to open a PR before runner integration", () => {
    const state=ingestIssue(emptyFactory(repo),{number:1,title:"A bug"});
    expect(()=>applyCommand(state,{type:"launch_pr",itemId:"issue-1"})).toThrow("runner integration");
    expect(state.items[0].state).toBe("ore");
  });
});
