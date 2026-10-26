// Quick check that Muse Spark answers: `META_API_KEY=... bun run spark:check` from the repo root.
import { gameMaster, heuristicTriage, judgeOrbit, judgePermit, pickResearch, sparkChat, triage } from "../src/spark";

const env = { META_API_KEY: process.env.META_API_KEY, SPARK_MODEL: process.env.SPARK_MODEL, SPARK_BASE_URL: process.env.SPARK_BASE_URL };
if (!env.META_API_KEY) {
  console.error("set META_API_KEY first");
  process.exit(1);
}

const t0 = Date.now();
console.log("ping:", await sparkChat(env, [{ role: "user", content: "Reply with exactly: the factory must grow" }], "minimal"));
console.log(`  ${Date.now() - t0} ms`);

const issue = { title: "Checkout button does nothing on Safari", body: "Clicking Pay in web/checkout just spins.", labels: ["bug"] };
const districts = ["/", "web", "server", "docs"];
console.log("triage:", await triage(env, issue, districts), "heuristic:", heuristicTriage(issue.title, issue.labels, districts));

// The testbed's trick issue: the title says docs, the bug is in code. Spark should say src; the keyword rule says docs.
const trick = { title: "Typo in the receipt docs: $12.05 reads as $12.5", body: "The receipt prints $12.5 for a $12.05 order. formatCents in src/format.ts looks wrong.", labels: [] };
console.log("triage (trick):", await triage(env, trick, ["/", "src", "test", "docs"]), "heuristic:", heuristicTriage(trick.title, [], ["/", "src", "test", "docs"]));

const timed = async <T>(name: string, run: () => Promise<T>) => { const t = Date.now(); try { console.log(`${name}:`, await run(), `${Date.now() - t} ms`); } catch (e) { console.log(`${name}: FAILED`, (e as Error).message); } };
await timed("game master", () => gameMaster(env, {
  bottleneck: { stage: "pad", stationId: "gate-1", wip: 2, ageMinutes: 45, valueAtRisk: 8, summary: "2 items waiting on you to launch." }, stages: [], items: [], playerFeedback: "{}",
  cards: [
    { id: "launch-4", title: "Launch #4: fix SAVE10 discount", why: "Every station passed.", kind: "ship", options: [{ id: "launch", label: "Launch", recommended: true }, { id: "later", label: "Later", recommended: false }] },
    { id: "research", title: "Research Leftover sweeper?", why: "CI sent back 3 PRs for console.log.", kind: "verify", options: [{ id: "research", label: "Research", recommended: true }, { id: "not_yet", label: "Not yet", recommended: false }] },
  ],
}));
await timed("orbit (unrelated)", () => judgeOrbit(env, { launch: { pr: 4, title: "Fix SAVE10 discount", district: "src", files: ["src/cart.ts", "test/cart.test.ts"], launchedMinutesAgo: 50 }, error: { title: "TypeError: fetch failed (fonts.example.com)", district: "src", events: 6, firstSeenMinutesAfterLaunch: 30 } }));
await timed("research", () => pickResearch(env, { scars: [{ station: "ci", reason: "console.log left in cart.ts" }, { station: "review", reason: "Debug print left in format.ts" }, { station: "verify", reason: "No test fails on base" }], techs: [{ id: "leftovers", name: "Leftover sweeper", what: "Sweeps PRs for console.log and debugger", cost: 2, affordable: true }, { id: "secrets", name: "Secret scanner", what: "Blocks API keys in diffs", cost: 3, affordable: true }] }));
await timed("permit", () => judgePermit(env, { lane: "docs", streak: 5, need: 5, ships: [{ title: "Fix README typo" }, { title: "Use bun in setup docs" }], openRisks: [] }));
