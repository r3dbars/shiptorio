import { createServer } from "node:http";
import { readFileSync, realpathSync, statSync } from "node:fs";
import { dirname, extname, isAbsolute, relative, resolve } from "node:path";
import { gzipSync } from "node:zlib";

const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".woff2": "font/woff2" };
const contained = (root, path) => {
  const rel = relative(root, path);
  return !isAbsolute(rel) && rel !== ".." && !rel.startsWith("../");
};

/** A local benchmark serves only canonical files inside its build root. */
export function benchmarkServer(dist) {
  const root = realpathSync(dist);
  return createServer((req, res) => {
    try {
      let pathname;
      try { pathname = decodeURIComponent((req.url ?? "/").split("?")[0]); }
      catch { res.writeHead(400).end(); return; }
      if (!pathname.startsWith("/") || /[\\\x00]/.test(pathname)) { res.writeHead(400).end(); return; }
      let path = resolve(root, "." + pathname);
      if (!contained(root, path)) { res.writeHead(403).end(); return; }
      try {
        path = realpathSync(path);
        if (!contained(root, path)) { res.writeHead(403).end(); return; }
        if (statSync(path).isDirectory()) path = realpathSync(resolve(root, "index.html"));
      } catch (error) {
        if (error.code !== "ENOENT" && error.code !== "ENOTDIR") throw error;
        // A missing child of an escaping symlink must not become a SPA fallback.
        let parent = dirname(path);
        for (;;) {
          try {
            if (!contained(root, realpathSync(parent))) { res.writeHead(403).end(); return; }
            break;
          } catch (error) {
            if (error.code !== "ENOENT" && error.code !== "ENOTDIR") throw error;
            const next = dirname(parent);
            if (next === parent) throw error;
            parent = next;
          }
        }
        path = realpathSync(resolve(root, "index.html"));
      }
      if (!contained(root, path) || !statSync(path).isFile()) { res.writeHead(403).end(); return; }
      const body = readFileSync(path);
      const type = TYPES[extname(path)] ?? "application/octet-stream";
      const zip = /text|javascript|json|svg/.test(type);
      res.writeHead(200, { "content-type": type, ...(zip ? { "content-encoding": "gzip" } : {}) });
      res.end(zip ? gzipSync(body) : body);
    } catch { res.writeHead(404).end(); }
  }).listen(0, "127.0.0.1");
}
