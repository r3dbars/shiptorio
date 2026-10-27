import type { FactoryState } from "@shiptorio/shared";
import { starterLine } from "./engine";
import type { TreeEntry } from "./github";
import { layoutMap } from "./map";
import { githubStatus, type GitHubSourceEnv } from "./sources/github";

/** Pure fresh-state construction; the Factory owns access checks, IO and persistence. */
export function initialFactoryState(
  repo: string,
  tree: { branch: string; entries: TreeEntry[] },
  env: GitHubSourceEnv,
): FactoryState {
  return {
    repo,
    baseBranch: tree.branch,
    districts: layoutMap(tree.entries).zones,
    ...starterLine(),
    items: [],
    science: { red: 0, green: 0, grey: 0, blue: 0 },
    trust: 0.5,
    tick: 0,
    sources: [githubStatus(env)],
  };
}
