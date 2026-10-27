import { describe, expect, it, spyOn } from "bun:test";
import { inspectPullRequest, openIssues, openPullRequest } from "../src/github";

async function inspection(checks: unknown[], statuses: unknown[] = [], eventSha = "current", options: { required?: { context: string; app_id?: number }[]; rules?: unknown[]; policyStatus?: number; rulesStatus?: number; latestHead?: string; latestBase?: string; base?: string; expectedBase?: string } = {}) {
  let reads = 0;
  const fetcher = spyOn(globalThis, "fetch").mockImplementation((async (url: RequestInfo | URL) => {
    const path = String(url);
    if (path.includes("/protection/required_status_checks")) return options.policyStatus ? new Response("unavailable", { status: options.policyStatus }) : Response.json({ checks: options.required ?? [{ context: "test", app_id: 15368 }] });
    if (path.includes("/rules/branches/")) return options.rulesStatus ? new Response("unavailable", { status: options.rulesStatus }) : Response.json(options.rules ?? []);
    const value = path.includes("check-runs") ? { total_count: checks.length, check_runs: checks.map(c => ({ head_sha: "current", app: { id: 15368 }, ...c as object })) }
      : path.endsWith("/status?per_page=100") ? { total_count: statuses.length, statuses }
      : { state: "open", merged: false, head: { sha: ++reads > 1 ? options.latestHead ?? "current" : "current" }, base: { ref: reads > 1 ? options.latestBase ?? options.base ?? "main" : options.base ?? "main", sha: "base" } };
    return Response.json(value);
  }) as unknown as typeof fetch);
  try { return await inspectPullRequest("test-token", "a/b", 1, eventSha, options.expectedBase ?? "main"); } finally { fetcher.mockRestore(); }
}

describe("current-commit inspection", () => {
  it("paginates issue backfill, excludes PRs and caps it at fifty issues", async () => {
    const pages: number[] = [];
    const fetcher = spyOn(globalThis, "fetch").mockImplementation((async (url: RequestInfo | URL) => {
      const request = new URL(String(url));
      // Other factory fixtures may still be finishing background requests. Count only this backfill.
      if (request.pathname !== "/repos/example/demo/issues") return new Response(null, { status: 404 });
      const page = Number(request.searchParams.get("page"));
      pages.push(page);
      return Response.json(Array.from({ length: 25 }, (_, index) => ({ number: (page - 1) * 25 + index, ...(index === 0 ? { pull_request: {} } : {}) })));
    }) as unknown as typeof fetch);
    try {
      const issues = await openIssues(`inspection-${crypto.randomUUID()}`, "example/demo");
      expect(issues).toHaveLength(50);
      expect(issues.some((issue) => issue.pull_request)).toBe(false);
      expect(pages).toEqual([1, 2, 3]);
    } finally { fetcher.mockRestore(); }
  });
  it("cannot pass on stale, absent, skipped-only, or partially completed checks", async () => {
    expect((await inspection([{ name: "CI", status: "completed", conclusion: "success" }], [], "old")).state).toBe("pending");
    expect((await inspection([])).state).toBe("pending");
    expect((await inspection([{ name: "CI", status: "completed", conclusion: "skipped" }])).state).toBe("pending");
    expect((await inspection([{ name: "test", status: "completed", conclusion: "success" }, { name: "types", status: "in_progress" }])).state).toBe("pending");
  });
  it("attaches actual check failure context for Spark's next attempt", async () => {
    const result = await inspection([{ name: "test", status: "completed", conclusion: "failure", output: { summary: "Expected checkout total 42, got 0" } }]);
    expect(result.state).toBe("failed");
    expect(result.summary).toContain("Expected checkout total 42");
  });
  it("requires all reported checks and legacy statuses to succeed", async () => {
    expect((await inspection([{ name: "test", status: "completed", conclusion: "success" }])).state).toBe("passed");
    expect((await inspection([{ name: "test", status: "completed", conclusion: "success" }], [{ context: "deploy", state: "pending" }])).state).toBe("pending");
  });
  it("requires configured classic checks from the configured app, not same-name impostors or statuses", async () => {
    const good = { name: "test", status: "completed", conclusion: "success" };
    expect((await inspection([good], [], "current", { required: [{ context: "missing", app_id: 15368 }] })).state).toBe("pending");
    expect((await inspection([{ ...good, app: { id: 99 } }])).state).toBe("pending");
    expect((await inspection([], [{ context: "test", state: "success" }])).state).toBe("pending");
    expect((await inspection([good])).state).toBe("passed");
  });
  it("holds a rerun with the old success and a new pending check on the same head", async () => {
    expect((await inspection([{ name: "test", status: "completed", conclusion: "success" }, { name: "test", status: "in_progress", conclusion: null }])).state).toBe("pending");
  });
  it("enforces ruleset checks alongside classic checks", async () => {
    const test = { name: "test", status: "completed", conclusion: "success" };
    const rules = [{ type: "required_status_checks", parameters: { required_status_checks: [{ context: "security", integration_id: 42 }] } }];
    expect((await inspection([test], [], "current", { rules })).state).toBe("pending");
    expect((await inspection([test, { ...test, name: "security", app: { id: 42 } }], [], "current", { rules })).state).toBe("passed");
  });
  it("holds for missing/inaccessible policy even when rulesets are empty and arbitrary checks are green", async () => {
    const checks = [{ name: "test", status: "completed", conclusion: "success" }];
    for (const policyStatus of [403, 404]) expect((await inspection(checks, [], "current", { policyStatus })).summary).toContain("policy unavailable");
    expect((await inspection(checks, [], "current", { required: [] })).state).toBe("pending");
    expect((await inspection(checks, [], "current", { rulesStatus: 403 })).state).toBe("pending");
    expect((await inspection(checks, [], "current", { rules: [{ type: "required_status_checks" }] })).state).toBe("pending");
  });
  it("rejects a force push during refresh, changed base, and evidence for another head", async () => {
    const checks = [{ name: "test", status: "completed", conclusion: "success" }];
    expect((await inspection(checks, [], "current", { latestHead: "force-pushed" })).stale).toBe(true);
    expect((await inspection(checks, [], "current", { latestBase: "release" })).stale).toBe(true);
    expect((await inspection(checks, [], "current", { base: "release" })).state).toBe("pending");
    expect((await inspection([{ ...checks[0], head_sha: "old" }])).state).toBe("pending");
  });
  it("recovers a PR accepted by GitHub before a worker restart instead of duplicating it", async () => {
    let calls = 0;
    const fetcher = spyOn(globalThis, "fetch").mockImplementation((async () => { calls++; return Response.json([{ number: 12, html_url: "https://github.com/a/b/pull/12" }]); }) as unknown as typeof fetch);
    try {
      const pr = await openPullRequest("token", "a/b", { head: "shiptorio/gh-1", base: "main", title: "Fix", body: "Fix checkout" });
      expect(pr.number).toBe(12);
      expect(calls).toBe(1);
    } finally { fetcher.mockRestore(); }
  });
});
