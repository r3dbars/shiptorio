import { expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";

type Step = { uses?: string; with?: Record<string, unknown> };
type Job = { permissions?: Record<string, string>; steps?: Step[] };
type Workflow = { on: Record<string, unknown>; permissions: Record<string, string>; jobs: Record<string, Job> };
const directory = new URL("../.github/workflows/", import.meta.url);
const workflows = readdirSync(directory).filter((name) => /\.ya?ml$/.test(name)).map((name) => {
  const source = readFileSync(new URL(name, directory), "utf8");
  return { name, source, workflow: Bun.YAML.parse(source) as Workflow };
});

test("workflow actions are immutable and checkout leaves no Git credential behind", () => {
  expect(workflows.length).toBeGreaterThan(0);
  for (const { name, workflow } of workflows) {
    for (const [jobName, job] of Object.entries(workflow.jobs)) {
      for (const step of job.steps ?? []) {
        if (!step.uses) continue;
        expect(step.uses, `${name}/${jobName}: pin external actions to a commit`).toMatch(/^[\w-]+\/[\w./-]+@[a-f0-9]{40}$/);
        if (step.uses.startsWith("actions/checkout@")) {
          expect(step.with?.["persist-credentials"], `${name}/${jobName}: do not expose the checkout token to repo scripts`).toBe(false);
        }
      }
    }
  }
});

test("PR code has read-only tokens, no deployment secrets and no privileged event context", () => {
  for (const { name, source, workflow } of workflows) {
    // Privileged PR/workflow-completion contexts need a separate security design.
    expect(workflow.on, name).not.toHaveProperty("pull_request_target");
    expect(workflow.on, name).not.toHaveProperty("workflow_run");
    expect(workflow.permissions?.contents, name).toBe("read");
    for (const access of Object.values(workflow.permissions)) expect(["read", "none"], name).toContain(access);
    if (!("pull_request" in workflow.on)) continue;
    expect(source, `${name}: no secrets in a workflow that executes PR code`).not.toMatch(/\bsecrets\s*(?:\.|\[)/);
    for (const [jobName, job] of Object.entries(workflow.jobs)) {
      for (const [scope, access] of Object.entries(job.permissions ?? workflow.permissions)) {
        if (name === "codeql.yml" && jobName === "analyze" && scope === "security-events") {
          expect(access).toBe("write"); // CodeQL's SARIF upload only.
        } else if (name === "ci.yml" && jobName === "full-suite" && scope === "statuses") {
          // Posts release-validation after the other jobs pass. It never checks out or runs
          // PR code, and fork PRs get a read-only token whatever the workflow asks for.
          expect(access).toBe("write");
          const steps = (job as { steps: { uses?: string; run?: string }[] }).steps;
          expect(steps.some(step => step.uses), "full-suite uses no actions (no checkout)").toBe(false);
          expect(steps.map(step => step.run?.trim().split(/\s+/).slice(0, 2).join(" ")), "full-suite only posts a status").toEqual(["gh api"]);
        } else {
          expect(["read", "none"], `${name}/${jobName}/${scope}`).toContain(access);
        }
      }
    }
  }
});
