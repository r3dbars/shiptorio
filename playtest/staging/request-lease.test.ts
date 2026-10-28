import { expect, test } from "bun:test";
import { settleFixtureLease } from "./request-lease";

test("upgrade returns while durable lease release remains tracked, ordinary requests await it", async () => {
  const release = Promise.withResolvers<void>(), background: Promise<unknown>[] = [];
  let calls = 0;
  await settleFixtureLease(true, () => { calls++; return release.promise; }, { waitUntil: task => background.push(task) });
  expect(calls).toBe(1);
  expect(background).toHaveLength(1);
  let ordinarySettled = false;
  const ordinary = settleFixtureLease(false, () => release.promise, { waitUntil: () => { throw Error("ordinary release detached"); } }).then(() => { ordinarySettled = true; });
  await Promise.resolve();
  expect(ordinarySettled).toBe(false);
  release.resolve();
  await Promise.all([...background, ordinary]);
  expect(ordinarySettled).toBe(true);
});

test("failed cleanup remains consumed for both transport paths without a new release or reset", async () => {
  for (const upgraded of [false, true]) {
    let calls = 0;
    const background: Promise<unknown>[] = [];
    await settleFixtureLease(upgraded, async () => { calls++; throw Error("storage unavailable; provider lease still has its TTL"); }, { waitUntil: task => background.push(task) });
    await Promise.all(background);
    expect(calls).toBe(1);
    expect(background).toHaveLength(upgraded ? 1 : 0);
  }
});
