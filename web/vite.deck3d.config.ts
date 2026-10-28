import { resolve } from "node:path";
import { defineConfig } from "vite";

// /deck3d.html (src/deck3d/): a time-boxed spike of the deck in real 3D, rendered tiny and upscaled as pixel art.
// Builds on its own like the deck so the main app's entry and chunk budget stay untouched.
export default defineConfig({
  publicDir: false,
  build: {
    outDir: "dist",
    emptyOutDir: false,
    manifest: "deck3d-manifest.json",
    rollupOptions: { input: { deck3d: resolve(__dirname, "deck3d.html") } },
  },
});
