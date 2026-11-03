// The public landing page at shiptorio.com (web/public/welcome/). See access.ts publicRoute for what's open.
// security.ts adds the site-wide CSP, so the page keeps its script in /welcome/landing.js (no inline JS).

/** "/" is the app for anyone with the preview cookie, so the landing copy must not be cached. */
export async function landingPage(request: Request, assets: Fetcher): Promise<Response> {
  const page = await assets.fetch(new Request(new URL("/welcome/", request.url), { method: request.method }));
  const response = new Response(page.body, page);
  response.headers.set("cache-control", "no-cache");
  response.headers.set("vary", "cookie");
  return response;
}

export async function publicFile(request: Request, assets: Fetcher): Promise<Response> {
  const file = await assets.fetch(request);
  const response = new Response(file.body, file);
  if (response.ok) response.headers.set("cache-control", "public, max-age=3600");
  return withRange(request, response);
}

/** Safari won't play a video unless the server answers byte ranges, so slice full asset responses. */
export async function withRange(request: Request, response: Response): Promise<Response> {
  const range = request.headers.get("range")?.match(/^bytes=(\d*)-(\d*)$/);
  if (!range || response.status !== 200 || request.method !== "GET") return response;
  const body = new Uint8Array(await response.arrayBuffer());
  const size = body.length;
  let start = range[1] ? Number(range[1]) : size - Number(range[2]);
  let end = range[1] && range[2] ? Math.min(Number(range[2]), size - 1) : size - 1;
  if (!range[1] && !range[2]) start = 0;
  if (start < 0) start = 0;
  const headers = new Headers(response.headers);
  headers.set("accept-ranges", "bytes");
  if (start >= size || start > end) {
    headers.set("content-range", `bytes */${size}`);
    return new Response(null, { status: 416, headers });
  }
  headers.set("content-range", `bytes ${start}-${end}/${size}`);
  headers.set("content-length", String(end - start + 1));
  return new Response(body.slice(start, end + 1), { status: 206, headers });
}

/** /judge is the public way in for hackathon judges on every host: the deck's story, a local simulation that needs no
 *  account. Explicit rewrite: Workers Assets does not assume an SPA fallback for /judge. */
export async function judgePage(request: Request, assets: Fetcher): Promise<Response> {
  const page = await assets.fetch(new Request(new URL("/deck.html", request.url), { method: request.method }));
  const response = new Response(page.body, page);
  response.headers.set("cache-control", "no-store");
  return response;
}
