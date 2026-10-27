import { afterEach, expect, test } from "bun:test";
import { prFiles, diffText } from "../src/gauntlet";
const original = globalThis.fetch;
afterEach(() => { globalThis.fetch = original; });
const benign = () => Array.from({ length: 100 }, (_, i) => ({ filename: `docs/${i}.md`, status: "modified", patch: "+safe" }));

test("inspection rejects an unsafe second page even when 100 benign patches fit the review budget", async () => {
  const calls: string[] = [];
  expect(diffText(benign())).not.toContain("rest cut for length");
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = new URL(String(input)); calls.push(url.search);
    return Response.json(url.searchParams.get("page") === "2"
      ? [{ filename: ".github/workflows/release.yml", status: "modified", patch: "+unsafe" }]
      : benign());
  }) as typeof fetch;
  await expect(prFiles("fixture-pagination-overflow", "owner/repo", 1)).rejects.toThrow("complete diff review required");
  expect(calls).toEqual(["?per_page=100", "?per_page=100&page=2"]);
});

test("inspection accepts a complete full page only after checking that no later files exist", async () => {
  globalThis.fetch = (async (input: RequestInfo | URL) => Response.json(new URL(String(input)).searchParams.get("page") === "2" ? [] : benign())) as typeof fetch;
  expect(await prFiles("fixture-pagination-complete", "owner/repo", 1)).toHaveLength(100);
});

test("a failed completeness request never becomes a partial successful inspection", async () => {
  globalThis.fetch = (async (input: RequestInfo | URL) => new URL(String(input)).searchParams.get("page") === "2"
    ? new Response("forbidden", { status: 403 }) : Response.json(benign())) as typeof fetch;
  await expect(prFiles("fixture-pagination-denied", "owner/repo", 1)).rejects.toThrow();
});
