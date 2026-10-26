import { expect, test } from "bun:test";
import { buildDocs, loadDocs, resolveDocsPath } from "../docs-site";

// The docs link checker: every internal link, anchor and image on every page has to resolve in the built site.
const APP_PATHS = new Set(["/", "/art/spark.html"]); // non-docs pages the docs may link to

test("every docs page builds with a title, a description and a section", () => {
  const pages = loadDocs();
  expect(pages.length).toBeGreaterThanOrEqual(10);
  for (const p of pages) {
    expect(p.title.length).toBeGreaterThan(0);
    expect(p.description.length).toBeGreaterThan(0);
    expect(["Start here", "The loop", "Grow the factory", "Reference"]).toContain(p.section);
  }
});

test("every internal link, anchor and image resolves", () => {
  const files = buildDocs();
  const broken: string[] = [];
  for (const [name, body] of files) {
    if (!name.endsWith(".html")) continue;
    const html = body as string;
    for (const [, ref] of html.matchAll(/(?:href|src)="([^"]+)"/g)) {
      if (/^(https?:|mailto:)/.test(ref)) continue;
      const [path, hash] = ref.split("#");
      if (!path) { if (hash && !html.includes(`id="${hash}"`)) broken.push(`${name}: #${hash}`); continue; }
      const clean = path.split("?")[0];
      if (APP_PATHS.has(clean)) continue;
      const target = resolveDocsPath(clean, files);
      if (!target) { broken.push(`${name}: ${ref}`); continue; }
      if (hash && !(files.get(target) as string).includes(`id="${hash}"`)) broken.push(`${name}: ${ref} (no #${hash})`);
    }
  }
  expect(broken).toEqual([]);
});

test("search covers every page and every section heading", () => {
  const files = buildDocs();
  const index = JSON.parse(files.get("docs/search.json") as string) as { url: string; heading: string }[];
  for (const p of loadDocs()) {
    expect(index.some((e) => e.url.startsWith(p.slug === "index" ? "/docs/" : `/docs/${p.slug}`))).toBe(true);
    for (const t of p.toc) expect(index.some((e) => e.url.endsWith(`#${t.id}`))).toBe(true);
  }
});
