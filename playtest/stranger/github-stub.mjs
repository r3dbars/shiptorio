// A pretend GitHub for the stranger dry run (docs/context/new-user-path.md). Two halves share one state:
// `outbound` answers the Worker's own fetches (token exchange, /user, installations, repo tree, issues),
// `browser` answers the pages a player's browser visits on github.com (authorize, install the App).
// The stranger is a brand-new account: no Shiptorio row, no installation, one repo of their own.

import { createHmac } from "node:crypto";

export function githubStub({ origin, webhookSecret, worker }) {
  const state = {
    user: { id: 4242001, login: "fresh-stranger", name: "Fresh Stranger", avatar_url: null },
    repo: "fresh-stranger/lemonade-stand",
    repoId: 4242999, // stable numeric identity supplied by actual GitHub repository responses/webhooks
    installation: null, // set when the stranger clicks Install on the fake GitHub page
    calls: [],
  };
  const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  const issues = [
    { number: 1, title: "Checkout total ignores the SAVE10 code", body: "Cart total stays the same after applying SAVE10.", state: "open", html_url: `https://github.com/${state.repo}/issues/1`, updated_at: "2026-10-26T12:00:00Z", user: { login: "a-customer" }, labels: [{ name: "bug" }] },
    { number: 2, title: "README says npm, the project uses bun", body: "Docs fix.", state: "open", html_url: `https://github.com/${state.repo}/issues/2`, updated_at: "2026-10-26T12:00:00Z", user: { login: "a-customer" }, labels: [{ name: "documentation" }] },
  ];
  const tree = ["README.md", "package.json", "src/cart.ts", "src/format.ts", "src/index.ts", "test/cart.test.ts", "test/format.test.ts", ".github/workflows/ci.yml"]
    .map((path) => ({ path, type: "blob", size: 400 }));

  async function outbound(request) {
    const url = new URL(request.url);
    state.calls.push(`${request.method} ${url.host}${url.pathname}`);
    const p = url.pathname;
    if (url.host === "github.com" && p === "/login/oauth/access_token") return json({ access_token: "gho_stub_user_token", token_type: "bearer" });
    if (url.host !== "api.github.com") return new Response("blocked by the stranger stub", { status: 599 });
    if (p === "/user") return json(state.user);
    if (p === "/user/installations") return json({ total_count: state.installation ? 1 : 0, installations: state.installation ? [{ id: state.installation, account: { login: state.user.login } }] : [] });
    if (p === `/user/installations/${state.installation}/repositories`) return json({ total_count: 1, repositories: [{ id: state.repoId, full_name: state.repo, default_branch: "main" }] });
    if (p === "/app") return json({ slug: "shiptorio-stub" });
    if (/^\/app\/installations\/\d+\/access_tokens$/.test(p)) return json({ token: "ghs_stub_installation_token", expires_at: new Date(Date.now() + 3600e3).toISOString() }, 201);
    // Production revalidates the signed-in user's current repo permission before listing/opening it.
    // Authenticate this lookup too: the stub must not make missing memberships look authorized.
    if (p === `/repos/${state.repo}/collaborators/${state.user.login}/permission`) {
      if (!state.installation || request.headers.get("authorization") !== "Bearer ghs_stub_installation_token") return json({ message: "Forbidden (stub)" }, 403);
      return json({ permission: "admin", user: { id: state.user.id, login: state.user.login } });
    }
    if (p === `/repos/${state.repo}/installation`) return state.installation ? json({ id: state.installation }) : json({ message: "Not Found" }, 404);
    if (p === `/repos/${state.repo}`) return json({ id: state.repoId, full_name: state.repo, default_branch: "main" });
    if (p.startsWith(`/repos/${state.repo}/git/trees/`)) return json({ sha: "stubtree", tree, truncated: false });
    if (p.startsWith(`/repos/${state.repo}/git/ref/heads/`)) return json({ object: { sha: "stubsha" } });
    if (p === `/repos/${state.repo}/issues`) return json(url.searchParams.get("page") === "1" || !url.searchParams.get("page") ? issues : []);
    const one = p.match(new RegExp(`^/repos/${state.repo}/issues/(\\d+)$`));
    if (one) return json(issues.find((i) => i.number === Number(one[1])) ?? {}, 200);
    if (/\/issues\/\d+\/(comments|reactions)$/.test(p)) return request.method === "POST" ? json({ id: 1 }, 201) : json([]);
    if (/\/pulls$/.test(p) || /\/check-runs$/.test(p) || /\/status$/.test(p)) return json([]);
    return json({ message: "Not Found (stub)" }, 404);
  }

  // GitHub tells the App about the install with a signed webhook, like the real one.
  async function sendInstallWebhook() {
    const body = JSON.stringify({
      action: "created",
      installation: { id: state.installation, account: { login: state.user.login } },
      repositories: [{ id: state.repoId, full_name: state.repo }],
      sender: { id: state.user.id, login: state.user.login },
    });
    const sig = "sha256=" + createHmac("sha256", webhookSecret).update(body).digest("hex");
    const res = await worker(`${origin}/webhooks/github`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-github-event": "installation", "x-github-delivery": `stub-install-${Date.now()}`, "x-hub-signature-256": sig },
      body,
    });
    if (res.status >= 300) throw new Error(`install webhook rejected: ${res.status} ${await res.text()}`);
  }

  // Pages on github.com, served to the browser through page.route.
  async function browser(route) {
    const url = new URL(route.request().url());
    if (url.pathname === "/login/oauth/authorize") {
      const back = new URL(url.searchParams.get("redirect_uri"));
      back.searchParams.set("code", "stub-code");
      back.searchParams.set("state", url.searchParams.get("state"));
      return route.fulfill({ status: 302, headers: { location: back.toString() } });
    }
    if (/^\/apps\/[\w-]+\/installations\/new$/.test(url.pathname)) {
      return route.fulfill({
        status: 200,
        contentType: "text/html",
        body: `<!doctype html><title>Install Shiptorio · GitHub</title><h1>Install Shiptorio</h1>
<p>Only select repositories: <b>${state.repo}</b></p>
<form method="post" action="/apps/shiptorio-stub/installations/confirm"><button>Install</button></form>`,
      });
    }
    if (url.pathname === "/apps/shiptorio-stub/installations/confirm") {
      state.installation = 99001;
      await sendInstallWebhook();
      // With a Setup URL set on the App, GitHub sends the player back. Without one it leaves them on
      // the installation's settings page (what production does today, see new-user-path.md).
      const back = state.setupUrl ? `${state.setupUrl}?installation_id=${state.installation}&setup_action=install` : `https://github.com/settings/installations/${state.installation}`;
      return route.fulfill({ status: 302, headers: { location: back } });
    }
    if (url.pathname.startsWith("/settings/installations/")) {
      return route.fulfill({ status: 200, contentType: "text/html", body: `<!doctype html><title>Shiptorio · Installed GitHub App</title><h1>Shiptorio</h1><p>Installed on ${state.repo}.</p>` });
    }
    return route.fulfill({ status: 404, body: "stub github: " + url.pathname });
  }

  return { state, outbound, browser };
}
