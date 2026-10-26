import { describe, expect, it } from "bun:test";
import { isAllowed, makeSessionCookie, readSession } from "../src/session";

const cookieValue = (setCookie: string) => setCookie.split(";")[0];

describe("session", () => {
  it("round-trips a login", async () => {
    const c = await makeSessionCookie("k", "r3dbars");
    expect(await readSession("k", `other=1; ${cookieValue(c)}`)).toBe("r3dbars");
  });

  it("rejects a forged or expired cookie", async () => {
    const c = cookieValue(await makeSessionCookie("k", "r3dbars"));
    expect(await readSession("other-key", c)).toBeNull();
    const old = cookieValue(await makeSessionCookie("k", "r3dbars", Date.now() - 30 * 86400_000));
    expect(await readSession("k", old)).toBeNull();
    expect(await readSession("k", null)).toBeNull();
  });

  it("checks the allow list case-insensitively", () => {
    expect(isAllowed("R3dbars, someone", "r3dbars")).toBe(true);
    expect(isAllowed("someone", "r3dbars")).toBe(false);
    expect(isAllowed("", "r3dbars")).toBe(false);
  });
});
