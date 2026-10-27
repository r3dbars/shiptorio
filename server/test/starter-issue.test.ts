import { describe, expect, it } from "bun:test";
import type { Env } from "../src/index";
import { fileStarter, findStarter, pickStarterIssue, STARTER_ISSUE, STARTER_LABEL, starterIssueRoutes, type StarterIssue } from "../src/starterIssue";

const issue = (number: number, title: string, extra: Partial<StarterIssue> = {}): StarterIssue =>
  ({ number, title, html_url: `https://github.com/acme/app/issues/${number}`, state: "open", body: "", labels: [], ...extra });
const labels = (...names: string[]) => names.map(name => ({ name }));

describe("pickStarterIssue", () => {
  it("prefers good first issues, then the shortest body", () => {
    const pick = pickStarterIssue([
      issue(3, "Fix README typo", { body: "x".repeat(40) }),
      issue(7, "Add a dark mode toggle", { labels: labels("good first issue"), body: "x".repeat(300) }),
      issue(9, "Rename a button", { labels: labels("Good First Issue"), body: "x".repeat(20) }),
    ]);
    expect(pick).toEqual({ number: 9, title: "Rename a button", url: "https://github.com/acme/app/issues/9", reason: "Start with #9. Smallest and safest." });
  });

  it("picks an open starter issue first, so a double tap never files twice", () => {
    const pick = pickStarterIssue([
      issue(2, "Tiny fix", { labels: labels("good first issue") }),
      issue(5, STARTER_ISSUE.title, { labels: labels(STARTER_LABEL), user: { login: "shiptorio[bot]", type: "Bot" }, body: STARTER_ISSUE.body }),
    ]);
    expect(pick?.number).toBe(5);
    expect(pick?.reason).toBe("Your starter issue #5 is ready.");
  });

  it("skips risky, big, claimed, bot and pull-request issues", () => {
    expect(pickStarterIssue([
      issue(1, "Docs: rotate the signing key", { labels: labels("security") }),
      issue(2, "Update docs for v2", { labels: labels("documentation", "breaking") }),
      issue(3, "Rewrite the docs site", { labels: labels("docs"), body: "x".repeat(5000) }),
      issue(4, "Fix README typo", { assignees: [{ login: "dana" }] }),
      issue(5, "README typo", { user: { login: "dependabot[bot]", type: "Bot" } }),
      issue(6, "README link", { pull_request: {} }),
      issue(7, "Docs question: how do I deploy?", { labels: labels("question") }),
    ])).toBeNull();
  });

  it("needs a safe label or a docs-shaped title", () => {
    expect(pickStarterIssue([issue(4, "Checkout crashes on Safari"), issue(8, "Add caching to the API")])).toBeNull();
    expect(pickStarterIssue([issue(4, "Checkout crashes on Safari"), issue(8, "Fix a typo in CONTRIBUTING")])?.number).toBe(8);
    expect(pickStarterIssue([issue(4, "Checkout copy is off", { labels: labels("size/xs") })])?.number).toBe(4);
  });

  it("ranks a 'docs only' body above a docs-sounding bug report", () => {
    expect(pickStarterIssue([
      issue(3, "Typo in the receipt docs: $12.05 reads as $12.5", { body: "Shows $12.5 for $12.05." }),
      issue(10, "Start a changelog", { body: "Add CHANGELOG.md with an Unreleased section. Docs only." }),
    ])?.number).toBe(10);
  });

  it("ties go to the oldest issue", () => {
    expect(pickStarterIssue([issue(12, "README typo"), issue(10, "README typo")])?.number).toBe(10);
  });
});

type Request = { path: string; init?: RequestInit };
function fakeGitHub(responses: Record<string, unknown>) {
  const requests: Request[] = [];
  const call = async <T>(path: string, init?: RequestInit): Promise<T> => {
    requests.push({ path, init });
    const key = `${init?.method ?? "GET"} ${path}`;
    if (!(key in responses)) throw new Error(`unexpected ${key}`);
    const value = responses[key];
    if (value instanceof Error) throw value;
    return value as T;
  };
  return { call, requests };
}

