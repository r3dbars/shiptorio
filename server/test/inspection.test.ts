import { describe, expect, it, spyOn } from "bun:test";
import { inspectPullRequest, openPullRequest } from "../src/github";

async function inspection(checks: unknown[], statuses: unknown[] = [], eventSha = "current") {
  const fetcher = spyOn(globalThis, "fetch").mockImplementation((async (url: RequestInfo | URL) => {
    const path = String(url);
    const value = path.includes("check-runs") ? { total_count: checks.length, check_runs: checks }
      : path.endsWith("/status?per_page=100") ? { total_count: statuses.length, statuses }
      : { head: { sha: "current" } };
    return Response.json(value);
  }) as unknown as typeof fetch);
  try { return await inspectPullRequest("test-token", "a/b", 1, eventSha); } finally { fetcher.mockRestore(); }
}

describe("current-commit inspection", () => {
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
