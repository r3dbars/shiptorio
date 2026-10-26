import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// `bun run dev:web` serves the UI on :5173 and proxies the API + websockets to `wrangler dev` on :8787.
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/api": { target: "http://localhost:8787", ws: true },
      "/auth": "http://localhost:8787",
    },
  },
});
