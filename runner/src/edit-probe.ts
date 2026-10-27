import { mkdtemp, mkdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { checkSandbox, type CheckSandbox } from "./sandbox";

const before = "export const answer = 1;\n";
const after = "export const answer = 2;\n";
export interface EditProbeContext {
  root: string; work: string; allowedPaths: string[];
  plan: string; files: { path: string; content: string }[];
  verification: CheckSandbox;
}
/** Run the production assembler on synthetic source; require exact bytes, not a self-report. */
export async function probeAssemblerEdit(assemble: (context: EditProbeContext) => Promise<void>) {
  const root = await mkdtemp(join(tmpdir(), "shiptorio-edit-doctor-"));
  const work = join(root, "checkout"), canary = join(root, "outside-canary.txt");
  let verification: CheckSandbox | undefined;
  try {
    await mkdir(work);
    await Bun.write(join(work, "example.ts"), before);
    await Bun.write(join(work, "unapproved.ts"), "export const keep = true;\n");
    await Bun.write(canary, "outside stays unchanged\n");
    // Initialize a fresh repository without any host hooks or configuration.
    verification = await checkSandbox(work);
    for (const args of [
      ["git", "init", "--initial-branch=main"], ["git", "add", "."],
      ["git", "-c", "user.name=Shiptorio doctor", "-c", "user.email=doctor@example.invalid", "commit", "-m", "disposable doctor fixture"],
    ]) if ((await verification.run(args, work)).code) throw new Error("Cannot prepare edit probe checkout");
    await assemble({ root, work, allowedPaths: ["example.ts"], files: [{ path: "example.ts", content: before }], verification,
      plan: "Change the exported answer constant in example.ts from 1 to 2. Preserve its trailing newline. This is a disposable diagnostic fixture, not a product build. Only example.ts is approved." });
    if (await readFile(join(work, "example.ts"), "utf8") !== after) throw new Error("Agent did not produce the required file edit");
    if (await readFile(join(work, "unapproved.ts"), "utf8") !== "export const keep = true;\n" || await readFile(canary, "utf8") !== "outside stays unchanged\n") throw new Error("Edit probe modified an unapproved file");
    const changed = await verification.run(["git", "diff", "HEAD", "--name-only", "--no-ext-diff"], work);
    const untracked = await verification.run(["git", "ls-files", "--others", "--exclude-standard"], work);
    if (changed.code || untracked.code || changed.out.trim() !== "example.ts" || untracked.out.trim()) throw new Error("Edit probe exceeded its approved scope");
    // Keep the filesystem proof explicit. A successful agent process without these bytes fails doctor.
    return { edited: "example.ts", before, after };
  } finally { await verification?.close(); await rm(root, { recursive: true, force: true }); }
}
