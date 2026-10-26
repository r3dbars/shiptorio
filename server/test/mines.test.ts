import { expect, it, mock } from "bun:test";
import { foldSignal, matchDistrict } from "../src/ore";
import { fakeSentry, normalizeSentry, topInAppPath } from "../src/sources/sentry";
import { analyze, fakePostHogRows, normalizeRoute, parseRows } from "../src/sources/posthog";

mock.module("cloudflare:workers", () => ({ DurableObject: class {
  ctx: unknown; env: unknown;
  constructor(ctx: unknown, env: unknown) { this.ctx = ctx; this.env = env; }
} }));
const { default: app } = await import("../src/index");

const DISTRICTS = ["checkout", "cart", "api", "docs", "/"];

it("maps stack frames and routes onto districts", () => {
  expect(matchDistrict("checkout/total.ts", DISTRICTS)).toBe("checkout");
  expect(matchDistrict("/checkout/pay?x=1", DISTRICTS)).toBe("checkout");
  expect(matchDistrict("src/cart.tsx", DISTRICTS)).toBe("cart");
  expect(matchDistrict("app:///api/orders.ts", DISTRICTS)).toBe("api");
  expect(matchDistrict("/nowhere", DISTRICTS)).toBe("/");
  expect(matchDistrict(undefined, DISTRICTS)).toBe("/");
});

it("turns a Sentry issue into one chunk that grows on repeats and closes on resolve", () => {
  const [created] = normalizeSentry(fakeSentry("issue.created"), "issue");
  expect(created.fingerprint).toBe("sentry:4501");
  expect(created.severity).toBe(2);
  expect(matchDistrict(created.districtHint, DISTRICTS)).toBe("checkout");
  const first = foldSignal(undefined, created);
  expect(first.source).toBe("sentry");
  expect(first.kind).toBe("bug");
  expect(first.ore?.usersAffected).toBe(112);
  // A cumulative userCount must not double count; an error event adds one user.
  const again = foldSignal(first, { ...created, rawRef: "sentry:issue:4501:again", usersTotal: 130 });
  expect(again.ore?.usersAffected).toBe(130);
  const [event] = normalizeSentry(fakeSentry("error.created"), "error");
  expect(event.fingerprint).toBe("sentry:4501");
  const third = foldSignal(again, event);
  expect(third.id).toBe(first.id);
  expect(third.ore?.count).toBe(3);
  expect(third.ore?.usersAffected).toBe(131);
  expect(normalizeSentry(fakeSentry("issue.resolved"), "issue")[0].action).toBe("resolved");
  expect(normalizeSentry({ data: {} }, "issue")).toEqual([]);
});

it("finds the topmost in-app frame", () => {
  expect(topInAppPath({ exception: { values: [{ stacktrace: { frames: [{ filename: "./cart/a.ts", in_app: true }, { filename: "node_modules/x.js", in_app: false }] } }] } })).toBe("cart/a.ts");
});

it("flags a PostHog drop on /checkout and an exception spike, and stays quiet on steady traffic", () => {
  const now = Date.parse("2026-10-26T15:00:00Z");
  const steady = analyze(fakePostHogRows(now, "steady"), "$pageview", now);
  expect(steady.signals).toEqual([]);
  expect(steady.traffic[0].route).toBe("/");
  const drop = analyze(fakePostHogRows(now, "drop"), "$pageview", now);
  const titles = drop.signals.map((s) => s.title);
  expect(titles).toContain("/checkout traffic dropped 70% yesterday");
  expect(titles.some((t) => t.startsWith("Error spike on /checkout"))).toBe(true);
  const ore = drop.signals.find((s) => s.title.includes("dropped"))!;
  expect(ore.fingerprint).toBe("posthog:$pageview:/checkout:2026-10-25");
  expect(matchDistrict(ore.districtHint, DISTRICTS)).toBe("checkout");
  // Polling again the same day folds into the same chunk instead of new ore.
  const item = foldSignal(undefined, ore);
  expect(foldSignal(item, ore)).toBe(item);
});

it("parses HogQL rows and collapses ids in routes", () => {
  expect(normalizeRoute("/orders/123/")).toBe("/orders/:id");
  expect(parseRows({ results: [["$pageview", "/a?x=1", "2026-10-25", 3, 2]] })).toEqual([{ event: "$pageview", route: "/a", day: "2026-10-25", count: 3, users: 2 }]);
  expect(() => parseRows({ error: "nope" })).toThrow();
});

async function sign(secret: string, body: string) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return [...new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body)))].map((b) => b.toString(16).padStart(2, "0")).join("");
}

it("Sentry webhook: rejects bad signatures, needs no preview password, queues once per request id", async () => {
  const rows = new Map<string, { state: string }>();
  const queued: string[] = [];
  const env = {
    SESSION_SECRET: "test-session-secret", APP_PASSWORD: "preview-password", SENTRY_CLIENT_SECRET: "fake-sentry-client-secret", SENTRY_REPO: "example/shop",
    DB: { prepare: (sql: string) => {
      let values: unknown[] = [];
      const statement = {
        bind: (...args: unknown[]) => { values = args; return statement; },
        run: async () => { const id = String(values[0]); const existed = rows.has(id); if (!existed) rows.set(id, { state: "done" }); return { meta: { changes: existed ? 0 : 1 } }; },
        first: async () => rows.get(String(values[0])) ?? null,
      };
      expect(sql).toContain("sentry");
      return statement;
    } },
    FACTORY: { idFromName: (repo: string) => repo, get: (repo: string) => ({ enqueueSentry: async (id: string, resource: string) => { expect(repo).toBe("example/shop"); queued.push(`${id}:${resource}`); } }) },
  };
  const body = JSON.stringify(fakeSentry("issue.created"));
  const send = async (signature: string, id = "req-1") => app.fetch(new Request("https://shiptorio.com/webhooks/sentry", { method: "POST", headers: { "sentry-hook-signature": signature, "sentry-hook-resource": "issue", "request-id": id }, body }), env as never);
  expect((await send("0".repeat(64))).status).toBe(401);
  const good = await sign(env.SENTRY_CLIENT_SECRET, body);
  expect((await send(good)).status).toBe(202);
  expect((await (await send(good)).json() as { duplicate?: boolean }).duplicate).toBe(true);
  expect(queued).toEqual(["req-1:issue"]);
});
