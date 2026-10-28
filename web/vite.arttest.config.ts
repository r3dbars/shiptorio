import { resolve } from "node:path";
import { defineConfig } from "vite";

// /arttest.html (src/arttest/): a throwaway images-vs-code-vs-hybrid comparison for the 2D deck art.
// Builds on its own like the deck so the main app's entry and chunk budget stay untouched.
export default defineConfig({
  publicDir: false,
  build: {
    outDir: "dist",
    emptyOutDir: false,
    manifest: "arttest-manifest.json",
    rollupOptions: { input: { arttest: resolve(__dirname, "arttest.html") } },
  },
});
