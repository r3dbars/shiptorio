/** Fixed request workload for one issue through the real GitHub boundary.
 * Concurrent readers model a deck refresh meeting the factory's own read.
 * Provider latency is fixed: UI rendering/poll frequency cannot change counts.
 */
import type * as GitHub from "../src/github";
export async function githubLoopFixture(api: typeof GitHub) {
  const repo = "fixture/workshop", token = crypto.randomUUID(), head = "b".repeat(40), base = "a".repeat(40);
  const calls: { step: string; method: string; path: string; conditional: boolean }[] = [];
  let step = "inbox", opened = false, merged = false;
  const original = globalThis.fetch;
  globalThis.fetch = (async (input: unknown, init?: RequestInit) => {
    const url = new URL(String(input)), method = init?.method ?? "GET", path = url.pathname;
    calls.push({ step, method, path, conditional: new Headers(init?.headers).has("if-none-match") });
    await new Promise(resolve => setTimeout(resolve, 5));
    const json = (value: unknown, status = 200) => Response.json(value, { status, headers: { etag: `"${step}-${opened}-${merged}"` } });
    if (path.endsWith("/issues")) return json([{ number: 16, title: "Document the local setup", state: "open" }]);
    if (path.endsWith("/issues/16")) return json({ number: 16, title: "Document the local setup", body: "Clarify README setup.", state: "open" });
    if (path.endsWith("/pulls") && method === "GET") return json(opened ? [{ number: 27, html_url: `https://github.com/${repo}/pull/27` }] : []);
    if (path.endsWith("/pulls") && method === "POST") { opened = true; return json({ number: 27, html_url: `https://github.com/${repo}/pull/27` }, 201); }
    if (path.endsWith("/pulls/27/merge") && method === "PUT") {
      if (JSON.parse(String(init?.body)).sha !== head) throw new Error("merge must pin the approved head");
      merged = true; return json({ merged: true });
    }
    if (path.endsWith("/pulls/27")) return json({ number: 27, state: merged ? "closed" : "open", merged, draft: false, mergeable: true, mergeable_state: "clean", head: { sha: head }, base: { ref: "main", sha: base } });
    if (path.endsWith("/check-runs")) return json({ total_count: 1, check_runs: [{ name: "tests", head_sha: head, status: "completed", conclusion: "success" }] });
    if (path.endsWith("/status")) return json({ total_count: 0, statuses: [] });
    throw new Error(`Unexpected GitHub fixture call: ${method} ${path}`);
  }) as typeof fetch;
  const counts: Record<string, number> = {};
  const run = async (name: string, fn: () => Promise<unknown>) => { step = name; const before = calls.length; await fn(); counts[name] = calls.length - before; };
  try {
    await run("inbox", () => Promise.all([api.gh(`/repos/${repo}/issues`, token), api.gh(`/repos/${repo}/issues`, token)]));
    await run("plan", () => Promise.all([api.gh(`/repos/${repo}/issues/16`, token), api.gh(`/repos/${repo}/issues/16`, token)]));
    await run("pull request", () => api.openPullRequest(token, repo, { title: "Document setup", body: "Closes #16", head: "docs-16", base: "main" }));
    await run("checks", async () => {
      const checks = await Promise.all([api.inspectPullRequest(token, repo, 27, head, "main"), api.inspectPullRequest(token, repo, 27, head, "main")]);
      if (checks.some(check => check.state !== "passed")) throw new Error("Current head must pass checks");
    });
    await run("merge", async () => {
      // Fresh human-gate reads must remain separate even when requested together.
      const readiness = await Promise.all([api.pullRequestReadiness(token, repo, 27, head, "main"), api.pullRequestReadiness(token, repo, 27, head, "main")]);
      if (readiness.some(result => !result.ready)) throw new Error("Human gate not ready");
      await api.gh(`/repos/${repo}/pulls/27/merge`, token, { method: "PUT", body: JSON.stringify({ sha: head, merge_method: "squash" }) });
      const confirmations = await Promise.all([api.gh<{ merged: boolean }>(`/repos/${repo}/pulls/27`, token), api.gh<{ merged: boolean }>(`/repos/${repo}/pulls/27`, token)]);
      if (confirmations.some(result => !result.merged)) throw new Error("The merge must be confirmed");
    });
    return { counts, total: calls.length, calls, merged };
  } finally { globalThis.fetch = original; }
}
