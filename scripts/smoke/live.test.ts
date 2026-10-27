import { expect, test } from "bun:test";
import { smoke } from "./live";

const sha = "a".repeat(40);
test("live smoke accepts healthy routes and rejects each deployment regression", async () => {
  let broken = "";
  let versionRequests = 0;
  const server = Bun.serve({ port: 0, fetch(request) {
    const url = new URL(request.url);
    if (url.pathname === "/api/version") {
      versionRequests++;
      return Response.json({ commit: broken === "version" ? "b".repeat(40) : sha });
    }
    if (url.pathname === "/access" && request.method === "POST") {
      expect(request.headers.get("origin")).toBe(url.origin);
      expect(request.headers.get("content-type")).toBe("application/x-www-form-urlencoded");
      return new Response("wrong password", { status: broken === "post" ? 500 : broken === "post403" ? 403 : 401 });
    }
    if (url.pathname === "/access") return new Response(broken === "form" ? "Missing form" : '<form method="post" action="/access"><input name="password" type="password"></form>', { status: broken === "get" ? 500 : 200 });
    if (url.pathname === "/auth/login") return new Response(null, { status: broken === "login200" ? 200 : 302,
      headers: { location: broken === "loginHost" ? "https://github.com.attacker.example/" : "https://github.com/login/oauth/authorize" } });
    if (url.pathname === "/api/repos") return new Response(null, { status: broken === "private" ? 200 : 401 });
    if (url.search) return new Response(null, { status: broken === "gate" ? 200 : 401 });
    return new Response(null, { status: broken === "landing" ? 500 : 200 });
  } });
  try {
    await smoke(server.url.origin, sha, 1, 0);
    for (broken of ["get", "form", "post", "post403", "login200", "loginHost", "private", "gate", "landing", "version"]) {
      await expect(smoke(server.url.origin, sha, 1, 0)).rejects.toThrow();
    }
    versionRequests = 0;
    await expect(smoke(server.url.origin, sha, 3, 0)).rejects.toThrow("/api/version");
    expect(versionRequests).toBe(3);
  } finally { await server.stop(true); }
});
