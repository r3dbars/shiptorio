import { expect, test } from "bun:test";
import { escapeHtml, plural, sha256Hex, toHex } from "../src/encode";

test("escapeHtml turns the five HTML specials into entities", () => {
  expect(escapeHtml(`<a href="x">Tom & Jerry's</a>`)).toBe("&#60;a href=&#34;x&#34;&#62;Tom &#38; Jerry&#39;s&#60;/a&#62;");
});

test("toHex and sha256Hex match the known SHA-256 of 'abc'", async () => {
  expect(toHex(new Uint8Array([0, 15, 255]))).toBe("000fff");
  expect(await sha256Hex("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
});

test("plural", () => {
  expect(plural(1, "PR")).toBe("1 PR");
  expect(plural(3, "PR")).toBe("3 PRs");
  expect(plural(2, "reply", "replies")).toBe("2 replies");
});
