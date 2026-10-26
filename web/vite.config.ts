import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";
import { docsSite } from "./docs-site";

// The art pages live in docs/ (one source of truth) and are served at /art/ on the site.
const ART: Record<string, string> = {
  "art/item-lab.html": "../docs/item-lab.html",
  "art/prototype.html": "../docs/art-prototype.html",
  "art/spark.html": "../docs/spark.html", // judge-facing: how Meta Muse Spark runs the factory
  "art/index.html": "art.html",
};

function artPages(): Plugin {
  const read = (file: string) => readFileSync(resolve(__dirname, ART[file]), "utf8");
  return {
    name: "shiptorio-art",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const path = req.url?.split("?")[0].replace(/^\//, "").replace(/^art\/?$/, "art/index.html") ?? "";
        if (!(path in ART)) return next();
        res.setHeader("content-type", "text/html; charset=utf-8");
        res.end(read(path));
      });
    },
    generateBundle() {
      for (const fileName of Object.keys(ART)) this.emitFile({ type: "asset", fileName, source: read(fileName) });
    },
  };
}

// `bun run dev:web` serves the UI on :5173 and proxies the API + websockets to `wrangler dev` on :8787.
export default defineConfig({
  plugins: [react(), artPages(), docsSite()],
  build: {
    rollupOptions: {
      output: {
        // vendors in their own chunks: we deploy many times a day, and three + react don't change,
        // so a returning player only re-downloads the game code
        manualChunks(id) {
          if (id.includes("node_modules/three/") || id.includes("node_modules/.bun/three@")) return "three";
          if (/node_modules\/(\.bun\/)?(react|react-dom|scheduler)[@/]/.test(id)) return "react";
        },
      },
    },
  },
  server: {
    proxy: {
      "/api": { target: "http://localhost:8787", ws: true },
      "/auth": "http://localhost:8787",
    },
  },
});
