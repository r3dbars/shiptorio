import { mkdir, mkdtemp, realpath, rm, lstat } from "node:fs/promises";
import { resolve } from "node:path";

export async function jobWorkspace(root: string, id: string) {
  if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(id)) throw new Error("Invalid job UUID");
  const expected = resolve(await realpath(root), ".work");
  await mkdir(expected, { recursive: true, mode: 0o700 });
  if ((await lstat(expected)).isSymbolicLink() || await realpath(expected) !== expected) throw new Error("Runner work directory must not be a symlink");
  const directory = await mkdtemp(resolve(expected, `${id}-`));
  return { directory, work: resolve(directory, "checkout"), close: () => rm(directory, { recursive: true, force: true }) };
}
