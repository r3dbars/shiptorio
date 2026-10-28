import { expect, it, spyOn } from "bun:test";
import { pullRequestReadiness } from "../src/github";

const clean = { head: { sha: "head" }, base: { ref: "main" }, state: "open", merged: false, draft: false, mergeable: true, mergeable_state: "clean" };
it("only explicit clean open current-head/current-base PRs are eligible, with no cached response", async () => {
  const cases = [
    ...["behind", "blocked", "dirty", "draft", "has_hooks", "unknown", "unstable", "future", null, undefined].map(mergeable_state => ({ mergeable_state })),
    { mergeable: false }, { mergeable: null }, { mergeable: undefined },
    { state: "closed" }, { state: undefined }, { merged: true }, { draft: true }, { draft: undefined },
    { head: { sha: "new-head" } }, { base: { ref: "release" } }, { head: undefined }, { base: undefined },
  ];
  let response: unknown = clean;
  const fetcher = spyOn(globalThis, "fetch").mockImplementation((async (_url: unknown, init?: RequestInit) => {
    expect(new Headers(init?.headers).get("cache-control")).toBe("no-store");
    expect(new Headers(init?.headers).has("if-none-match")).toBe(false);
    return Response.json(response);
  }) as typeof fetch);
  try {
    expect((await pullRequestReadiness("readiness-token", "a/b", 1, "head", "main")).ready).toBe(true);
    for (const patch of cases) {
      response = { ...clean, ...patch };
      expect((await pullRequestReadiness("readiness-token", "a/b", 1, "head", "main")).ready).toBe(false);
    }
  } finally { fetcher.mockRestore(); }
});
it("access failure cannot fall back to a prior clean response", async () => {
  const fetcher = spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 403 }));
  try { await expect(pullRequestReadiness("readiness-token", "a/b", 1, "head", "main")).rejects.toThrow(); }
  finally { fetcher.mockRestore(); }
});
