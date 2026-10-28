import { resolve } from "node:path";
import { defineConfig } from "vite";

// The 2D deck (web/deck.html -> src/deck2d/) builds on its own, after the main app, into the same dist/.
// Separate so the main app's entry and chunking stay exactly as they are (scripts/bundle-budget.ts checks them).
export default defineConfig({
  publicDir: false,
  build: {
    outDir: "dist",
    emptyOutDir: false,
    manifest: "deck-manifest.json",
    // deckbuild = the construction preview
    rollupOptions: { input: { deck: resolve(__dirname, "deck.html"), launch: resolve(__dirname, "launch.html"), deckbuild: resolve(__dirname, "deckbuild.html"), stations: resolve(__dirname, "stations.html") } }, // stations = the code-drawn machines next to the mockups
  },
});
