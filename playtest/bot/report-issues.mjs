// Called only by the explicitly configured staging workflow. Never posts fixture failures.
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
const report = JSON.parse(readFileSync(process.argv[2], "utf8"));
if (report.origin !== "https://shiptorio.dev" || report.fixture !== false) throw new Error("Only staging reports may file bot-bug issues");
const repo = process.env.GITHUB_REPOSITORY;
if (repo !== "r3dbars/shiptorio") throw new Error("Unexpected issue repository");
const gh = args => execFileSync("gh", [...args, "--repo", repo], { encoding: "utf8" });
for (const failure of report.failures.filter(f => !String(f).startsWith("Screen:"))) {
  const normalized = String(failure).replace(/[a-f0-9]{8}-[a-f0-9-]{27,}/gi, "<id>").replace(/\b\d{10,}\b/g, "<time>").slice(0, 1000);
  const hash = createHash("sha256").update(`${report.persona}:${normalized}`).digest("hex").slice(0, 16);
  const marker = `bot-bug:${hash}`;
  const existing = JSON.parse(gh(["issue", "list", "--state", "all", "--search", `${marker} in:title`, "--json", "number"]));
  if (existing.length) continue;
  gh(["label", "create", "bot-bug", "--color", "d73a4a", "--description", "Staging player-bot failure", "--force"]);
  gh(["issue", "create", "--title", `[${marker}] ${report.persona} playtest failure`, "--label", "bot-bug", "--body", `Staging player bot observed:\n\n${normalized}\n\nPersona: ${report.persona}\n\nEvidence: ${process.env.GITHUB_SERVER_URL}/${repo}/actions/runs/${process.env.GITHUB_RUN_ID}\n\nScreenshots and report are in the bot-evidence artifact. This is a staging observation, not production proof.`]);
}
