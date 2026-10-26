import { expect, it, mock } from "bun:test";
import { fakeGitHub } from "../src/sources/github";

mock.module("cloudflare:workers", () => ({ DurableObject: class {
  ctx: unknown; env: unknown;
  constructor(ctx: unknown, env: unknown) { this.ctx = ctx; this.env = env; }
} }));
const { default: app } = await import("../src/index");

it("authenticates, durably enqueues before 202, and deduplicates completed deliveries", async () => {
  const rows = new Map<string, { state: string }>();
  const queued: string[] = [];
  const pending: Promise<unknown>[] = [];
  const env = {
    GITHUB_WEBHOOK_SECRET: "fake-intake-signing-secret",
    DB: { prepare: (sql: string) => {
      let values: unknown[] = [];
      const statement = {
        bind: (...args: unknown[]) => { values = args; return statement; },
        run: async () => {
          if (!sql.startsWith("INSERT")) return { meta: { changes: 0 } };
          const id = String(values[0]);
          const existed = rows.has(id);
          if (!existed) rows.set(id, { state: "pending" });
          return { meta: { changes: existed ? 0 : 1 } };
        },
        first: async () => rows.get(String(values[0])) ?? null,
      };
      return statement;
    } },
    FACTORY: { idFromName: (repo: string) => repo, get: () => ({ enqueueGitHub: async (id: string) => { queued.push(id); } }) },
  };
  const raw = JSON.stringify(fakeGitHub());
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(env.GITHUB_WEBHOOK_SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = "sha256=" + [...new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(raw)))].map((b) => b.toString(16).padStart(2, "0")).join("");
  const send = (sig = signature, id = "fake-delivery-1", body = raw) => app.fetch(new Request("https://shiptorio.com/webhooks/github", { method: "POST", headers: { "x-hub-signature-256": sig, "x-github-event": "issues", "x-github-delivery": id }, body }), env as never, { waitUntil: (p: Promise<unknown>) => pending.push(p) } as never);
  expect((await send("sha256=" + "0".repeat(64))).status).toBe(401);
  expect(queued).toHaveLength(0);
  const first = await send();
  expect(first.status).toBe(202);
  expect(queued).toEqual(["fake-delivery-1"]);
  rows.get("fake-delivery-1")!.state = "done";
  const duplicate = await send();
  expect(duplicate.status).toBe(200);
  expect(await duplicate.json()).toEqual({ ok: true, duplicate: true });
  expect(queued).toHaveLength(1);
  expect((await send(signature, "")).status).toBe(400);
  expect((await send(signature, "fake-2", "{}")).status).toBe(401);
  await Promise.all(pending);
});
