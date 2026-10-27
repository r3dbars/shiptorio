import { chmod, link, lstat, mkdir, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { randomBytes } from "node:crypto";
import { agentEnvironment } from "./policy";

const paths = (home: string) => ({ keychain: join(home, "Library/Keychains/shiptorio.keychain-db"), password: join(dirname(home), ".agent-keychain-password") });
async function regular(path: string) {
  const info = await lstat(path);
  if (!info.isFile() || await realpath(path) !== path) throw new Error("Dedicated Keychain files must not be links");
  await chmod(path, 0o600);
}
async function security(home: string, args: string[], secret?: string) {
  // Passwords go through security's stdin command parser, never argv, logs, or child environments.
  const child = Bun.spawn(["/usr/bin/security", ...(secret ? ["-i"] : args)], { env: agentEnvironment({}, home), stdin: "pipe", stdout: "pipe", stderr: "pipe" });
  child.stdin.write(secret ? `${args[0]} ${args.slice(1).map(a => JSON.stringify(a === "PASSWORD" ? secret : a)).join(" ")}\n` : "");
  child.stdin.end();
  const timer = setTimeout(() => child.kill(), 10000);
  try {
    const [out, err, code] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited]);
    if (code || /SecKeychain\w*:|error:|Usage:/i.test(err)) throw new Error(`Dedicated Keychain ${args[0]} failed`);
    return out;
  } finally { clearTimeout(timer); }
}
export async function unlockAgentKeychain(home: string): Promise<void> {
  if (process.platform !== "darwin") return;
  const { keychain, password } = paths(home);
  await regular(password); await regular(keychain);
  const secret = await readFile(password, "utf8");
  if (!/^[a-f0-9]{64}$/.test(secret)) throw new Error("Invalid dedicated Keychain password file");
  await security(home, ["unlock-keychain", "-p", "PASSWORD", keychain], secret);
}
/** HOME isolation also isolates macOS's Keychain preferences. Never point it at the user's login Keychain. */
export async function prepareAgentKeychain(home: string): Promise<void> {
  if (process.platform !== "darwin") return;
  for (const directory of [join(home, "Library"), join(home, "Library/Preferences"), join(home, "Library/Keychains")]) {
    await mkdir(directory, { recursive: true, mode: 0o700 });
    if (await realpath(directory) !== directory) throw new Error("Dedicated Keychain directories must not be links");
    await chmod(directory, 0o700);
  }
  const { keychain, password } = paths(home);
  if (!await Bun.file(password).exists()) {
    const temp = `${password}.${crypto.randomUUID()}`;
    try {
      await writeFile(temp, randomBytes(32).toString("hex"), { mode: 0o600, flag: "wx" });
      await link(temp, password).catch(error => { if (error.code !== "EEXIST") throw error; });
    } finally { await rm(temp, { force: true }); }
  }
  await regular(password);
  const secret = await readFile(password, "utf8");
  if (!/^[a-f0-9]{64}$/.test(secret)) throw new Error("Invalid dedicated Keychain password file");
  const existing = await lstat(keychain).catch(error => { if (error.code === "ENOENT") return null; throw error; });
  if (existing) await regular(keychain);
  else await security(home, ["create-keychain", "-p", "PASSWORD", keychain], secret);
  await regular(keychain);
  await security(home, ["list-keychains", "-d", "user", "-s", keychain]);
  await security(home, ["default-keychain", "-d", "user", "-s", keychain]);
  await security(home, ["set-keychain-settings", "-l", "-u", "-t", "1800", keychain]);
  await unlockAgentKeychain(home);
  if (!(await security(home, ["default-keychain", "-d", "user"])).includes(keychain)) throw new Error("Dedicated default Keychain did not persist");
}
