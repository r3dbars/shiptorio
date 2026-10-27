import { expect, test } from "bun:test";
import { CODEX_EDIT_LIMITS, parseCodexEdits } from "../src/codex-edits";
const proposal = { summary: "Small fix", edits: [{ path: "src/a.ts", create: false, oldText: "answer = 1", newText: "answer = 2" }] };
const events = (value: unknown) => [JSON.stringify({ type: "item.completed", item: { type: "agent_message", text: JSON.stringify(value) } }), JSON.stringify({ type: "turn.completed" })].join("\n");
test("Codex accepts only a bounded completed final structured proposal", () => {
  expect(parseCodexEdits(events(proposal), ["src/a.ts"])).toEqual(proposal);
  for (const text of ["{}", events(proposal).split("\n")[0], events(proposal)+"\n{}", events(proposal)+"x", "x".repeat(CODEX_EDIT_LIMITS.transcriptBytes+1), events({ ...proposal, extra: true }), events({ ...proposal, edits: [] }), events({ ...proposal, summary: "x".repeat(501) })]) expect(() => parseCodexEdits(text, ["src/a.ts"])).toThrow();
});
test("Codex rejects tool attempts, failed turns, unsafe paths and malformed replacements", () => {
  for (const path of ["src/b.ts", "../a.ts", "/a.ts", "server/.dev.vars", "src//a.ts"]) expect(() => parseCodexEdits(events({ ...proposal, edits: [{ ...proposal.edits[0], path }] }), ["src/a.ts"])).toThrow();
  for (const changed of [{ oldText: "" }, { oldText: "answer = 2" }, { create: true }, { newText: "\0" }, { newText: "é".repeat(20000) }]) expect(() => parseCodexEdits(events({ ...proposal, edits: [{ ...proposal.edits[0], ...changed }] }), ["src/a.ts"])).toThrow();
  for (const type of ["file_change", "command_execution", "mcp_tool_call"]) expect(() => parseCodexEdits(JSON.stringify({type:"item.completed",item:{type}})+"\n"+events(proposal), ["src/a.ts"])).toThrow();
  expect(() => parseCodexEdits(JSON.stringify({type:"turn.failed"})+"\n"+events(proposal), ["src/a.ts"])).toThrow();
  // A valid earlier message cannot rescue a malformed final message.
  expect(() => parseCodexEdits(events(proposal).split("\n")[0]+"\n"+events("not edits"), ["src/a.ts"])).toThrow();
});

import { mkdtemp, mkdir, rm, symlink, link } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { applyCodexEdits, type CodexEdits } from "../src/codex-edits";
import { checkSandbox, type CheckSandbox } from "../src/sandbox";
import { nativeTest as osTest } from "./native-prerequisite";
async function fixture(run: (root: string, work: string, box: CheckSandbox) => Promise<void>, setup?: (root: string, work: string) => Promise<void>) {
  const root = await mkdtemp(join(tmpdir(), "shiptorio-codex-edit-")), work = join(root,"checkout");
  let box: CheckSandbox | undefined;
  const git = async (...args: string[]) => {const p=Bun.spawn(["git",...args],{cwd:work,stdout:"ignore",stderr:"pipe"});if(await p.exited)throw Error(await new Response(p.stderr).text());};
  try {
    await mkdir(join(work,"src"),{recursive:true});await Bun.write(join(work,"src/a.ts"),"export const answer = 1;\n// keep this unseen tail\n");
    await setup?.(root,work);
    await git("init");await git("add",".");await git("-c","user.name=Fixture","-c","user.email=fixture@example.invalid","commit","-m","base");
    box=await checkSandbox(work); await run(root,work,box);
  } finally {await box?.close();await rm(root,{recursive:true,force:true});}
}
osTest("trusted supervisor applies exact edits and explicit new tests in the real OS boundary", async () => {
  await fixture(async (_root,work,box) => {
    const edits: CodexEdits = {...proposal,edits:[...proposal.edits,{path:"new/test/a.test.ts",create:true,oldText:"",newText:"export const regression = true;\n"}]};
    expect(await applyCodexEdits(box,edits,["src/a.ts","new/test/a.test.ts"])).toEqual(["src/a.ts","new/test/a.test.ts"]);
    expect(await Bun.file(join(work,"src/a.ts")).text()).toBe("export const answer = 2;\n// keep this unseen tail\n");
    expect(await Bun.file(join(work,"new/test/a.test.ts")).text()).toBe("export const regression = true;\n");
  });
});
osTest("invalid replacements and source limits leave every proposed file untouched", async () => {
  for (const bad of [
    {path:"src/a.ts",create:false,oldText:"missing text",newText:"changed"},
    {path:"src/b.ts",create:false,oldText:"same",newText:"different"},
    {path:"src/b.ts",create:true,oldText:"",newText:"replace existing"},
    {path:"src/new.ts",create:false,oldText:"missing",newText:"new"},
    {path:"src/huge.ts",create:false,oldText:"xxx",newText:"y"},
  ]) await fixture(async (_root,work,box) => {
    await expect(applyCodexEdits(box,{...proposal,edits:[...proposal.edits,bad]},["src/a.ts","src/b.ts","src/new.ts","src/huge.ts"])).rejects.toThrow();
    expect(await Bun.file(join(work,"src/a.ts")).text()).toContain("answer = 1");
  },async(_root,work)=>{await Bun.write(join(work,"src/b.ts"),"same same");await Bun.write(join(work,"src/huge.ts"),"x".repeat(CODEX_EDIT_LIMITS.fileBytes+1));});
});
osTest("preexisting tracked or untracked edits cannot enter a structured Codex patch", async () => {
  for (const name of ["src/a.ts","unapproved.ts"]) await fixture(async (_root,work,box)=>{
    await Bun.write(join(work,name),"preexisting change");
    await expect(applyCodexEdits(box,proposal,["src/a.ts"])).rejects.toThrow("clean checkout");
    expect(await Bun.file(join(work,name)).text()).toBe("preexisting change");
  });
});
osTest("supervisor refuses symlink parents, symlink targets and hardlinked source", async () => {
  for (const kind of ["parent","target","hardlink"]) await fixture(async(root,work,box)=>{
    const path=kind==="parent"?"linked/canary.ts":"src/unsafe.ts";
    await expect(applyCodexEdits(box,{summary:"Unsafe link",edits:[{path,create:false,oldText:"canary",newText:"changed"}]},[path])).rejects.toThrow();
    expect(await Bun.file(join(root,"outside/canary.ts")).text()).toBe("canary");
  },async(root,work)=>{
    await mkdir(join(root,"outside"));await Bun.write(join(root,"outside/canary.ts"),"canary");
    if(kind==="parent")await symlink(join(root,"outside"),join(work,"linked"));
    else if(kind==="target")await symlink(join(root,"outside/canary.ts"),join(work,"src/unsafe.ts"));
    else await link(join(root,"outside/canary.ts"),join(work,"src/unsafe.ts"));
  });
});
