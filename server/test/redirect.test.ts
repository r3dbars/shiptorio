import { describe, expect, it } from "bun:test";
import { sameOriginPath } from "../src/redirect";
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
