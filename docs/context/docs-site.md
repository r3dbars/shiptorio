# Docs site (/docs)

- Source: `docs/site/*.md` (frontmatter: title, description, section, order). Built by `web/docs-site.ts` into
  static pages at `/docs/<slug>` plus `/docs/search.json`; served in dev by the same Vite plugin.
- Look: Black Iron (`docs/art/IRON-STYLE.md`), styles in `docs/site/_assets/docs.css` (tokens copied from
  `web/src/iron.css`, since the docs don't load the app CSS). Silkscreen for h1/h2/labels, JetBrains Mono body
  at 15.5px / 1.68, 72ch measure. Callouts read like machine chips: `**Note**` idle blue, `**Tip**` green,
  `**Heads up**` amber with caution stripe, `**Coming soon**` brass; the leading bold becomes the chip label.
- Fonts come from `/fonts/*` and logo/favicons from `/brand/*` (both public past the preview gate). The build
  uses `/brand/wordmark.svg`, `favicon.svg`, `og.png` only when they exist in `web/public/brand/`, else a text
  wordmark and `/docs/img/icon.png`.
- `web/test/docs-site.test.ts` is the link checker: every href/src (incl. /fonts, /brand) and every CSS font url
  must resolve.
