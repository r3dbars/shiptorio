/** Fetch only immutable approved commits, without default refs, tags, or history. */
export async function fetchApprovedSource(
  run: (args: string[], cwd?: string) => Promise<string>,
  directory: string,
  sourceUrl: string,
  commits: string[],
  bare = false,
): Promise<void> {
  if (!commits.length || commits.some(sha => !/^[a-f0-9]{40}$/.test(sha))) throw new Error("Invalid approved source commit");
  const approved = [...new Set(commits)];
  await run(["init", "--template=", ...(bare ? ["--bare"] : []), "--", directory]);
  await run(["fetch", "--depth=1", "--no-tags", "--no-recurse-submodules", "--", sourceUrl, ...approved], directory);
  for (const sha of approved) {
    if (await run(["rev-parse", "--verify", `${sha}^{commit}`], directory) !== sha) throw new Error("Approved source commit mismatch");
  }
}
