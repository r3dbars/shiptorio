import { nativeTest } from "./native-prerequisite";
import { expect, test } from "bun:test";
import { chmod, mkdtemp, mkdir, rm, stat, realpath } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
const quote = (s: string) => "'" + s.replaceAll("'", "'\\''") + "'";

nativeTest("clean HOME install → browser pairing → two repos in one runner → update → uninstall", async () => {
  const home = await mkdtemp(join(tmpdir(), "shiptorio-clean-user-")), fakeBin = join(home, "bin"); await mkdir(fakeBin);
  const fixture = join(home, "fixture"); await mkdir(fixture);
  const bundle = await Bun.build({ entrypoints: [join(import.meta.dir, "../src/cli.ts")], target: "bun", outdir: fixture, naming: "runner.mjs" });
  expect(bundle.success).toBe(true);
  const bytes = await Bun.file(join(fixture, "runner.mjs")).arrayBuffer();
  let corrupt = false, starts = 0;
  const claims = new Set<string>(), beats = new Set<string>();
  const tokens = new Map<string, string[]>();
  const code = "ABCD-1234-ABCD", secret = "x".repeat(72);
  const server = Bun.serve({ port: 0, async fetch(req) {
    const url = new URL(req.url);
    if (url.pathname === "/runner-manifest.json") return Response.json({ sha256: corrupt ? "0".repeat(64) : new Bun.CryptoHasher("sha256").update(bytes).digest("hex") });
    if (url.pathname === "/runner.mjs") return new Response(bytes);
    if (url.pathname.endsWith("/start")) { starts++; return Response.json({ code, secret, expires: Date.now() + 600000, verificationUri: `${url.origin}/runner/pair?code=${code}` }); }
    if (url.pathname.endsWith("/poll")) {
      const request = await req.json() as { code: string; secret: string }; expect(request).toEqual({ code, secret });
      const repo = starts === 1 ? "you/first" : "you/second", expires = Date.now() + 8 * 3600000;
      const token = `${btoa(JSON.stringify({ purpose: "runner", repo, pairId: repo, expires })).replace(/=/g, "")}.signature`; tokens.set(repo, [...(tokens.get(repo) ?? []), token]);
      return Response.json({ status: "approved", repo, token, expires });
    }
    const match = url.pathname.match(/^\/api\/runner\/(you\/\w+)\/(claim|heartbeat|renew)$/);
    if (match) {
      expect(tokens.get(match[1])?.map(token => `Bearer ${token}`)).toContain(req.headers.get("authorization") ?? "");
      if (match[2] === "renew") {
        const expires = Date.now() + 7 * 86400000;
        const token = `${btoa(JSON.stringify({purpose:"runner",repo:match[1],pairId:match[1],expires})).replace(/=/g, "")}.signature`;
        tokens.set(match[1], [...(tokens.get(match[1]) ?? []), token]);
        return Response.json({token, expires});
      }
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
  await Bun.write(installer, (await Bun.file(join(import.meta.dir, "../install.sh")).text()).replaceAll("__BUN_VERSION__", Bun.version));
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
    expect((await Bun.file(join(home, ".local/share/shiptorio/runner/server-url")).text()).trim()).toBe(origin);
    // Subsequent launches must retain the server after the one-shot installer env is gone.
    delete (env as { SHIPTORIO_URL?: string }).SHIPTORIO_URL;
    const launcher = join(home, ".local/bin/shiptorio-runner");
    const pair = run([launcher, "pair"]); expect(await pair.exited).toBe(0);
    await until(() => claims.has("you/second") && beats.has("you/second"));
    const config = join(home, ".local/share/shiptorio/runner/pairings/you%2Ffirst.json");
    const before = await Bun.file(config).text(); expect((await stat(config)).mode & 0o777).toBe(0o600);
    first.kill(); await first.exited;
    (env as { SHIPTORIO_URL?: string }).SHIPTORIO_URL = origin;
    claims.clear(); const update = run(["/bin/sh", installer]); await until(() => claims.size === 2);
    expect(await Bun.file(join(home, "preload-ran")).exists()).toBe(false);
    expect(starts).toBe(2); expect(await Bun.file(config).text()).toBe(before);
    update.kill(); await update.exited;
    (env as { SHIPTORIO_URL?: string }).SHIPTORIO_URL = "https://another.example";
    const switched = run(["/bin/sh", installer]); expect(await switched.exited).not.toBe(0);
    expect(await Bun.file(config).text()).toBe(before);
    delete (env as { SHIPTORIO_URL?: string }).SHIPTORIO_URL;
    // Updating uses the same explicit installation origin, as the UI's command does.
    (env as { SHIPTORIO_URL?: string }).SHIPTORIO_URL = origin;
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

// The same POSIX installer, private runtime and checksum run in clean platform-shaped
// environments. Darwin/Linux selection is mocked here; CI also runs the native test above on Ubuntu.
for (const platform of ["Darwin", "Linux"]) test(`clean ${platform} paths stay isolated without global Bun or Node`, async () => {
  const home = await mkdtemp(join(tmpdir(), `shiptorio-O'Brien-$${platform}-`));
  const fakeBin = join(home, "bin"), fixture = join(home, "fixture");
  await mkdir(fakeBin); await mkdir(fixture);
  const log = join(home, "calls.jsonl"), downloads = join(home, "downloads");
  const program = `await Bun.write(process.env.TEST_LOG, (await Bun.file(process.env.TEST_LOG).exists() ? await Bun.file(process.env.TEST_LOG).text() : '') + JSON.stringify({cwd:process.cwd(),args:process.argv.slice(2)})+'\\n');`;
  await Bun.write(join(fixture, "runner.mjs"), program);
  await Bun.write(join(fixture, "manifest.json"), JSON.stringify({ sha256: new Bun.CryptoHasher("sha256").update(program).digest("hex") }));
  const asset = `bun-${platform === "Darwin" ? "darwin" : "linux"}-${process.arch === "arm64" ? "aarch64" : platform === "Linux" ? "x64-baseline" : "x64"}`;
  const commands: Record<string, string> = {
    uname: `#!/bin/sh\nif [ "$1" = -s ]; then echo ${platform}; else echo ${process.arch === "arm64" ? "arm64" : "x86_64"}; fi\n`,
    git: '#!/bin/sh\nexit 0\n',
    node: '#!/bin/sh\necho "Global Node must not run" >&2; exit 93\n',
    bun: '#!/bin/sh\necho "Global Bun must not run" >&2; exit 94\n',
    curl: `#!/bin/sh\ncase "$2" in\n *oven-sh/bun*) echo runtime >> ${quote(downloads)}; touch "$4";;\n */runner-manifest.json) cp ${quote(join(fixture, "manifest.json"))} "$4";;\n */runner.mjs) cp ${quote(join(fixture, "runner.mjs"))} "$4";;\n *) exit 95;;\nesac\n`,
    unzip: `#!/bin/sh\nmkdir -p "$4/${asset}"\ncp ${quote(process.execPath)} "$4/${asset}/bun"\n`,
  };
  for (const [name, content] of Object.entries(commands)) { await Bun.write(join(fakeBin, name), content); await chmod(join(fakeBin, name), 0o700); }
  const installer = join(home, "install.sh");
  await Bun.write(installer, (await Bun.file(join(import.meta.dir, "../install.sh")).text()).replaceAll("__BUN_VERSION__", Bun.version));
  const env = { HOME: home, PATH: `${fakeBin}:/usr/bin:/bin`, TEST_LOG: log };
  const run = async (args: string[], extra: Record<string, string> = {}) => {
    const start = performance.now();
    const child = Bun.spawn(args, { env: { ...env, ...extra }, stdout: "pipe", stderr: "pipe" });
    const [code, out, err] = await Promise.all([child.exited, new Response(child.stdout).text(), new Response(child.stderr).text()]);
    expect({ code, err }).toEqual({ code: 0, err: "" });
    return { out, ms: Math.round(performance.now() - start) };
  };
  try {
    const first = await run(["/bin/sh", installer], { SHIPTORIO_URL: "https://shiptorio.dev" });
    console.log(`${platform} first install: ${first.ms}ms (fixture downloads)`);
    expect(first.out.match(/^Shiptorio runner is ready$/gm)?.length).toBe(1);
    const staging = join(home, ".local/share/shiptorio/runner-staging");
    await Bun.write(join(staging, "saved-work"), "keep");
    const second = await run(["/bin/sh", installer], { SHIPTORIO_URL: "https://shiptorio.dev" });
    expect(await Bun.file(join(staging, "saved-work")).text()).toBe("keep");
    expect((await Bun.file(downloads).text()).trim().split("\n")).toHaveLength(1);
    await run([join(home, ".local/bin/shiptorio-staging/shiptorio-runner"), "paths"]);
    const calls = (await Bun.file(log).text()).trim().split("\n").map(line => JSON.parse(line));
    expect(calls.at(-1)).toMatchObject({ cwd: await realpath(staging), args: ["paths"] });
    await run(["/bin/sh", installer], { SHIPTORIO_URL: "https://shiptorio.com" });
    const production = join(home, ".local/share/shiptorio/runner");
    expect((await Bun.file(join(staging, "server-url")).text()).trim()).toBe("https://shiptorio.dev");
    expect((await Bun.file(join(production, "server-url")).text()).trim()).toBe("https://shiptorio.com");
    console.log(`${platform} isolated install: first ${first.ms}ms, repeat ${second.ms}ms (fixture downloads; not network speed)`);
  } finally { await rm(home, { recursive: true, force: true }); }
});

for (const platform of ["Darwin", "Linux"]) for (const missing of ["curl", "git"]) test(`${platform} explains missing ${missing} before downloading`, async () => {
  const home = await mkdtemp(join(tmpdir(), "shiptorio-install-missing-")), bin = join(home, "bin");
  await mkdir(bin);
  try {
    const commands: Record<string, string> = { uname: `#!/bin/sh\nif [ "$1" = -s ]; then echo ${platform}; else echo arm64; fi\n`, ...(missing === "git" ? { curl: "#!/bin/sh\nexit 99\n" } : { git: "#!/bin/sh\nexit 99\n" }) };
    for (const [name, text] of Object.entries(commands)) { await Bun.write(join(bin, name), text); await chmod(join(bin, name), 0o700); }
    const child = Bun.spawn(["/bin/sh", join(import.meta.dir, "../install.sh")], { env: { HOME: home, PATH: bin }, stdout: "pipe", stderr: "pipe" });
    const [code, err] = await Promise.all([child.exited, new Response(child.stderr).text()]);
    expect(code).toBe(1);
    expect(err.toLowerCase()).toContain(`${missing} is missing`);
    if (platform === "Darwin" && missing === "git") expect(err).toContain("xcode-select --install");
    if (platform === "Linux") expect(err).not.toContain("xcode-select");
    expect(await Bun.file(join(home, ".local/share/shiptorio/runner/bun")).exists()).toBe(false);
  } finally { await rm(home, { recursive: true, force: true }); }
});
