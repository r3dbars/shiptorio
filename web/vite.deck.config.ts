import { resolve } from "node:path";
import { defineConfig, type Plugin } from "vite";
import type { OutputBundle, OutputChunk } from "rollup";

/** The deck's first frame needs every module main.ts loads with import() (engine, sound, the folder modules), so
 *  deck.html announces them up front: they download alongside the entry instead of after it has run, which saves a
 *  whole round trip on a phone (~0.8s on a throttled 4G load). */
export function preloadDeckModules(): Plugin {
  return {
    name: "deck-preload-modules",
    transformIndexHtml: { order: "post", handler(_html, ctx) {
      const entry = ctx.chunk, bundle = ctx.bundle as OutputBundle | undefined;
      if (!entry || !bundle || !ctx.filename.endsWith("deck.html")) return;
      const chunk = (file: string) => bundle[file] as OutputChunk | undefined;
      const have = new Set<string>(), files: string[] = [], css: string[] = [];
      const already = (file: string): void => { if (have.has(file)) return; have.add(file); chunk(file)?.imports.forEach(already); };
      already(entry.fileName); // the entry and its static imports already have tags
      const visit = (file: string): void => {
        if (have.has(file)) return;
        have.add(file); files.push(file);
        const c = chunk(file);
        c?.imports.forEach(visit);
        c?.viteMetadata?.importedCss.forEach((f) => { if (!css.includes(f)) css.push(f); });
      };
      // deck2d's own modules only: the sim and the live connection stay lazy (?source=sim / a signed-in factory)
      const deck2d = (id: string) => id.includes("/src/deck2d/");
      entry.dynamicImports.filter((f) => { const c = chunk(f); return c && (c.facadeModuleId ? deck2d(c.facadeModuleId) : Object.keys(c.modules).some(deck2d)); }).forEach(visit);
      return [
        ...files.map((f) => ({ tag: "link", attrs: { rel: "modulepreload", crossorigin: true, href: `/${f}` }, injectTo: "head" as const })),
        ...css.map((f) => ({ tag: "link", attrs: { rel: "preload", as: "style", crossorigin: true, href: `/${f}` }, injectTo: "head" as const })),
      ];
    } },
  };
}

// The 2D deck (web/deck.html -> src/deck2d/) builds on its own, after the main app, into the same dist/.
// Separate so the static pages (index.html, art, docs) keep their own build; scripts/bundle-budget.ts checks the deck.
export default defineConfig({
  publicDir: false,
  plugins: [preloadDeckModules()],
  build: {
    outDir: "dist",
    emptyOutDir: false,
    manifest: "deck-manifest.json",
    // deckbuild = the construction preview
    rollupOptions: { input: { "deck-ui-review": resolve(__dirname, "deck-ui-review.html"), deck: resolve(__dirname, "deck.html"), launch: resolve(__dirname, "launch.html"), deckbuild: resolve(__dirname, "deckbuild.html"), stations: resolve(__dirname, "stations.html") } }, // stations = the code-drawn machines next to the mockups
  },
});
