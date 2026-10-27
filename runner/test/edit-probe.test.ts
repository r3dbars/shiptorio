import { expect, test } from "bun:test";
import { probeAssemblerEdit } from "../src/edit-probe";
const supported = ["darwin", "linux"].includes(process.platform);
const osTest = test.skipIf(!supported || process.platform === "linux" && !Bun.which("bwrap"));
osTest("edit doctor proves exact file bytes through the real verification sandbox", async () => {
  const proof = await probeAssemblerEdit(async context => {
    expect(context.allowedPaths).toEqual(["example.ts"]);
    const result = await context.verification.run([process.execPath, "--no-env-file", "-e", 'await Bun.write("example.ts","export const answer = 2;\\n")'], context.work);
    expect(result.code).toBe(0);
  });
  expect(proof.after).toBe("export const answer = 2;\n");
});
osTest("a successful agent exit or 'done' summary without a file edit fails doctor", async () => {
  await expect(probeAssemblerEdit(async () => {})).rejects.toThrow("did not produce");
});
osTest("edit doctor rejects modified unapproved files and extra files", async () => {
  for (const file of ["unapproved.ts", "extra.ts"]) await expect(probeAssemblerEdit(async context => {
    await Bun.write(`${context.work}/example.ts`, "export const answer = 2;\n");
    await Bun.write(`${context.work}/${file}`, "not approved\n");
  })).rejects.toThrow(/unapproved|scope/);
});
osTest("edit doctor cleans its fixture after provider failures", async () => {
  let fixture = "";
  await expect(probeAssemblerEdit(async context => { fixture = context.root; throw new Error("provider unavailable"); })).rejects.toThrow("provider unavailable");
  expect(await Bun.file(`${fixture}/checkout/example.ts`).exists()).toBe(false);
});
