import { mkdtemp, mkdir, realpath, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

export interface SandboxResult { code: number; out: string; err: string }
export interface CheckSandbox {
  run(args: string[], cwd?: string, options?: { install?: boolean; timeout?: number }): Promise<SandboxResult>;
  close(): Promise<void>;
}
const quote = (value: string) => JSON.stringify(value);

/** The repository and all child processes are untrusted. Env filtering alone is not isolation. */
export async function verificationGit(): Promise<string> {
  for (const path of ["/Library/Developer/CommandLineTools/usr/bin/git", "/Applications/Xcode.app/Contents/Developer/usr/bin/git"]) if (await Bun.file(path).exists()) return path;
  throw new Error("Install Apple Command Line Tools before running sandboxed verification");
}

export async function assertVerificationPlatform(): Promise<void> {
  if (process.platform !== "darwin" || !(await Bun.file("/usr/bin/sandbox-exec").exists())) {
    throw new Error("Local verification requires macOS sandbox-exec. This platform has no configured OS sandbox; checks are disabled.");
  }
  await verificationGit();
}

export async function checkSandbox(work: string, agent?: { home: string; executable: string }): Promise<CheckSandbox> {
  await assertVerificationPlatform();
  const directory = await realpath(work);
  const privateRoot = await realpath(await mkdtemp(join(tmpdir(), "shiptorio-check-")));
  const home = agent ? await realpath(agent.home) : join(privateRoot, "home"), temp = join(privateRoot, "tmp");
  if (!agent) await mkdir(home); await mkdir(temp);
  const runtime = await realpath(process.execPath);
  const git = await verificationGit();
  const agentBinary = agent ? await realpath(agent.executable) : null;
  const bin = join(privateRoot, "bin"); await mkdir(bin);
  await symlink(runtime, join(bin, "bun"));
  const node = Bun.which("node");
  const nodeRuntime = node ? await realpath(node) : null;
  await symlink(nodeRuntime ?? runtime, join(bin, "node"));
  const env: Record<string, string> = {
    HOME: home, TMPDIR: temp, TMP: temp, TEMP: temp,
    PATH: [dirname(git), bin, dirname(runtime), ...(nodeRuntime ? [dirname(nodeRuntime)] : []), "/usr/bin", "/bin", "/usr/sbin", "/sbin"].join(":"),
    LANG: "en_US.UTF-8", TERM: "dumb", CI: "true", SHIPTORIO_CHECK_SANDBOX: "1",
    BUN_INSTALL_CACHE_DIR: join(privateRoot, ".bun-cache"),
    ...(agent ? { CODEX_HOME: join(home, ".codex") } : {}),
    GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: "/dev/null", GIT_TERMINAL_PROMPT: "0",
  };
  const profile = (install: boolean) => `(version 1)
(deny default)
; Explicit deny is necessary: numeric kern.procargs2 can otherwise read sibling credentials.
(deny process-info*)
(allow process-info* (target self))
(allow process-exec)
(allow process-fork)
(allow signal (target same-sandbox))
; Hardware/OS queries only, never process arguments or environments.
(allow sysctl-read (sysctl-name-regex #"^hw\\.")
  (sysctl-name "kern.osrelease") (sysctl-name "kern.ostype") (sysctl-name "kern.osproductversion")
  (sysctl-name "kern.osversion") (sysctl-name "kern.version") (sysctl-name "kern.argmax")
  (sysctl-name "kern.hostname") (sysctl-name "kern.boottime") (sysctl-name "kern.maxfilesperproc") (sysctl-name "vm.loadavg"))
(allow file-read-metadata)
(allow file-read* (literal "/") (subpath "/System") (subpath "/usr/bin") (subpath "/usr/lib") (subpath "/usr/share") (subpath "/usr/libexec") (subpath "/usr/sbin") (subpath "/bin") (subpath "/sbin")
  (subpath "/Library/Developer") (subpath "/Library/Apple") (subpath "/Applications/Xcode.app/Contents/Developer")
  (subpath "/private/etc") (literal "/dev/null") (literal "/dev/random") (literal "/dev/urandom")
  (subpath "/dev/fd") (literal ${quote(runtime)}) ${nodeRuntime ? `(literal ${quote(nodeRuntime)})` : ""} (subpath ${quote(directory)}) (subpath ${quote(privateRoot)}) ${agentBinary ? `(subpath ${quote(dirname(agentBinary))}) (subpath ${quote(home)})` : ""})
(allow file-write* (subpath ${quote(directory)}) (subpath ${quote(privateRoot)}) ${agent ? `(subpath ${quote(home)})` : ""} (literal "/dev/null") (subpath "/dev/fd"))
${install || agent ? `(allow network-outbound (literal "/private/var/run/mDNSResponder") (remote tcp "*:443") (remote tcp "*:53") (remote udp "*:53"))
(allow file-read* (literal "/private/var/run/resolv.conf"))
(allow mach-lookup (global-name "com.apple.mDNSResponder") (global-name "com.apple.trustd"))` : ""}
`;
  let closed = false;
  return {
    async run(args, cwd = directory, options = {}) {
      if (closed) throw new Error("Verification sandbox is closed");
      const location = await realpath(cwd);
      if (location !== directory && !location.startsWith(directory + "/")) throw new Error("Verification cwd escapes the assigned checkout");
      // Only the dependency installer may use the network-enabled profile, never scripts.
      if (options.install && !(await realpath(args[0]) === runtime && args.length === 4 && args[1] === "install" && args[2] === "--frozen-lockfile" && args[3] === "--ignore-scripts")) throw new Error("Only frozen dependency installation without lifecycle scripts can use network access");
      const child = Bun.spawn(["/usr/bin/sandbox-exec", "-p", profile(!!options.install), ...(options.install ? [args[0], "--no-env-file", "--config=/dev/null", ...args.slice(1)] : args)], { cwd: location, env, stdout: "pipe", stderr: "pipe", detached: true });
      const stop = () => { try { process.kill(-child.pid, "SIGKILL"); } catch {} };
      const timer = setTimeout(stop, options.timeout ?? 180000);
      try {
        const [out, err, code] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited]);
        return { code, out, err };
      } finally { clearTimeout(timer); stop(); }
    },
    async close() { closed = true; await rm(privateRoot, { recursive: true, force: true }); },
  };
}
