import { expect, test } from "bun:test";
import { fakeGitHub, normalizeGitHub } from "../src/sources/github";
import { foldSignal } from "../src/ore";
import { issueRevision } from "../src/runner-job";

const header = "🧠 **Shiptorio planned this** with Meta Muse Spark (`muse-spark-1.3`)\n\nA generated plan.";
const revision = (item: ReturnType<typeof foldSignal>) => issueRevision(item.title, JSON.stringify({ body: item.body ?? "", failure: item.failure ?? "", scars: item.scars ?? [] }));

test("own authenticated bot plan feedback is ignored without ignoring human lookalikes or other bot input", async () => {
  const payload = fakeGitHub();
  const item = foldSignal(undefined, normalizeGitHub(payload)[0]);
  const before = await revision(item);
  const own = { id: 42, body: header, user: { login: "shiptorio[bot]", type: "Bot" } };
  expect(normalizeGitHub({ ...payload, comment: own })).toEqual([]);
  expect(normalizeGitHub({ ...payload, comment: { ...own, body: header.replace("planned this**", "planned this rework**") } })).toEqual([]);
  for (const comment of [
    { ...own, user: { login: "r3dbars", type: "User" } },
    { ...own, user: { login: "another[bot]", type: "Bot" } },
    { ...own, user: { login: "shiptorio[bot]", type: "User" } },
    { ...own, body: "A substantive new failure needs investigation." },
  ]) {
    const signal = normalizeGitHub({ ...payload, comment })[0];
    expect(signal).toBeDefined();
    expect(await revision(foldSignal(item, signal))).not.toBe(before);
  }
  const edited = normalizeGitHub({ ...payload, issue: { ...payload.issue, body: "The real request changed", updated_at: "2026-10-26T21:00:00Z" } })[0];
  expect(await revision(foldSignal(item, edited))).not.toBe(before);
});
