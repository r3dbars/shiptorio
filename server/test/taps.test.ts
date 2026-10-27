import { describe, expect, it, mock } from "bun:test";
import type { Move } from "@shiptorio/shared";
import { signedInCookie, testD1 } from "./d1-fixture";
import { closeGone, loadTaps, offerCards, offeredRow, purgeTaps, recordOutcome, recordTap, tapBrief, tapsReport, TAPS_RETENTION_MS, type TapRow } from "../src/taps";
import { tapSignals } from "../src/signals/taps";

const card = (id: string, over: Partial<Move> = {}): Move => ({ id, title: `Card ${id}`, why: "x", createdAt: 1, kind: "verify", options: [{ id: "go", label: "Go", recommended: true, actions: [] }, { id: "alt", label: "Alt", recommended: false, actions: [] }], ...over });
const row = (over: Partial<TapRow>): TapRow => ({ ...offeredRow("o/r", card("c"), "district:web", "rule", 1000), ...over });

describe("card tap log", () => {
  it("logs an offer once, records the tap, closes untapped cards and follows the approved work to its outcome", async () => {
    const db = testD1();
    await offerCards(db, [offeredRow("o/r", card("a", { itemId: "i1", because: "token ghp_abcdefghijklmnopqrstuvwxyz0123456789 leaked" }), "district:web", "spark", 1000), offeredRow("o/r", card("b"), "district:web", "rule", 1000)]);
    await offerCards(db, [offeredRow("o/r", card("a"), "district:web", "spark", 2000)]);
    await recordTap(db, offeredRow("o/r", card("a"), "district:web", "spark", 5000), { action: "continue", optionId: "go" }, 5000);
    await closeGone(db, "o/r", ["b"], 6000);
    // A card offered before logging was on still gets a row at the tap.
    await recordTap(db, offeredRow("o/r", card("z"), "district:web", "rule", 7000), { action: "never", reason: "wrong" }, 7000);
    await recordOutcome(db, "o/r", "i1", "rework", 8000);
    await recordOutcome(db, "o/r", "i1", "shipped_after_rework", 9000);
    const rows = await loadTaps(db, { repo: "o/r", since: 0 });
    const a = rows.find(r => r.card_id === "a")!;
    expect(rows).toHaveLength(3);
    expect(a).toMatchObject({ action: "continue", option_id: "go", shown_at: 1000, decided_at: 5000, suggested: "go", by: "spark", outcome: "shipped_after_rework" });
    expect(a.because).not.toContain("ghp_");
    expect(rows.find(r => r.card_id === "b")).toMatchObject({ action: "gone", decided_at: 6000, outcome: null });
    expect(rows.find(r => r.card_id === "z")).toMatchObject({ action: "never", reason: "wrong", shown_at: 7000 });
    await purgeTaps(db, 1000 + TAPS_RETENTION_MS + 1);
    expect((await loadTaps(db, { since: 0 })).map(r => r.card_id).sort()).toEqual(["z"]);
  });

  it("turns rows into approval rates, waits, skips and outcome quality", () => {
    const rows = [
      row({ card_id: "1", kind: "verify", action: "continue", decided_at: 1000 + 60000, outcome: "shipped_clean", by: "spark" }),
      row({ card_id: "2", kind: "verify", action: "continue", decided_at: 1000 + 120000, outcome: "rework", by: "spark" }),
      row({ card_id: "3", kind: "verify", action: "later", decided_at: 1000 + 30000 }),
      row({ card_id: "4", kind: "input", title: "Connect Sentry", action: "never", reason: "kind", decided_at: 2000 }),
      row({ card_id: "5", kind: "input", title: "Connect Sentry", action: "later", decided_at: 3000 }),
      row({ card_id: "6", kind: "input", action: "gone", decided_at: 9000 }),
      row({ card_id: "7", kind: "build" }),
      row({ card_id: "old", shown_at: 0, action: "continue", decided_at: 10 }),
    ];
    const r = tapsReport(rows, 500);
    expect(r.total).toMatchObject({ shown: 7, decided: 5, continued: 2, later: 2, never: 1, gone: 1, approval: 0.4, shippedClean: 1, rework: 1, goodRate: 0.5 });
    expect(r.byKind.verify).toMatchObject({ shown: 3, approval: 2 / 3, medianDecideMs: 60000 });
    expect(r.byAuthor.spark.approval).toBe(1);
    expect(r.neverReasons).toEqual({ kind: 1 });
    expect(r.skipped[0]).toMatchObject({ title: "Connect Sentry", later: 1, never: 1 });
    expect(tapBrief(r)).toEqual({ approvalByKind: { verify: { taps: 3, yes: 2, rate: 0.67 } }, oftenSkipped: ["input: Connect Sentry"], approvedThenReworked: 1, approvedAndShippedClean: 1 });
  });

  it("tells the brain when cards go untapped, keep getting set aside, or are called wrong", () => {
    const now = 10 * 86400000;
    const at = (h: number) => now - h * 3600000;
    const rows = [
      ...[1, 2, 3].map(h => row({ card_id: `g${h}`, kind: "input", shown_at: at(h + 1), action: "gone", decided_at: at(h) })),
      ...[1, 2, 3].map(h => row({ card_id: `l${h}`, kind: "verify", shown_at: at(h + 1), action: "later", decided_at: at(h) })),
      row({ card_id: "y", kind: "verify", shown_at: at(10), action: "continue", decided_at: at(9) }),
      ...[1, 2].map(h => row({ card_id: `w${h}`, kind: "build", shown_at: at(h + 1), action: "never", reason: "wrong", decided_at: at(h) })),
      row({ card_id: "ancient", shown_at: now - 30 * 86400000, action: "gone", decided_at: now - 29 * 86400000 }),
    ];
    const signals = tapSignals(rows, now);
    expect(signals.map(s => s.id).sort()).toEqual(["taps:card_ignored:repo", "taps:later_streak:verify", "taps:never_reason:repo"]);
    expect(signals.find(s => s.kind === "later_streak")).toMatchObject({ title: "You set aside the last 3 verify cards.", source: "taps", freshUntil: now + 30 * 60000 });
    expect(signals.every(s => s.evidence.length >= 1 && s.title.length <= 160)).toBe(true);
    expect(tapSignals(rows.slice(0, 2), now)).toEqual([]);
  });
});

