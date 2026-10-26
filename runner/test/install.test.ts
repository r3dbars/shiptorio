import { expect, test } from "bun:test";
import { chmod, mkdtemp, mkdir, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
const quote = (s: string) => "'" + s.replaceAll("'", "'\\''") + "'";

test.skipIf(process.platform === "linux" && !Bun.which("bwrap"))("clean HOME install → browser pairing → two repos in one runner → update → uninstall", async () => {
  const home = await mkdtemp(join(tmpdir(), "shiptorio-clean-user-")), fakeBin = join(home, "bin"); await mkdir(fakeBin);
  const fixture = join(home, "fixture"); await mkdir(fixture);
  const bundle = await Bun.build({ entrypoints: [join(import.meta.dir, "../src/cli.ts")], target: "bun", outdir: fixture, naming: "runner.mjs" });
  expect(bundle.success).toBe(true);
  const bytes = await Bun.file(join(fixture, "runner.mjs")).arrayBuffer();
  let corrupt = false, starts = 0;
  const claims = new Set<string>(), beats = new Set<string>();
  const tokens = new Map<string, string>();
  const code = "ABCD-1234-ABCD", secret = "x".repeat(72);
  const server = Bun.serve({ port: 0, async fetch(req) {
    const url = new URL(req.url);
    if (url.pathname === "/runner-manifest.json") return Response.json({ sha256: corrupt ? "0".repeat(64) : new Bun.CryptoHasher("sha256").update(bytes).digest("hex") });
    if (url.pathname === "/runner.mjs") return new Response(bytes);
    if (url.pathname.endsWith("/start")) { starts++; return Response.json({ code, secret, expires: Date.now() + 600000, verificationUri: `${url.origin}/runner/pair?code=${code}` }); }
    if (url.pathname.endsWith("/poll")) {
      const request = await req.json() as { code: string; secret: string }; expect(request).toEqual({ code, secret });
      const repo = starts === 1 ? "you/first" : "you/second", expires = Date.now() + 8 * 3600000;
      const token = `${btoa(JSON.stringify({ repo, expires })).replace(/=/g, "")}.signature`; tokens.set(repo, token);
      return Response.json({ status: "approved", repo, token, expires });
    }
    const match = url.pathname.match(/^\/api\/runner\/(you\/\w+)\/(claim|heartbeat)$/);
    if (match) {
      expect(req.headers.get("authorization")).toBe(`Bearer ${tokens.get(match[1])}`);
      (match[2] === "claim" ? claims : beats).add(match[1]);
      return Response.json(match[2] === "claim" ? { job: null } : { ok: true });
    }
    return new Response("not found", { status: 404 });
  } });
  const origin = `http://localhost:${server.port}`, asset = `bun-${process.platform === "darwin" ? "darwin" : "linux"}-${process.arch === "arm64" ? "aarch64" : process.platform === "linux" ? "x64-baseline" : "x64"}`;
  // Stub only external runtime download and provider auth. The installer, bundle,
  // checksum, browser launch, persistence, supervisor startup and HTTP polling are real.
  const files: Record<string, string> = {
    curl: `#!/bin/sh\ncase "$2" in https://github.com/oven-sh/bun/*) touch "$4";; *) exec /usr/bin/curl "$@";; esac\n`,
    unzip: `#!/bin/sh\nmkdir -p "$4/${asset}"\ncp ${quote(process.execPath)} "$4/${asset}/bun"\n`,
    codex: '#!/bin/sh\nif [ "$1 $2" = "login status" ]; then exit 0; fi\nexit 1\n',
    open: '#!/bin/sh\nprintf "%s" "$1" > "$HOME/browser-url"\n',
    "xdg-open": '#!/bin/sh\nprintf "%s" "$1" > "$HOME/browser-url"\n',
  };
  for (const [name, body] of Object.entries(files)) { await Bun.write(join(fakeBin, name), body); await chmod(join(fakeBin, name), 0o700); }
  const installer = join(home, "install.sh");
  await Bun.write(installer, (await Bun.file(join(import.meta.dir, "../install.sh")).text()).replace("origin=https://shiptorio.com", `origin=${origin}`).replaceAll("__BUN_VERSION__", Bun.version));
  await Bun.write(join(home, "bunfig.toml"), 'preload = ["./untrusted-preload.ts"]\n');
  await Bun.write(join(home, "untrusted-preload.ts"), `await Bun.write(${JSON.stringify(join(home, "preload-ran"))}, "unexpected");`);
  const env = { HOME: home, PATH: `${fakeBin}:/usr/bin:/bin`, SHIPTORIO_URL: origin };
  const children: Bun.Subprocess<"ignore", "pipe", "pipe">[] = [];
  const run = (args: string[]) => { const child = Bun.spawn(args, { env, cwd: home, stdin: "ignore", stdout: "pipe", stderr: "pipe" }); children.push(child); return child; };
  const until = async (predicate: () => boolean | Promise<boolean>, timeout = 20000) => {
    const deadline = Date.now() + timeout;
    while (!await predicate()) { if (Date.now() >= deadline) throw Error("Installer smoke timed out"); await Bun.sleep(100); }
  };
  try {
    const first = run(["/bin/sh", installer]);
    await until(() => claims.has("you/first"));
    expect(await Bun.file(join(home, "browser-url")).text()).toContain(`/runner/pair?code=${code}`);
    const launcher = join(home, ".local/bin/shiptorio-runner");
    const pair = run([launcher, "pair"]); expect(await pair.exited).toBe(0);
    await until(() => claims.has("you/second") && beats.has("you/second"));
    const config = join(home, ".local/share/shiptorio/runner/pairings/you%2Ffirst.json");
    const before = await Bun.file(config).text(); expect((await stat(config)).mode & 0o777).toBe(0o600);
    first.kill(); await first.exited;
    claims.clear(); const update = run(["/bin/sh", installer]); await until(() => claims.size === 2);
    expect(await Bun.file(join(home, "preload-ran")).exists()).toBe(false);
    expect(starts).toBe(2); expect(await Bun.file(config).text()).toBe(before);
    update.kill(); await update.exited;
    corrupt = true;
    const broken = run(["/bin/sh", installer]); expect(await broken.exited).not.toBe(0);
    expect(await Bun.file(config).text()).toBe(before);
    const uninstall = run([launcher, "uninstall"]); expect(await uninstall.exited).toBe(0);
    expect(await Bun.file(launcher).exists()).toBe(false); expect(await Bun.file(config).exists()).toBe(false);
  } catch (error) {
    for (const child of children) { if (child.exitCode !== null) console.error((await new Response(child.stdout).text()).slice(-1500), (await new Response(child.stderr).text()).slice(-1500)); }
    throw error;
  } finally { for (const child of children) if (child.exitCode === null) child.kill(); server.stop(true); await rm(home, { recursive: true, force: true }); }
}, 60000);
