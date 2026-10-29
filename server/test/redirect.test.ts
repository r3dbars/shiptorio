import { describe, expect, it } from "bun:test";
import { deckFrontDoor, sameOriginPath } from "../src/redirect";
import { login } from "../src/auth";

const origin = "https://shiptorio.com";
const unsafe = ["//attacker.example", "/\\attacker.example", "/\t/attacker.example", "/\r/attacker.example", "/\n/attacker.example", "/ok\r\nLocation: https://attacker.example", "https://attacker.example", "/path with spaces", "/\u0000evil", "/\u007fevil"];

describe("same-origin redirects", () => {
  it("rejects browser-normalized external URLs and all control characters", () => {
    for (const next of unsafe) expect(sameOriginPath(next, origin)).toBe("/");
    for (const next of ["/", "/?source=live&repo=owner/name", "/a/../factory#queue"]) {
      expect(sameOriginPath(next, origin)).toBe(next);
      expect(new URL(sameOriginPath(next, origin), origin).origin).toBe(origin);
    }
    expect(sameOriginPath(null, origin)).toBe("/");
  });
  it("does not preserve a malicious OAuth destination in its callback cookie", async () => {
    for (const next of unsafe) {
      const url = new URL("/auth/login", origin); url.searchParams.set("next", next);
      const response = await login(url, { GITHUB_CLIENT_ID: "test", GITHUB_CLIENT_SECRET: "fixture-secret" } as never);
      expect(response.headers.getSetCookie().find(c => c.startsWith("shiptorio_next="))).toStartWith("shiptorio_next=%2F;");
    }
  });
});

// Every public path on shiptorio.dev and where it lands (null = served as is). shiptorio.com never moves.
const DECK = "/deck?source=live";
const routes: [string, string | null][] = [
  ["/", DECK],
  ["/?utm_source=x&ref=hn", DECK],
  ["/?onboard=hello", DECK],
  ["/?onboard=repo&source=live", DECK],
  ["/?source=live&repo=owner/repo&connect=1", `${DECK}&repo=owner%2Frepo`],
  ["/?simple=1", DECK],
  ["/?world=shaft", DECK],
  ["/deck", null],
  ["/deck?source=live", null],
  ["/deck?source=live&repo=owner/repo&onboard=codex", null],
  ["/deck.html?source=live", null],
  ["/deck?source=replay&trace=all-clear", null],
  ["/deck?px=0", "/deck"],
  ["/deck.html?source=live&px=0", DECK],
  ["/deck?px=1", null],
  ["/?source=sim&scenario=first-run", null],
  ["/?source=replay", null],
  ["/?scenario=quiet-morning", null],
  ["/judge", null],
  ["/judge?world=shaft", null],
  ["/settings", null],
  ["/setup", null],
  ["/waitlist", null],
  ["/privacy", null],
  ["/welcome/", null],
  ["/auth/login", null],
];

describe("one front door on shiptorio.dev", () => {
  it.each(routes)("%s lands on %s", (path, target) => {
    for (const host of ["shiptorio.dev", "www.shiptorio.dev"]) expect(deckFrontDoor(new URL(path, `https://${host}`))).toBe(target);
  });
  it("leaves shiptorio.com and local dev alone", () => {
    for (const [path] of routes) {
      expect(deckFrontDoor(new URL(path, origin))).toBeNull();
      expect(deckFrontDoor(new URL(path, "http://localhost:8787"))).toBeNull();
    }
  });
  it("every redirect stays same-origin", () => {
    for (const [path, target] of routes) if (target) expect(sameOriginPath(target, "https://shiptorio.dev")).toBe(target);
    expect(deckFrontDoor(new URL("https://shiptorio.dev/?source=live&repo=//evil.example"))).toBe(`${DECK}&repo=%2F%2Fevil.example`);
  });
});
