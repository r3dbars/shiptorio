import { expect, spyOn, test } from "bun:test";
import { makeSessionCookie, readSessionDetails } from "../src/session";

test("a concurrent browser-session burst shares one import while every cookie is independently verified", async () => {
  const secret = `synthetic-session-${crypto.randomUUID()}`;
  const original = crypto.subtle.importKey.bind(crypto.subtle);
  const imported = spyOn(crypto.subtle, "importKey");
  imported.mockImplementation((...args: any[]) => (original as any)(...args));
  try {
    const now = Date.now();
    const cookies = await Promise.all(Array.from({ length: 20 }, (_, i) => makeSessionCookie(secret, `player-${i}`, now, { sid: `sid-${i}`, uid: i + 1 })));
    const users = await Promise.all(cookies.map(cookie => readSessionDetails(secret, cookie.split(";")[0], now)));
    expect(imported).toHaveBeenCalledTimes(1);
    expect(users.map(user => user?.login)).toEqual(Array.from({ length: 20 }, (_, i) => `player-${i}`));
    const forged = cookies[0].split(";")[0].replace(/.$/, "!");
    expect(await readSessionDetails(secret, forged, now)).toBeNull();
    expect(await readSessionDetails(secret, cookies[0], now + 15 * 86400000)).toBeNull();
    expect(await readSessionDetails(`${secret}-rotated`, cookies[0], now)).toBeNull();
    expect(imported).toHaveBeenCalledTimes(2);
  } finally { imported.mockRestore(); }
});
