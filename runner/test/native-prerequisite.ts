import { test } from "bun:test";

interface Prerequisite {
  platform: string;
  ci: boolean;
  nested: boolean;
  bwrap: boolean;
  git: boolean;
}

/** Only absent local prerequisites may skip. A broken installed boundary must fail. */
export function nativePrerequisite(input: Prerequisite): { skip: boolean; reason?: string } {
  if (input.platform === "linux" && (!input.bwrap || !input.git)) {
    const missing = [!input.bwrap && "bubblewrap (bwrap)", !input.git && "git"].filter(Boolean).join(" and ");
    const reason = `Native runner tests require ${missing}. Install git and bubblewrap and enable unprivileged user namespaces.`;
    // Check this before the recursion guard: CI cannot hide missing coverage with an env flag.
    if (input.ci) throw new Error(`Mandatory real Linux boundary coverage is unavailable in CI. ${reason}`);
    return { skip: true, reason: `LOCAL PREREQUISITE SKIP: ${reason} Real boundary coverage was NOT executed.` };
  }
  return { skip: input.nested || !["darwin", "linux"].includes(input.platform) };
}

export const nativeBoundary = nativePrerequisite({
  platform: process.platform,
  ci: Boolean(process.env.CI),
  nested: process.env.SHIPTORIO_CHECK_SANDBOX === "1",
  bwrap: Boolean(Bun.which("bwrap")),
  git: Boolean(Bun.which("git")),
});
if (nativeBoundary.reason) console.warn(nativeBoundary.reason);
export const nativeTest = test.skipIf(nativeBoundary.skip);
