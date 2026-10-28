import { resolve } from "node:path";
import { defineConfig } from "vite";

// /bakeoff.html (src/bakeoff/): the 2D vs 3D art bake-off (mockup | code pixels | tiny 3D render).
// Builds on its own like the deck so the main app's entry and chunk budget stay untouched.
export default defineConfig({
  publicDir: false,
  build: {
    outDir: "dist",
    emptyOutDir: false,
    manifest: "bakeoff-manifest.json",
    rollupOptions: { input: { bakeoff: resolve(__dirname, "bakeoff.html") } },
  },
});
