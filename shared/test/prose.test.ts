import { expect, it } from "bun:test";
import { isProsePath } from "../src/prose";

it("grants prose classification only to canonical Markdown and text paths", () => {
  for (const path of ["README.md", "docs/guide.txt", "web/docs/Guide.MD", "notes/plan.TXT"]) expect(isProsePath(path)).toBe(true);
  for (const path of ["", "docs/run.ts", "docs/README.mdx", "web/docs/a.ts", "docs/config.json", "/docs/guide.md", "docs//guide.md", "./README.md", "docs/../README.md", "docs\\guide.md", "docs/guide.md\n", "docs/\0guide.md"]) expect(isProsePath(path)).toBe(false);
});