mock.module("cloudflare:workers", () => ({ DurableObject: class { ctx: unknown; env: unknown; constructor(ctx: unknown, env: unknown) { this.ctx = ctx; this.env = env; } } }));
const { testApp: app } = await import("./app-fixture");
const { makeSessionCookie } = await import("../src/session");

describe("/admin/taps", () => {
  const env = { SESSION_SECRET: "taps-test", APP_PASSWORD: "pw", ALLOWED_LOGINS: "r3dbars,other", ADMIN_LOGINS: "r3dbars", DB: testD1(),
    CACHE: { list: async () => ({ keys: [] }), put: async () => {}, get: async () => null } };
  const cookie = async (login: string) => (await makeSessionCookie("taps-test:pw", "preview")).split(";")[0].replace("shiptorio_session=", "shiptorio_access=") + "; " + await signedInCookie(env as never, login);
  it("is admin only and serves the report for one factory", async () => {
    for (const path of ["/admin/taps", "/admin/taps/data", "/admin/taps/app.js"]) expect((await app.fetch(new Request("https://shiptorio.com" + path, { headers: { cookie: await cookie("other") } }), env)).status).toBe(403);
    await offerCards(env.DB, [offeredRow("o/r", card("a"), "district:web", "rule", Date.now())]);
    const headers = { cookie: await cookie("r3dbars") };
    expect(await (await app.fetch(new Request("https://shiptorio.com/admin/taps", { headers }), env)).text()).toContain("What players say yes and no to");
    const data = await (await app.fetch(new Request("https://shiptorio.com/admin/taps/data?repo=o/r&rows=1", { headers }), env)).json() as any;
    expect(data).toMatchObject({ days: 7, repo: "o/r", repos: ["o/r"], report: { total: { shown: 1 } }, signals: [] });
    expect(data.rows).toHaveLength(1);
  });
});
