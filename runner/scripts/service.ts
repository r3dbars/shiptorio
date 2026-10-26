// Reversible macOS background service; credentials stay in the existing gitignored vars file.
import { chmod, copyFile, mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { pairingConfig } from "../src/service-config";
const runnerRoot = resolve(import.meta.dir, "..");
const support = resolve(process.env.HOME!, "Library/Application Support/Shiptorio");
const label = "com.shiptorio.runner";
const domain = `gui/${process.getuid!()}`;
const plist = resolve(process.env.HOME!, "Library/LaunchAgents", `${label}.plist`);
const action = process.argv[2] ?? "status";
const launch = async (args: string[], required = true) => {
  const p = Bun.spawn(["/bin/launchctl", ...args], { stdout: "pipe", stderr: "pipe" });
  const [out, err, code] = await Promise.all([new Response(p.stdout).text(), new Response(p.stderr).text(), p.exited]);
  if (required && code) throw new Error(`launchctl failed: ${err.slice(0, 500)}`);
  return { code, out };
};
if (process.platform !== "darwin") throw new Error("Run runner watch on this platform; service installation currently supports macOS.");
if (action === "install") {
  if (!(await Bun.file(resolve(runnerRoot, ".dev.vars")).exists())) throw new Error("Pair this Mac first");
  const runtime = resolve(support, "bun");
  await mkdir(support, { recursive: true, mode: 0o700 });
  const bundled = await Bun.build({ entrypoints: [resolve(runnerRoot, "src/cli.ts")], target: "bun", outdir: support, naming: "runner.mjs" });
  if (!bundled.success) throw new Error("Unable to bundle the background runner");
  const vars = Bun.file(resolve(support, ".dev.vars"));
  const config = pairingConfig(await Bun.file(resolve(runnerRoot, ".dev.vars")).text(), await vars.exists() ? await vars.text() : undefined);
  await writeFile(resolve(support, ".dev.vars"), config, { mode: 0o600 });
  await chmod(resolve(support, ".dev.vars"), 0o600);
  await copyFile(process.execPath, runtime); await chmod(runtime, 0o755);
  // Geothermal settings (non-secret) travel with the installed helper.
  if (await Bun.file(resolve(runnerRoot, "local-model.json")).exists()) await copyFile(resolve(runnerRoot, "local-model.json"), resolve(support, "local-model.json"));
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const args = [runtime, `--env-file=${resolve(support, ".dev.vars")}`, resolve(support, "runner.mjs"), "watch"];
  const path = [...new Set([dirname(runtime), ...[Bun.which("codex"), Bun.which("claude"), Bun.which("node")].filter(Boolean).map(p => dirname(p!)), "/usr/local/bin", "/usr/bin", "/bin"])].join(":");
  await mkdir(dirname(plist), { recursive: true });
  await writeFile(plist, `<?xml version="1.0" encoding="UTF-8"?><!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd"><plist version="1.0"><dict><key>Label</key><string>${label}</string><key>ProgramArguments</key><array>${args.map(a => `<string>${esc(a)}</string>`).join("")}</array><key>WorkingDirectory</key><string>${esc(support)}</string><key>EnvironmentVariables</key><dict><key>HOME</key><string>${esc(process.env.HOME!)}</string><key>PATH</key><string>${esc(path)}</string><key>SHIPTORIO_RUNNER_ROOT</key><string>${esc(support)}</string></dict><key>RunAtLoad</key><true/><key>KeepAlive</key><true/><key>ThrottleInterval</key><integer>30</integer><key>StandardOutPath</key><string>${esc(resolve(support, "service.log"))}</string><key>StandardErrorPath</key><string>${esc(resolve(support, "service-error.log"))}</string></dict></plist>`, { mode: 0o600 });
  await launch(["bootout", `${domain}/${label}`], false);
  // bootout returns before launchd lets go of the label, so an immediate bootstrap fails with
  // "5: Input/output error" when an older runner was loaded. Wait for it to unload, then retry.
  for (let attempt = 1; ; attempt++) {
    if ((await launch(["print", `${domain}/${label}`], false)).code === 0 && attempt <= 10) { await Bun.sleep(500); continue; }
    const r = await launch(["bootstrap", domain, plist], attempt >= 5);
    if (!r.code) break;
    await Bun.sleep(1000);
  }
  console.log("Shiptorio runner installed and started for this Mac user. Only approved jobs can run.");
} else if (action === "stop") {
  await launch(["bootout", `${domain}/${label}`]); console.log("Shiptorio runner stopped.");
} else if (action === "status") {
  const r = await launch(["print", `${domain}/${label}`], false);
  console.log(r.code ? "Shiptorio runner is not loaded." : r.out.split("\n").filter(l => /state =|pid =|last exit code/.test(l)).join("\n"));
} else throw new Error("Use install, stop or status");
