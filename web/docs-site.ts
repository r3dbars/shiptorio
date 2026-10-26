import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Marked, type Tokens } from "marked";
import type { Plugin } from "vite";

// The public docs site: markdown in docs/site/, rendered at build time into static pages at /docs/*.
// Pages are served as /docs/<slug> (Cloudflare assets drop the .html). Search is a prebuilt index
// (/docs/search.json) the page fetches the first time you focus the search box.

const SRC = resolve(__dirname, "../docs/site");
const IMG = resolve(SRC, "img");

export interface DocPage { slug: string; title: string; description: string; section: string; order: number; html: string; toc: { id: string; text: string }[]; sections: SearchEntry[] }
export interface SearchEntry { url: string; page: string; heading: string; text: string }

const SECTIONS = ["Start here", "The loop", "Grow the factory", "Reference"];

function frontmatter(raw: string): { meta: Record<string, string>; body: string } {
  const m = raw.match(/^---\n([\s\S]*?)\n---\n/);
  if (!m) return { meta: {}, body: raw };
  const meta: Record<string, string> = {};
  for (const line of m[1].split("\n")) {
    const i = line.indexOf(":");
    if (i > 0) meta[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
  return { meta, body: raw.slice(m[0].length) };
}

const slugify = (text: string) => text.toLowerCase().replace(/<[^>]+>/g, "").replace(/&[a-z]+;|&#\d+;/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const plain = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/\s+/g, " ").trim();
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);

function render(slug: string, raw: string): DocPage {
  const { meta, body } = frontmatter(raw);
  const toc: DocPage["toc"] = [];
  const seen = new Map<string, number>();
  const marked = new Marked({ gfm: true });
  marked.use({
    renderer: {
      heading(this: { parser: { parseInline(t: Tokens.Generic[]): string } }, { tokens, depth }: Tokens.Heading) {
        const inner = this.parser.parseInline(tokens);
        let id = slugify(inner) || "section";
        const n = seen.get(id) ?? 0;
        seen.set(id, n + 1);
        if (n) id = `${id}-${n}`;
        if (depth === 2) toc.push({ id, text: plain(inner) });
        if (depth === 1) return `<h1>${inner}</h1>\n`;
        return `<h${depth} id="${id}"><a class="anchor" href="#${id}" aria-label="Link to this section">#</a>${inner}</h${depth}>\n`;
      },
      blockquote(this: { parser: { parse(t: Tokens.Generic[]): string } }, { tokens }: Tokens.Blockquote) {
        const inner = this.parser.parse(tokens);
        const kind = /^<p><strong>(Heads up|Coming soon|Note|Tip)/.exec(inner)?.[1].toLowerCase().replace(" ", "-") ?? "note";
        return `<aside class="callout ${kind}">${inner}</aside>\n`;
      },
      table(this: unknown, token: Tokens.Table) {
        // let the default renderer build the table, then wrap it so wide tables scroll on phones
        const html = new Marked({ gfm: true }).parser([token as unknown as Tokens.Generic]);
        return `<div class="table">${html}</div>\n`;
      },
      code({ text, lang }: Tokens.Code) {
        return `<div class="code"><pre><code${lang ? ` class="lang-${esc(lang)}"` : ""}>${esc(text)}</code></pre><button class="copy" type="button" aria-label="Copy">copy</button></div>\n`;
      },
      link({ href, title, tokens }: Tokens.Link) {
        const inner = new Marked().parseInline(tokens.map((t) => t.raw).join("")) as string;
        const external = /^https?:\/\//.test(href);
        return `<a href="${esc(href)}"${title ? ` title="${esc(title)}"` : ""}${external ? ' rel="noreferrer"' : ""}>${inner}</a>`;
      },
    },
  });
  const html = marked.parse(body, { async: false }) as string;
  const title = meta.title || plain(/<h1>(.*?)<\/h1>/.exec(html)?.[1] ?? slug);

  // search entries: one per h2 section (the intro counts as the page itself)
  const sections: SearchEntry[] = [];
  const url = slug === "index" ? "/docs/" : `/docs/${slug}`;
  const parts = html.replace(/<a class="anchor"[^>]*>#<\/a>/g, "").split(/(?=<h2 id=")/);
  for (const part of parts) {
    const h = /^<h2 id="([^"]+)">(.*?)<\/h2>/.exec(part);
    sections.push({ url: h ? `${url}#${h[1]}` : url, page: title, heading: h ? plain(h[2]) : title, text: plain(h ? part.slice(h[0].length) : part.replace(/<h1>.*?<\/h1>/, "")).slice(0, 600) });
  }
  return { slug, title, description: meta.description ?? "", section: meta.section ?? "Reference", order: Number(meta.order ?? 99), html, toc, sections };
}

export function loadDocs(): DocPage[] {
  const pages = readdirSync(SRC).filter((f) => f.endsWith(".md")).map((f) => render(f.replace(/\.md$/, ""), readFileSync(resolve(SRC, f), "utf8")));
  return pages.sort((a, b) => SECTIONS.indexOf(a.section) - SECTIONS.indexOf(b.section) || a.order - b.order);
}

const href = (slug: string) => (slug === "index" ? "/docs/" : `/docs/${slug}`);

function nav(pages: DocPage[], current: string): string {
  return SECTIONS.map((section) => {
    const items = pages.filter((p) => p.section === section);
    if (!items.length) return "";
    return `<div class="nav-group"><p>${section}</p><ul>${items.map((p) => `<li><a href="${href(p.slug)}"${p.slug === current ? ' aria-current="page"' : ""}>${esc(p.title)}</a></li>`).join("")}</ul></div>`;
  }).join("");
}

function pageHtml(page: DocPage, pages: DocPage[]): string {
  const i = pages.indexOf(page);
  const prev = pages[i - 1];
  const next = pages[i + 1];
  const toc = page.toc.length > 1 ? `<nav class="toc" aria-label="On this page"><p>On this page</p><ul>${page.toc.map((t) => `<li><a href="#${t.id}">${esc(t.text)}</a></li>`).join("")}</ul></nav>` : "";
  const desc = esc(page.description || "Shiptorio turns your repo into a factory game where every rocket is a real merged pull request.");
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(page.title)} · Shiptorio docs</title>
<meta name="description" content="${desc}">
<meta property="og:title" content="${esc(page.title)} · Shiptorio docs">
<meta property="og:description" content="${desc}">
<meta property="og:image" content="/docs/img/hero.png">
<meta name="theme-color" content="#171a22">
<link rel="icon" href="/docs/img/icon.png">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Barlow:wght@400;500;600;700&family=Barlow+Semi+Condensed:wght@500;600;700&family=JetBrains+Mono:wght@500&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/docs/docs.css">
</head>
<body>
<a class="skip" href="#content">Skip to content</a>
<header class="top">
  <a class="brand" href="/docs/"><img src="/docs/img/icon.png" alt="" width="28" height="28"><span>SHIPTORIO</span><small>DOCS</small></a>
  <div class="search" role="search">
    <input id="q" type="search" placeholder="Search docs" aria-label="Search docs" autocomplete="off" spellcheck="false"><kbd>/</kbd>
    <div id="results" class="results" role="listbox" hidden></div>
  </div>
  <a class="play" href="/">Open the factory</a>
</header>
<div class="shell">
  <details class="side" open>
    <summary>Menu</summary>
    <nav aria-label="Docs">${nav(pages, page.slug)}</nav>
  </details>
  <main id="content">
    <article>${page.html}</article>
    <nav class="pager" aria-label="Next and previous">
      ${prev ? `<a class="prev" href="${href(prev.slug)}"><small>Previous</small>${esc(prev.title)}</a>` : "<span></span>"}
      ${next ? `<a class="next" href="${href(next.slug)}"><small>Next</small>${esc(next.title)}</a>` : "<span></span>"}
    </nav>
    <footer>Shiptorio · built for the Meta AI Developer Hackathon · powered by Meta Muse Spark · <a href="https://github.com/r3dbars/shiptorio/edit/main/docs/site/${page.slug}.md" rel="noreferrer">Edit this page</a></footer>
  </main>
  ${toc}
</div>
<script src="/docs/docs.js" defer></script>
</body>
</html>
`;
}

/** Every file the docs site serves, keyed by its path under web/dist. */
export function buildDocs(): Map<string, string | Uint8Array> {
  const pages = loadDocs();
  const out = new Map<string, string | Uint8Array>();
  for (const page of pages) out.set(page.slug === "index" ? "docs/index.html" : `docs/${page.slug}.html`, pageHtml(page, pages));
  out.set("docs/search.json", JSON.stringify(pages.flatMap((p) => p.sections)));
  out.set("docs/docs.css", readFileSync(resolve(SRC, "_assets/docs.css"), "utf8"));
  out.set("docs/docs.js", readFileSync(resolve(SRC, "_assets/docs.js"), "utf8"));
  for (const f of readdirSync(IMG)) out.set(`docs/img/${f}`, new Uint8Array(readFileSync(resolve(IMG, f))));
  return out;
}

const TYPES: Record<string, string> = { html: "text/html; charset=utf-8", json: "application/json", css: "text/css", js: "text/javascript", png: "image/png", webp: "image/webp", svg: "image/svg+xml" };

/** Map a request path to a built file the way Cloudflare's assets do (/docs/x → docs/x.html, /docs/ → docs/index.html). */
export function resolveDocsPath(path: string, files: Map<string, unknown>): string | null {
  const p = path.replace(/^\//, "");
  if (!p.startsWith("docs")) return null;
  for (const candidate of [p, `${p}.html`, `${p.replace(/\/$/, "")}/index.html`]) if (files.has(candidate)) return candidate;
  return null;
}

export function docsSite(): Plugin {
  return {
    name: "shiptorio-docs",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const path = req.url?.split(/[?#]/)[0] ?? "";
        if (path !== "/docs" && !path.startsWith("/docs/")) return next();
        if (path === "/docs") { res.statusCode = 308; res.setHeader("location", "/docs/"); return res.end(); }
        const files = buildDocs(); // rebuilt per request so edits show on reload
        const file = resolveDocsPath(path, files);
        if (!file) return next();
        res.setHeader("content-type", TYPES[file.split(".").pop() ?? ""] ?? "application/octet-stream");
        res.end(files.get(file));
      });
    },
    generateBundle() {
      for (const [fileName, source] of buildDocs()) this.emitFile({ type: "asset", fileName, source });
    },
  };
}
