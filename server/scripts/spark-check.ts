// Quick check that Muse Spark answers: `META_API_KEY=... bun run spark:check` from the repo root.
import { heuristicTriage, sparkChat, triage } from "../src/spark";

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
