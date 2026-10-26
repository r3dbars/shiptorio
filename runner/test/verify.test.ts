import { expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { agentEnvironment } from "../src/policy";
import { testOutcome, verifyRegression } from "../src/verify";

test("verify evidence rejects empty, import and syntax failures instead of counting them as a repro", () => {
  expect(testOutcome({ code: 0, log: "0 pass\n0 fail" }).passed).toBe(false);
  expect(testOutcome({ code: 1, log: "Cannot find module ./missing\n0 pass\n1 fail" }).reproduced).toBe(false);
  expect(testOutcome({ code: 1, log: "SyntaxError\n0 pass\n1 fail" }).reproduced).toBe(false);
  expect(testOutcome({ code: 1, log: "Expected false, received true\n0 pass\n1 fail" }).reproduced).toBe(true);
});

test.skipIf(process.platform !== "darwin")("real test overlay fails on base and passes on head, while an already-green base is not proof", async () => {
  const work = await mkdtemp(join(tmpdir(), "shiptorio-verify-"));
  const env = agentEnvironment(process.env);
  const git = async (...args: string[]) => {
    const p = Bun.spawn(["git", ...args], { cwd: work, env, stdout: "pipe", stderr: "pipe" });
    const [out, err, code] = await Promise.all([new Response(p.stdout).text(), new Response(p.stderr).text(), p.exited]);
    if (code) throw new Error(err);
    return out.trim();
  };
  try {
    await git("init", "--initial-branch=main");
    await Bun.write(join(work, "value.ts"), "export const value = 1;\n");
    await Bun.write(join(work, "value.test.ts"), 'import {test,expect} from "bun:test";import {value} from "./value";test("value",()=>expect(value).toBe(1));\n');
    await git("add", ".");
    await git("-c", "user.name=Test", "-c", "user.email=test@example.invalid", "commit", "-m", "base");
    const base = await git("rev-parse", "HEAD");
    await Bun.write(join(work, "value.ts"), "export const value = 2;\n");
    await Bun.write(join(work, "value.test.ts"), 'import {test,expect} from "bun:test";import {value} from "./value";test("value",()=>expect(value).toBe(2));\n');
    const proof = await verifyRegression(work, base, ["value.ts", "value.test.ts"], env);
    expect(proof).toMatchObject({ failsOnBase: true, passesOnHead: true, baseSha: base });
    expect(proof.command).toContain("./value.test.ts");
    expect(proof.logTail).toContain("1 fail");
    expect(proof.logTail).toContain("1 pass");
    await git("add", ".");
    await git("-c", "user.name=Test", "-c", "user.email=test@example.invalid", "commit", "-m", "first fix");
    const firstFix = await git("rev-parse", "HEAD");
    await Bun.write(join(work, "value.ts"), "export const value = 3;\n");
    await Bun.write(join(work, "value.test.ts"), 'import {test,expect} from "bun:test";import {value} from "./value";test("value",()=>expect(value).toBe(3));\n');
    expect(await verifyRegression(work, base, ["value.test.ts"], env)).toMatchObject({ failsOnBase: true, passesOnHead: true });
    await git("add", ".");
    await git("-c", "user.name=Test", "-c", "user.email=test@example.invalid", "commit", "-m", "scar rework fix");
    expect(await git("rev-list", "--count", `${firstFix}..HEAD`)).toBe("1");
    expect(await git("rev-list", "--count", `${base}..HEAD`)).toBe("2");
    await Bun.write(join(work, "value.test.ts"), 'import {test,expect} from "bun:test";test("unrelated",()=>expect(true).toBe(true));\n');
    expect((await verifyRegression(work, base, ["value.test.ts"], env)).failsOnBase).toBe(false);
    expect((await git("status", "--short"))).toContain("value.test.ts");
  } finally { await rm(work, { recursive: true, force: true }); }
});
