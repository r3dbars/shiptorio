import { describe, expect, test } from "bun:test";
import { feature, previewOn } from "../src/flags";

// New features ship ON on dev (docs/context/branches.md): shiptorio.dev gets every preview feature with no URL flags,
// shiptorio.com keeps its defaults, and ?x=0 / ?x=1 still pick either way for debugging.
describe("preview features", () => {
  test("on at shiptorio.dev, off at shiptorio.com and localhost", () => {
    expect(previewOn("", "shiptorio.dev")).toBe(true);
    expect(previewOn("", "shiptorio.com")).toBe(false);
    expect(previewOn("", "localhost")).toBe(false);
    expect(feature("artpass", "", "shiptorio.dev")).toBe(true);
    expect(feature("artpass", "", "shiptorio.com")).toBe(false);
  });
  test("?preview= picks the whole set on any host", () => {
    expect(previewOn("?preview=1", "localhost")).toBe(true);
    expect(previewOn("?preview=0", "shiptorio.dev")).toBe(false);
    expect(feature("simple", "?preview=1", "localhost")).toBe(true);
  });
  test("?x=0 and ?x=1 win over the host", () => {
    expect(feature("simple", "?simple=0", "shiptorio.dev")).toBe(false);
    expect(feature("simple", "?simple=1", "shiptorio.com")).toBe(true);
    expect(feature("simple", "?simple=1&preview=0", "shiptorio.dev")).toBe(true);
  });
});
