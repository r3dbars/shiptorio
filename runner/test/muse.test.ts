import { expect, test } from "bun:test";
import { chmod, mkdir, mkdtemp, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { museEditPrompt, parseMuseEdits } from "../src/muse-edits";
import { assembleMuse } from "../src/muse-assembler";
import { agentEnvironment, harnessArgs } from "../src/policy";
import { prepareAgentHome, subscriptionArgs, subscriptionCredentialVersion, subscriptionSignedIn } from "../src/subscriptions";
import { loginCommand } from "../src/health";
import { plainRunnerError } from "../src/messages";
import { checkSandbox } from "../src/sandbox";
import { nativeTest } from "./native-prerequisite";

// Envelope shape of `muse exec --json`: one JSON object per line, typed by payload_type.
const envelope = (sequence: number, payload_type: string, payload: Record<string, unknown>) =>
  JSON.stringify({ schema_version: 1, id: `e${sequence}`, stream: { kind: "run", id: "r1" }, sequence, recorded_at: sequence, record_type: "event", durability: "durable", payload_type, payload_schema_version: 1, payload });
const proposal = { summary: "Clarify the README", edits: [{ path: "README.md", create: false, oldText: "Original documentation.", newText: "Clear documentation." }] };
const transcript = (reply: string, terminal = "completed", extra: string[] = []) => [
  envelope(1, "turn.input.user", { kind: "turn_input_user", prompt: "task" }),
  ...extra,
  envelope(2, "run.output.delta", { kind: "run_output_delta", text: reply.slice(0, 20) }),
  envelope(3, "run.output.delta", { kind: "run_output_delta", text: reply.slice(20) }),
  envelope(4, "run.usage", { kind: "run_usage" }),
  envelope(5, `run.terminal.${terminal}`, { kind: "run_terminal", terminal }),
].join("\n");

test("Muse Code runs headless with writes, shell and approvals off, and no retained session", () => {
  const args = harnessArgs("muse_code", "task");
  expect(args.slice(0, 2)).toEqual(["exec", "--json"]);
  for (const flag of ["--disable-write", "--disable-shell", "--no-session-log"]) expect(args).toContain(flag);
  expect(args[args.indexOf("--approval-mode") + 1]).toBe("never");
  for (const unsafe of ["--yolo", "--disable-sandbox", "--trust-workspace", "--disable-approval"]) expect(args).not.toContain(unsafe);
  expect(args.at(-1)).toBe("task");
  expect(subscriptionArgs("muse_code", true)).toEqual(["login"]);
  expect(loginCommand("muse_code")).toBe("shiptorio-runner login muse");
});

test("Muse Code's settings and credentials live in the dedicated home, never the user's", () => {
  const env = agentEnvironment({ HOME: "/Users/me", META_API_KEY: "do-not-inherit", XDG_CONFIG_HOME: "/Users/me/.config" }, "/runner/.agent-home");
  expect(env.XDG_CONFIG_HOME).toBe("/runner/.agent-home/.config");
  expect(env.XDG_DATA_HOME).toBe("/runner/.agent-home/.local/share");
  expect(env.META_API_KEY).toBeUndefined();
  expect(agentEnvironment({ XDG_CONFIG_HOME: "/Users/me/.config" }).XDG_CONFIG_HOME).toBeUndefined();
});

test("the prompt carries the edit schema because Muse Code has no schema flag", () => {
  const prompt = museEditPrompt({ plan: "Improve the README.", allowedPaths: ["README.md"] }, [{ path: "README.md", content: "Original documentation.\n" }]);
  expect(prompt).toContain("Return ONLY JSON");
  expect(prompt).toContain('"edits"');
});

test("a completed Muse Code reply becomes one scoped proposal, with or without a code fence", () => {
  expect(parseMuseEdits(transcript(JSON.stringify(proposal)), ["README.md"])).toEqual(proposal);
  expect(parseMuseEdits(transcript("```json\n" + JSON.stringify(proposal) + "\n```"), ["README.md"])).toEqual(proposal);
});

test("Muse Code output that is not a clean, completed, in-scope proposal is rejected", () => {
  const ok = JSON.stringify(proposal);
  const tool = envelope(9, "task.lifecycle.side_effect_intent", { kind: "task_lifecycle", task_id: "t", event: { kind: "side_effect_intent", task_id: "t", operation: "tool:read_file", idempotency_key: "tool:c1" } });
  expect(() => parseMuseEdits(transcript(ok, "completed", [tool]), ["README.md"])).toThrow("attempted a tool");
  expect(() => parseMuseEdits(transcript(ok, "completed", [envelope(9, "tool.result", { kind: "tool_result", call_id: "c1" })]), ["README.md"])).toThrow("attempted a tool");
  expect(() => parseMuseEdits(transcript(ok, "completed", [envelope(9, "approval_wait.effect.started", { kind: "approval_wait_effect" })]), ["README.md"])).toThrow("approval");
  expect(() => parseMuseEdits(transcript(ok, "failed"), ["README.md"])).toThrow("did not complete");
  expect(() => parseMuseEdits(transcript(ok).split("\n").slice(0, -1).join("\n"), ["README.md"])).toThrow("did not complete");
  expect(() => parseMuseEdits(transcript(`Sure! ${ok}`), ["README.md"])).toThrow("not JSON");
  expect(() => parseMuseEdits(transcript(ok), ["docs/other.md"])).toThrow("outside approved scope");
  expect(() => parseMuseEdits(transcript(ok) + "\nnot json", ["README.md"])).toThrow("Malformed");
});

test("plain runner copy names Muse Code and its sign-in command", () => {
  expect(plainRunnerError(new Error("Sign-in expired: shiptorio-runner login muse"))).toBe("Sign in to Muse Code again.\nshiptorio-runner login muse");
});

test("Muse Code counts as signed in only after its own credentials exist in the dedicated home", async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), "shiptorio-muse-auth-")));
  try {
    const home = await prepareAgentHome(root), executable = join(root, "muse");
    await Bun.write(executable, "#!/bin/sh\n[ \"$1\" = --version ] && echo 'muse 1.4.13'\n"); await chmod(executable, 0o700);
    expect(await subscriptionSignedIn("muse_code", executable, home)).toBe(false);
    const before = await subscriptionCredentialVersion("muse_code", home);
    await Bun.write(join(home, ".config/muse/auth.json"), '{"session":"fixture"}', { mode: 0o600 });
    expect(await subscriptionSignedIn("muse_code", executable, home)).toBe(true);
    expect(await subscriptionCredentialVersion("muse_code", home)).not.toBe(before);
    await Bun.write(executable, "#!/bin/sh\nexit 1\n");
    expect(await subscriptionSignedIn("muse_code", executable, home)).toBe(false);
  } finally { await rm(root, { recursive: true, force: true }); }
});

