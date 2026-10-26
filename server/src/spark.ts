// Muse Spark on Meta Model API (OpenAI-compatible chat completions).
// Spark runs the floor: triage, routing, and the hosted assembler's code edits.

import type { ItemKind } from "@shiptorio/shared";
import type { FileChange } from "./github";

export interface SparkEnv {
  META_API_KEY?: string;
  SPARK_BASE_URL?: string;
  SPARK_MODEL?: string;
}

type Effort = "minimal" | "low" | "medium" | "high" | "xhigh";

interface ChatMessage {
  role: "developer" | "user" | "assistant";
  content: string;
}

export class SparkError extends Error {}

export function sparkConfigured(env: SparkEnv): boolean {
  return !!env.META_API_KEY;
}

export async function sparkChat(env: SparkEnv, messages: ChatMessage[], effort: Effort = "low"): Promise<string> {
  if (!env.META_API_KEY) throw new SparkError("META_API_KEY isn't set");
  const base = (env.SPARK_BASE_URL || "https://api.meta.ai/v1").replace(/\/$/, "");
  const res = await fetch(`${base}/chat/completions`, {
    method: "POST",
    headers: { authorization: `Bearer ${env.META_API_KEY}`, "content-type": "application/json" },
    body: JSON.stringify({ model: env.SPARK_MODEL || "muse-spark-1.3", messages, reasoning_effort: effort }),
  });
  if (!res.ok) throw new SparkError(`Spark ${res.status}: ${(await res.text()).slice(0, 500)}`);
  const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  const text = data.choices?.[0]?.message?.content;
  if (!text) throw new SparkError("Spark returned no content");
  return text;
}

// Pulls the first JSON object out of a reply, tolerating ```json fences and chatter around it.
export function parseJsonReply<T>(text: string): T {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = fenced ? fenced[1] : text;
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  if (start === -1 || end <= start) throw new SparkError(`expected JSON, got: ${text.slice(0, 200)}`);
  return JSON.parse(body.slice(start, end + 1)) as T;
}

async function sparkJson<T>(env: SparkEnv, developer: string, user: string, effort: Effort): Promise<T> {
  const text = await sparkChat(
    env,
    [
      { role: "developer", content: `${developer}\nReply with a single JSON object and nothing else.` },
      { role: "user", content: user },
    ],
    effort,
  );
  return parseJsonReply<T>(text);
}

// ---------- splitter: what kind of work is this, and where does it land ----------

const KINDS: ItemKind[] = ["bug", "feature", "cleanup", "tests"];

export interface Triage {
  kind: ItemKind;
  district: string;
}

export function heuristicTriage(title: string, labels: string[], districts: string[]): Triage {
  const text = `${title} ${labels.join(" ")}`.toLowerCase();
  const kind: ItemKind = /bug|fix|crash|error|broken/.test(text)
    ? "bug"
    : /test|coverage/.test(text)
      ? "tests"
      : /refactor|cleanup|chore|lint|tidy/.test(text)
        ? "cleanup"
        : "feature";
  const district = districts.find((d) => d !== "/" && text.includes(d.toLowerCase())) ?? "/";
  return { kind, district };
}

export async function triage(
  env: SparkEnv,
  issue: { title: string; body: string; labels: string[] },
  districts: string[],
): Promise<Triage> {
  if (!sparkConfigured(env)) return heuristicTriage(issue.title, issue.labels, districts);
  const out = await sparkJson<{ kind?: string; district?: string }>(
    env,
    `You triage incoming work for a software factory. Classify the issue as one of ${KINDS.join(", ")} and pick the top-level folder ("district") of the repo it most likely touches, from this list: ${JSON.stringify(districts)}. Use "/" for files at the repo root.`,
    `Issue: ${issue.title}\nLabels: ${issue.labels.join(", ") || "none"}\n\n${issue.body.slice(0, 4000)}\n\nJSON shape: {"kind": "...", "district": "..."}`,
    "low",
  );
  const fallback = heuristicTriage(issue.title, issue.labels, districts);
  return {
    kind: KINDS.includes(out.kind as ItemKind) ? (out.kind as ItemKind) : fallback.kind,
    district: out.district && districts.includes(out.district) ? out.district : fallback.district,
  };
}

// ---------- hosted assembler: Spark edits files directly, no sandbox ----------

export interface Task {
  title: string;
  body: string;
  district: string;
  failure?: string;
}

export async function pickFiles(env: SparkEnv, task: Task, paths: string[]): Promise<string[]> {
  const out = await sparkJson<{ files?: string[] }>(
    env,
    "You are a coding agent planning a small, focused change. Pick the files you need to read and probably edit. At most 4.",
    `Task: ${task.title}\n\n${task.body.slice(0, 4000)}\n\nRepo files:\n${paths.slice(0, 600).join("\n")}\n\nJSON shape: {"files": ["path", ...]}`,
    "medium",
  );
  return (out.files ?? []).filter((f) => paths.includes(f)).slice(0, 4);
}

export interface Fix {
  title: string;
  summary: string;
  changes: FileChange[];
}

export async function writeFix(env: SparkEnv, task: Task, files: { path: string; content: string }[]): Promise<Fix> {
  const shown = files.map((f) => `=== ${f.path} ===\n${f.content}`).join("\n\n");
  const out = await sparkJson<{ title?: string; summary?: string; changes?: FileChange[] }>(
    env,
    "You are a careful coding agent. Make the smallest correct change that resolves the task. Return complete new contents for every file you change (you may also create new files). Don't change files you don't need to.",
    `Task: ${task.title}\n\n${task.body.slice(0, 6000)}\n` +
      (task.failure ? `\nYour previous attempt was rejected by the inspector:\n${task.failure.slice(0, 3000)}\n` : "") +
      `\nFiles:\n${shown}\n\nJSON shape: {"title": "short PR title", "summary": "what changed and why, 1-3 sentences", "changes": [{"path": "...", "content": "full file contents"}]}`,
    "high",
  );
  const changes = (out.changes ?? []).filter((c) => typeof c.path === "string" && typeof c.content === "string");
  if (!changes.length) throw new SparkError("Spark proposed no changes");
  return { title: out.title || task.title, summary: out.summary || "", changes };
}
