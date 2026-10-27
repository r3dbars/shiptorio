import { mkdtemp, mkdir, realpath, rm, stat, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { CheckSandbox } from "./sandbox";

export async function assertLinuxSandbox() {
  if (!Bun.which("bwrap") || !Bun.which("git")) throw new Error("Linux requires git and bubblewrap. Install bubblewrap (sudo apt install bubblewrap) and enable unprivileged user namespaces.");
  const child = Bun.spawn([Bun.which("bwrap")!, "--unshare-all", "--die-with-parent", "--ro-bind", "/", "/", "--", "/usr/bin/true"], { stdout: "pipe", stderr: "pipe" });
  const [err, code] = await Promise.all([new Response(child.stderr).text(), child.exited]);
  if (code) throw new Error(`Bubblewrap is unavailable: enable unprivileged user namespaces. ${err.slice(0, 300)}`);
}
export async function linuxSandbox(work: string, agent?: { home: string; executable: string }): Promise<CheckSandbox> {
  await assertLinuxSandbox();
  const directory = await realpath(work), root = await realpath(await mkdtemp(join(tmpdir(), "shiptorio-check-")));
  const home = agent ? await realpath(agent.home) : join(root, "home"), temp = join(root, "tmp"), bin = join(root, "bin");
  if (!agent) await mkdir(home); await mkdir(temp); await mkdir(bin);
  const runtime = await realpath(process.execPath), node = Bun.which("node");
  const nodeRuntime = node ? await realpath(node) : runtime;
  await symlink(runtime, join(bin, "bun")); await symlink(nodeRuntime, join(bin, "node"));
  // Paths are mounted explicitly, never the user's HOME or runtime parent directory.
  const mounts = ["/usr", "/lib", "/lib64", "/bin", "/sbin", "/etc/ssl", "/etc/ld.so.cache", "/etc/nsswitch.conf", "/etc/hosts", "/etc/resolv.conf", "/etc/passwd", "/etc/group"];
  const visible: string[] = [];
  for (const path of mounts) if (await stat(path).then(() => true).catch(() => false)) visible.push("--ro-bind", path, path);
  for (const path of new Set([runtime, nodeRuntime])) if (!path.startsWith("/usr/") && !path.startsWith("/bin/")) visible.push("--ro-bind", path, path);
  if (agent) {
    const binary = await realpath(agent.executable);
    visible.push("--ro-bind", await realpath(join(binary, "..")), await realpath(join(binary, "..")));
  }
  const env = { ...(agent ? { CODEX_HOME: join(home, ".codex"), CLAUDE_CONFIG_DIR: join(home, ".claude"), CLAUDE_CODE_TMPDIR: temp } : {}), HOME: home, TMPDIR: temp, TMP: temp, TEMP: temp, PATH: `${bin}:/usr/bin:/bin`, LANG: "C.UTF-8", CI: "true", SHIPTORIO_CHECK_SANDBOX: "1", BUN_INSTALL_CACHE_DIR: join(home, ".bun-cache"), GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: "/dev/null", GIT_TERMINAL_PROMPT: "0" };
  let closed = false;
  return {
    async run(args, cwd = directory, options = {}) {
      if (closed) throw new Error("Verification sandbox is closed");
      const location = await realpath(cwd);
      if (location !== directory && !location.startsWith(directory + "/")) throw new Error("Verification cwd escapes the assigned checkout");
      if (options.install && !(await realpath(args[0]) === runtime && args.length === 4 && args[1] === "install" && args[2] === "--frozen-lockfile" && args[3] === "--ignore-scripts")) throw new Error("Only frozen dependency installation without lifecycle scripts can use network access");
      // Mask host temp before mounting trusted runtimes/agent binaries, which may themselves live in /tmp.
      const child = Bun.spawn([Bun.which("bwrap")!, "--die-with-parent", "--new-session", "--unshare-all", ...(options.install || agent ? ["--share-net"] : []), "--cap-drop", "ALL", "--proc", "/proc", "--dev", "/dev", "--tmpfs", "/tmp", ...visible, "--bind", directory, directory, "--bind", root, root, ...(agent ? ["--bind", home, home] : []), "--chdir", location, "--", ...(options.install ? [args[0], "--no-env-file", "--config=/dev/null", ...args.slice(1)] : args)], { cwd: location, env, stdin: "ignore", stdout: "pipe", stderr: "pipe", detached: true });
      const stop = () => { try { process.kill(-child.pid, "SIGKILL"); } catch {} };
      let timedOut = false;
      const timer = setTimeout(() => { timedOut = true; stop(); }, options.timeout ?? 180000);
      try { const [out, err, code] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited]); return { code, out, err, timedOut }; }
      finally { clearTimeout(timer); stop(); }
    },
    async close() { closed = true; await rm(root, { recursive: true, force: true }); },
  };
}