describe("findStarter", () => {
  it("returns the picked issue", async () => {
    const { call } = fakeGitHub({ "GET /repos/acme/app/issues?state=open&per_page=50&page=1": [issue(4, "Fix README typo")] });
    expect(await findStarter(call, "acme/app")).toEqual({ kind: "existing", issue: { number: 4, title: "Fix README typo", url: "https://github.com/acme/app/issues/4", reason: "Start with #4. Smallest and safest." } });
  });

  it("offers the starter README issue when nothing is safe, without filing anything", async () => {
    const { call, requests } = fakeGitHub({ "GET /repos/acme/app/issues?state=open&per_page=50&page=1": [issue(4, "Checkout crashes")] });
    expect(await findStarter(call, "acme/app")).toEqual({ kind: "starter", offer: { ...STARTER_ISSUE, label: STARTER_LABEL } });
    expect(requests.every(r => !r.init?.method || r.init.method === "GET")).toBe(true);
  });
});

describe("fileStarter", () => {
  it("files the starter issue with its label", async () => {
    const { call, requests } = fakeGitHub({
      [`GET /repos/acme/app/issues?state=open&labels=${STARTER_LABEL}&per_page=10`]: [],
      "POST /repos/acme/app/labels": new Error("422 already exists"),
      "POST /repos/acme/app/issues": issue(21, STARTER_ISSUE.title),
    });
    expect(await fileStarter(call, "acme/app")).toEqual({ number: 21, title: STARTER_ISSUE.title, url: "https://github.com/acme/app/issues/21", reason: "Filed #21. That's your first job.", created: true });
    const sent = JSON.parse(requests.at(-1)!.init!.body as string);
    expect(sent).toEqual({ title: STARTER_ISSUE.title, body: STARTER_ISSUE.body, labels: [STARTER_LABEL] });
  });

  it("returns the open starter issue instead of filing another", async () => {
    const { call, requests } = fakeGitHub({
      [`GET /repos/acme/app/issues?state=open&labels=${STARTER_LABEL}&per_page=10`]: [issue(21, STARTER_ISSUE.title, { labels: labels(STARTER_LABEL) })],
    });
    expect((await fileStarter(call, "acme/app")).created).toBe(false);
    expect(requests).toHaveLength(1);
  });
});

describe("starter issue route", () => {
  const env = { GITHUB_APP_ID: "1" } as Env;
  const setup = (room: string | null = null) => {
    const github = fakeGitHub({
      "GET /repos/acme/app/issues?state=open&per_page=50&page=1": [],
      [`GET /repos/acme/app/issues?state=open&labels=${STARTER_LABEL}&per_page=10`]: [],
      "POST /repos/acme/app/labels": {},
      "POST /repos/acme/app/issues": issue(21, STARTER_ISSUE.title),
    });
    const app = starterIssueRoutes({ call: async () => github.call, plannerRoom: async () => room });
    const post = (body: string) => app.request("/api/repos/Acme/App/starter-issue", { method: "POST", body }, env);
    return { app, github, post };
  };

  it("GET offers the starter and files nothing", async () => {
    const { app, github } = setup();
    const res = await app.request("/api/repos/acme/app/starter-issue", {}, env);
    expect(res.status).toBe(200);
    expect((await res.json() as { kind: string }).kind).toBe("starter");
    expect(github.requests.some(r => r.init?.method === "POST")).toBe(false);
  });

  it("POST files only on an explicit tap", async () => {
    const { github, post } = setup();
    expect((await post("{}")).status).toBe(400);
    expect((await post('{"tapped":"yes"}')).status).toBe(400);
    expect(github.requests).toHaveLength(0);
    const res = await post('{"tapped":true}');
    expect(res.status).toBe(201);
    expect((await res.json() as { number: number }).number).toBe(21);
  });

  it("POST respects the planner budget", async () => {
    const { github, post } = setup("The planner is out of budget for today. Try again tomorrow.");
    const res = await post('{"tapped":true}');
    expect(res.status).toBe(429);
    expect(await res.json()).toEqual({ error: "The planner is out of budget for today. Try again tomorrow." });
    expect(github.requests).toHaveLength(0);
  });

  it("says so when the GitHub App isn't set up", async () => {
    const app = starterIssueRoutes({ call: async () => { throw new Error("no"); }, plannerRoom: async () => null });
    expect((await app.request("/api/repos/acme/app/starter-issue", {}, {} as Env)).status).toBe(503);
  });
});