nativeTest("runner login muse signs in through the dedicated home and records it", async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), "shiptorio-muse-login-")));
  try {
    const executable = join(root, "muse");
    await Bun.write(executable, `#!/bin/sh
[ "$XDG_CONFIG_HOME" = "$HOME/.config" ] || exit 8
[ -z "$META_API_KEY$SHIPTORIO_RUNNER_TOKEN" ] || exit 9
case "$1" in --version) echo "muse 1.4.13" ;; login) printf '{"session":"fixture"}' > "$XDG_CONFIG_HOME/muse/auth.json" ;; *) exit 2 ;; esac
`); await chmod(executable, 0o700);
    const env = { ...process.env, PATH: `${root}:/usr/bin:/bin`, SHIPTORIO_RUNNER_ROOT: root, META_API_KEY: "do-not-inherit", SHIPTORIO_RUNNER_TOKEN: "do-not-inherit" };
    const child = Bun.spawn([process.execPath, join(import.meta.dir, "../src/cli.ts"), "login", "muse"], { env, stdin: "ignore", stdout: "pipe", stderr: "pipe" });
    const [out, err, code] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited]);
    expect({ code, err }).toEqual({ code: 0, err: "" });
    expect(out).toContain("Muse Code is signed in and ready");
    const home = join(root, ".agent-home");
    expect(await Bun.file(join(home, ".config/muse/.shiptorio-login")).exists()).toBe(true);
  } finally { await rm(root, { recursive: true, force: true }); }
});

nativeTest("a fake Muse Code inside the agent sandbox proposes an edit and the supervisor applies it", async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), "shiptorio-muse-assemble-")));
  try {
    const work = join(root, "checkout"), home = await prepareAgentHome(root), executable = join(root, "bin", "muse");
    await mkdir(work); await mkdir(join(root, "bin"));
    await Bun.write(join(work, "README.md"), "Original documentation.\n");
    const git = (args: string[]) => Bun.spawnSync(["git", "-c", "user.email=f@x", "-c", "user.name=f", ...args], { cwd: work });
    git(["init", "-q"]); git(["add", "."]); git(["commit", "-qm", "base"]);
    // The fake checks it was launched with the documented safety flags and the dedicated, key-free environment.
    await Bun.write(join(root, "reply.jsonl"), transcript(JSON.stringify(proposal)) + "\n");
    await Bun.write(executable, `#!/bin/sh
[ "$XDG_CONFIG_HOME" = "$HOME/.config" ] || exit 8
[ -z "$META_API_KEY" ] || exit 9
case " $* " in *" --disable-shell "*) ;; *) exit 3 ;; esac
case " $* " in *" --disable-write "*) ;; *) exit 4 ;; esac
cat "${join(root, "reply.jsonl")}"
`); await chmod(executable, 0o700);
    const verification = await checkSandbox(work);
    try {
      const result = await assembleMuse({ root, work, home, executable, timeout: 20000, job: { plan: "Improve the README.", allowedPaths: ["README.md"] }, files: [{ path: "README.md", content: "Original documentation.\n" }], verification });
      expect(result.code).toBe(0);
    } finally { await verification.close(); }
    expect(await Bun.file(join(work, "README.md")).text()).toBe("Clear documentation.\n");
  } finally { await rm(root, { recursive: true, force: true }); }
});

nativeTest("a stuck Muse Code process times out with no partial edit", async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), "shiptorio-muse-timeout-")));
  try {
    const work = join(root, "checkout"), home = join(root, "home"), executable = join(root, "muse");
    await mkdir(work); await mkdir(home); await Bun.write(join(work, "README.md"), "Original documentation.\n");
    await Bun.write(executable, "#!/bin/sh\nsleep 30\n"); await chmod(executable, 0o700);
    let writes = 0;
    const verification = { run: async () => { writes++; throw Error("no proposal may reach the writer"); }, close: async () => {} };
    await expect(assembleMuse({ root, work, home, executable, timeout: 250, job: { plan: "Improve the README.", allowedPaths: ["README.md"] }, files: [], verification })).rejects.toThrow("Muse Code timed out");
    expect(writes).toBe(0);
  } finally { await rm(root, { recursive: true, force: true }); }
});
