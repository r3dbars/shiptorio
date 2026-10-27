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
  "art/black-iron.html": "../docs/black-iron.html", // the chosen look: Black Iron line with the real work journey
  "art/cogworks.html": "../docs/cogworks-variations.html",
  "art/dioramas.html": "../docs/dioramas.html",
  "art/style-lab.html": "../docs/style-lab.html",
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

// The default map needs these assets before it can draw. Start their transfers with
// the HTML instead of waiting for React -> FactoryMap -> ShaftScene -> art imports.
function shaftPreloads(): Plugin {
  return {
    name: "shiptorio-shaft-preloads",
    transformIndexHtml: {
      order: "post",
      handler(_html, context) {
        if (!context.bundle) return;
        return Object.values(context.bundle)
          .filter((entry) => entry.type === "chunk" && Object.keys(entry.modules).some((id) =>
            /\/web\/src\/map\/shaft\/(ShaftScene\.ts|modules\/[^/]+\.js)$/.test(id)))
          .map((entry) => ({ tag: "link", attrs: { rel: "modulepreload", href: `/${entry.fileName}`, crossorigin: "" }, injectTo: "head" as const }));
      },
    },
  };
}

// `bun run dev:web` serves the UI on :5173 and proxies the API + websockets to `wrangler dev` on :8787.
export default defineConfig({
  plugins: [react(), artPages(), docsSite(), shaftPreloads()],
  build: {
    manifest: true,
    rollupOptions: {
      output: {
        onlyExplicitManualChunks: true,
        // vendors in their own chunks: we deploy many times a day, and three + react don't change,
        // so a returning player only re-downloads the game code
        manualChunks(id) {
          if (id.includes("node_modules/three/") || id.includes("node_modules/.bun/three@")) return "three";
          if (/node_modules\/(\.bun\/)?(react|react-dom|scheduler)[@/]/.test(id)) return "react";
          // Assign only code: putting entry CSS in the factory chunk would make the
          // recovery bootstrap statically import the very chunk it must recover.
          if (!/\.[cm]?[jt]sx?(?:\?|$)/.test(id)) return;
          // Keep the core together for gzip efficiency, without promoting route-only pages,
          // idle panels or shaft art into startup. A forest of tiny shared chunks costs more
          // transfer bytes and dependency round trips on a cold phone connection.
          if (/\/web\/src\/(main\.tsx|chunkReload\.ts)$/.test(id)) return;
          // These two pure layout helpers are also used by the initial station panel.
          if (/\/web\/src\/map\/shaft\/(waiting|plan)\.ts$/.test(id)) return "factory";
          if (/\/web\/src\/(judge\/|lab\/|map\/shaft\/|ui\/(Onboarding|IslandBackdrop|CheckIn|HowItThinks)\.tsx$|sound\/foundryPlayer\.ts$|source\/live\.ts$)/.test(id)) return;
          if (/\/(web|shared|server)\/src\//.test(id) || /node_modules\/(\.bun\/)?(@sentry|zod)[/@]/.test(id)) return "factory";
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
