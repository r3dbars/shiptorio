import { describe, expect, it } from "bun:test";
import { attentionOf, continueOption, type Item, type Move } from "../src";

const card = (id: string, tools: string[], over: Partial<Move> = {}): Move => ({
  id, title: id, why: "", createdAt: 0,
  options: [{ id: "yes", label: "Yes", recommended: true, actions: tools.map((tool) => ({ tool, args: {}, reason: "" })) }, { id: "later", label: "Later", recommended: false, actions: [] }],
  ...over,
});
const rework = (canRework: boolean): Move => ({
  id: "rw", title: "CI sent #4 back", why: "", createdAt: 0, kind: "review",
  options: [
    ...(canRework ? [{ id: "rework-codex", label: "Send back", recommended: true, actions: [{ tool: "plan_runner_job", args: {}, reason: "" }] }] : []),
    { id: "later", label: "Look later", recommended: !canRework, actions: [] },
    { id: "overrule", label: "Overrule", recommended: false, actions: [{ tool: "request_merge", args: {}, reason: "" }] },
  ],
});
const scarred = (n: number) => ({ scars: Array.from({ length: n }, () => ({ station: "ci" })) }) as unknown as Item;

describe("attention kinds (docs/ATTENTION.md)", () => {
  it("parked work with an obvious answer is approve", () => {
    for (const tool of ["plan_runner_job", "approve_runner_job", "request_merge", "run_missing_check", "review_customer_reply"]) expect(attentionOf(card("c", [tool]))).toBe("approve");
    expect(attentionOf(card("c", [], { kind: "ship" }))).toBe("approve");
  });
  it("a stuck line is steer", () => {
    for (const id of ["stuck:i1:5", "reliability:merge", "failed:abc", "bottleneck:ci-1"]) expect(attentionOf(card(id, []))).toBe("steer");
    expect(attentionOf(card("plug", ["connect_source"], { stage: "resources" }))).toBe("steer");
  });
  it("the first rework is a yes, the second (or no way to rework) is a call", () => {
    expect(attentionOf(rework(true), scarred(1))).toBe("approve");
    expect(attentionOf(rework(true), scarred(2))).toBe("steer");
    expect(attentionOf(rework(false), scarred(1))).toBe("steer");
  });
  it("ideas are suggested, and never anything louder", () => {
    for (const tool of ["research", "set_autonomy", "file_support_issue", "connect_source"]) expect(attentionOf(card("c", [tool]))).toBe("suggest");
  });
  it("a server-set kind wins", () => {
    expect(attentionOf(card("stuck:x", [], { attention: "suggest" }))).toBe("suggest");
  });
  it("Continue runs the suggested option", () => {
    expect(continueOption(card("c", ["research"])).id).toBe("yes");
    expect(continueOption(rework(false)).id).toBe("later");
  });
});
