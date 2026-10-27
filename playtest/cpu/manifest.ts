// Private fixture protocol only. No production entry imports this module.
export const CPU_PATH = "/api/repos/test-fixture/test-newbie/cpu-probe";
export const CPU_PERSONA = "test-newbie";
export const CPU_REPO = "test-fixture/test-newbie";
export const CPU_REPO_ID = 999001;
export const CPU_INSTALLATION = 18001;
export const CPU_OPERATIONS = ["webhook", "heartbeat", "claim", "tick"] as const;
export type CpuOperation = typeof CPU_OPERATIONS[number];
export interface CpuSample { runId: string; operation: CpuOperation; sample: number }
export function validRun(value: unknown): value is string {
  return typeof value === "string" && /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(value);
}
export function sampleInput(value: unknown): CpuSample | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  return validRun(v.runId) && CPU_OPERATIONS.includes(v.operation as CpuOperation) && Number.isInteger(v.sample) && Number(v.sample) >= 0 && Number(v.sample) < 300
    ? { runId: v.runId, operation: v.operation as CpuOperation, sample: Number(v.sample) } : null;
}
export function fixtureIssue() {
  return { action: "opened", repository: { id: CPU_REPO_ID, full_name: CPU_REPO, default_branch: "main" }, installation: { id: CPU_INSTALLATION },
    issue: { number: 101, title: "Fixture cart regression", body: "The fixture cart total does not apply SAVE10.", html_url: `https://github.com/${CPU_REPO}/issues/101`, state: "open", author_association: "OWNER", user: { login: CPU_PERSONA, type: "User" }, labels: [] },
    sender: { id: -9001, login: CPU_PERSONA } };
}
