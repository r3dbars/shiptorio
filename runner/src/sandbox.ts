import { mkdtemp, mkdir, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";

export interface SandboxResult { code: number; out: string; err: string }
export interface CheckSandbox {
  run(args: string[], cwd?: string, options?: { install?: boolean; timeout?: number }): Promise<SandboxResult>;
  close(): Promise<void>;
}
const quote = (value: string) => JSON.stringify(value);

/** The repository and all child processes are untrusted. Env filtering alone is not isolation. */
export async function checkSandbox(work: string): Promise<CheckSandbox> {
  if (process.platform !== "darwin" || !(await Bun.file("/usr/bin/sandbox-exec").exists())) {
    throw new Error("Local verification requires macOS sandbox-exec. This platform has no configured OS sandbox; checks are disabled.");
  }
  const directory = await realpath(work);
  const privateRoot = await realpath(await mkdtemp(join(tmpdir(), "shiptorio-check-")));
  const home = join(privateRoot, "home"), temp = join(privateRoot, "tmp");
  await mkdir(home); await mkdir(temp);
  const runtime = await realpath(process.execPath);
  const node = Bun.which("node");
  const nodeRuntime = node ? await realpath(node) : null;
  const env: Record<string, string> = {
    HOME: home, TMPDIR: temp, TMP: temp, TEMP: temp,
    PATH: [dirname(runtime), ...(nodeRuntime ? [dirname(nodeRuntime)] : []), "/usr/bin", "/bin", "/usr/sbin", "/sbin"].join(":"),
    LANG: "en_US.UTF-8", TERM: "dumb", CI: "true",
    BUN_INSTALL_CACHE_DIR: join(home, ".bun-cache"),
    GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: "/dev/null", GIT_TERMINAL_PROMPT: "0",
  };
  const profile = (install: boolean) => `(version 1)
(deny default)
(allow process-exec)
(allow process-fork)
(allow signal (target same-sandbox))
(allow sysctl-read)
(allow file-read-metadata)
(allow file-read* (literal "/") (subpath "/System") (subpath "/usr/bin") (subpath "/usr/lib") (subpath "/usr/share") (subpath "/usr/libexec") (subpath "/usr/sbin") (subpath "/bin") (subpath "/sbin")
  (subpath "/Library/Developer") (subpath "/Library/Apple") (subpath "/Applications/Xcode.app/Contents/Developer")
  (subpath "/private/etc") (literal "/dev/null") (literal "/dev/random") (literal "/dev/urandom")
  (subpath "/dev/fd") (literal ${quote(runtime)}) ${nodeRuntime ? `(literal ${quote(nodeRuntime)})` : ""} (subpath ${quote(directory)}) (subpath ${quote(privateRoot)}))
(allow file-write* (subpath ${quote(directory)}) (subpath ${quote(privateRoot)}) (literal "/dev/null") (subpath "/dev/fd"))
${install ? `(allow network-outbound (remote tcp "*:443") (remote tcp "*:53") (remote udp "*:53"))
(allow mach-lookup (global-name "com.apple.mDNSResponder") (global-name "com.apple.trustd"))` : ""}
`;
  let closed = false;
  return {
    async run(args, cwd = directory, options = {}) {
      if (closed) throw new Error("Verification sandbox is closed");
      const location = await realpath(cwd);
      if (location !== directory && !location.startsWith(directory + "/")) throw new Error("Verification cwd escapes the assigned checkout");
      // Only the dependency installer may use the network-enabled profile, never scripts.
      if (options.install && !(await realpath(args[0]) === runtime && args[1] === "install" && args.includes("--ignore-scripts") && args.includes("--frozen-lockfile"))) throw new Error("Only frozen dependency installation without lifecycle scripts can use network access");
      const child = Bun.spawn(["/usr/bin/sandbox-exec", "-p", profile(!!options.install), ...args], { cwd: location, env, stdout: "pipe", stderr: "pipe" });
      const timer = setTimeout(() => child.kill(), options.timeout ?? 180000);
      try {
        const [out, err, code] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited]);
        return { code, out, err };
      } finally { clearTimeout(timer); }
    },
    async close() { closed = true; await rm(privateRoot, { recursive: true, force: true }); },
  };
}
